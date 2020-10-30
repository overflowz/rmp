import debug from 'debug';
import { monotonicFactory } from 'ulid';
import { serializeError, deserializeError, ErrorObject } from 'serialize-error';
import { defer, Observable, Subject, combineLatest, of, throwError, Subscription } from 'rxjs';
import { filter, first, map, mergeMap, tap, timeoutWith } from 'rxjs/operators';

import tryCatch, { TryCatchError } from '~self/utils/tryCatch';
import {
  BroadcastPacket,
  IAdapter,
  ConnectOptions,
  OnBroadcastCallback,
  OnRequestCallback,
  Packet,
  PacketHeaders,
  PacketType,
  RequestPacket,
  ResponsePacket,
} from './interface';

const DEBUG_NS = '@overflowz/rmp:core';
const ULID = monotonicFactory();

export class RMP {
  private onRequestCallback: OnRequestCallback = () => void 0;
  private onBroadcastCallback: OnBroadcastCallback = () => void 0;

  private onRequestSubscription?: Subscription;
  private onBroadcastSubscription?: Subscription;

  private readonly messageStream$: Subject<{
    channel: string;
    packet: Packet<unknown>;
  }> = new Subject();

  private constructor(
    private readonly channel: string,
    private readonly adapter: IAdapter,
  ) {
    this.onMessage = this.onMessage.bind(this);

    this.request = this.request.bind(this);
    this.broadcast = this.broadcast.bind(this);
    this.onRequest = this.onRequest.bind(this);
    this.onBroadcast = this.onBroadcast.bind(this);

    this.adapter.subClient.onMessage(this.onMessage);
  }

  static async connect({ channel, subscribeTo, adapter }: ConnectOptions): Promise<RMP> {
    const instance = new this(channel, adapter);

    const channelsUniq = [...new Set([channel, ...subscribeTo ?? []])];
    await Promise.all(
      channelsUniq.map((channel) => adapter.subClient.subscribe(channel)),
    );

    return instance;
  }

  private onMessage(channel: string, message: string): void {
    const d = debug(`${DEBUG_NS}:onMessage`);

    const packet = tryCatch<Packet>(() => JSON.parse(message));
    if (packet instanceof Error) {
      return void d('unable to parse the packet: %j', { packet });
    }

    const { type, headers } = packet;
    if (typeof PacketType[type] === 'undefined') {
      return void d(`invalid packet type (${type}) received: %j`, { packet, type });
    }

    if (typeof headers?.correlationId === 'undefined') {
      return void d('missing correlationId in the packet header: %j', { packet });
    }

    if (type === PacketType.Request && typeof headers?.responseChannel === 'undefined') {
      return void d('missing responseChannel in the request packet: %j', { packet });
    }

    if (type === PacketType.Broadcast && channel === this.channel) {
      return void d('ignoring the own broadcast message');
    }

    this.messageStream$.next({ channel, packet });
  }

  private getMessageStream<T>(channel: string): Observable<Packet<T>> {
    return this.messageStream$.pipe(
      filter(message => message.channel === channel),
      map(message => message.packet as Packet<T>),
    );
  }

  private async reply<T1, T2>(request: RequestPacket<T1>, payload: T2): Promise<void> {
    const d = debug(`${DEBUG_NS}:reply`);
    const { correlationId, responseChannel } = request.headers;

    const headers: PacketHeaders = {
      correlationId,
      isErrorResponse: payload instanceof Error,
    };

    const packet: ResponsePacket<T2 | ErrorObject> = {
      type: PacketType.Response,
      headers,
      payload: payload instanceof TryCatchError
        ? serializeError(payload.origin ?? payload)
        : payload instanceof Error
          ? serializeError(payload)
          : payload,
    };

    const publish = await tryCatch(
      () => this.adapter.pubClient.publish(responseChannel, JSON.stringify(packet))
    );

    if (publish instanceof Error) {
      d('error publishing the packet: %j', { packet, publish });
      return Promise.reject(publish.origin);
    }

    return Promise.resolve();
  }

  async broadcast<T>(payload: T): Promise<void> {
    const d = debug(`${DEBUG_NS}:broadcast`);

    const headers: PacketHeaders = {
      correlationId: ULID(),
    };

    const packet: BroadcastPacket<T> = {
      type: PacketType.Broadcast,
      headers,
      payload,
    };

    const publish = await tryCatch(
      () => this.adapter.pubClient.publish(this.channel, JSON.stringify(packet)),
    );

    if (publish instanceof Error) {
      d('error publishing the packet: %j', { packet, publish });
      return Promise.reject(publish.origin);
    }

    return Promise.resolve();
  }

  request<T1 = unknown, T2 = unknown>(channel: string, payload: T1, timeoutMs?: number): Promise<T2> {
    const d = debug(`${DEBUG_NS}:request`);
    const correlationId = ULID();

    const headers: PacketHeaders = {
      correlationId,
      responseChannel: this.channel,
    };

    const packet: Packet<T1> = {
      type: PacketType.Request,
      headers,
      payload,
    };

    const sendMessage$ = defer(async () => {
      const publish = await tryCatch(
        () => this.adapter.pubClient.publish(channel, JSON.stringify(packet))
      );

      if (publish instanceof Error) {
        d('error publishing the packet: %j', { publish, packet });
        return Promise.reject(publish.origin);
      }

      return Promise.resolve();
    });

    return of(null).pipe(
      timeoutWith(timeoutMs ?? 30000, throwError(new Error('ERROR_REQUEST_TIMEOUT'))),
      mergeMap(() => combineLatest([
        this.getMessageStream<T2>(this.channel).pipe(
          filter(
            (packet: Packet<T2>): packet is ResponsePacket<T2> =>
              packet.type === PacketType.Response && packet.headers.correlationId === correlationId,
          ),
        ),
        sendMessage$,
      ])),
      map(([packet]) => packet),
      first(),
      mergeMap(packet => packet.headers.isErrorResponse ? throwError(deserializeError(packet.payload)) : of(packet)),
      map(packet => packet.payload),
    ).toPromise();
  }

  get onRequest(): OnRequestCallback {
    return this.onRequestCallback;
  }

  set onRequest(callback: OnRequestCallback) {
    this.onRequestCallback = callback;

    this.onRequestSubscription?.unsubscribe();
    this.onRequestSubscription = this.getMessageStream(this.channel).pipe(
      filter((packet): packet is RequestPacket => packet.type === PacketType.Request),
      mergeMap(req => combineLatest([
        of(req),
        defer(async () => tryCatch(() => this.onRequestCallback?.(this.channel, req.payload))),
      ])),
      mergeMap(([req, res]) => defer(async () => tryCatch(() => this.reply(req, res)))),
    ).subscribe();
  }

  get onBroadcast(): OnBroadcastCallback {
    return this.onBroadcastCallback;
  }

  set onBroadcast(callback: OnBroadcastCallback) {
    this.onBroadcastCallback = callback;

    this.onBroadcastSubscription?.unsubscribe();
    this.onBroadcastSubscription = this.messageStream$.pipe(
      filter(f => f.packet.type === PacketType.Broadcast),
      tap(({ channel, packet }) => this.onBroadcastCallback?.(channel, packet.payload)),
    ).subscribe();
  }
}
