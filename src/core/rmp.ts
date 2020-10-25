import debug from 'debug';
import { monotonicFactory } from 'ulid';
import { defer, Observable, Subject, combineLatest, of, throwError } from 'rxjs';
import { filter, first, map, mergeMap, tap, timeoutWith } from 'rxjs/operators';

import {
  BroadcastPacket,
  IAdapter,
  IConnectOptions,
  OnBroadcastCallback,
  OnRequestCallback,
  Packet,
  PacketHeaders,
  PacketType,
  RequestPacket,
  ResponsePacket,
} from './interface';
import tryCatch from '~self/utils/tryCatch';

const DEBUG_NS = '@overflowz/rmp:core';
const ULID = monotonicFactory();

export class RMP {
  private onRequestCallback?: OnRequestCallback;
  private onBroadcastCallback?: OnBroadcastCallback;

  private readonly messageStream$: Subject<{
    channel: string;
    packet: Packet<unknown>;
  }> = new Subject();

  private constructor(
    private readonly channel: string,
    private readonly adapter: IAdapter,
  ) {
    this.adapter.subClient.onMessage(this.onMessage.bind(this));
  }

  static async connect({ channel, broadcastChannels, adapter }: IConnectOptions): Promise<RMP> {
    const instance = new this(channel, adapter);

    const channelsUniq = [...new Set([channel, ...broadcastChannels ?? []])];
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
    };

    const packet: ResponsePacket<T2> = {
      type: PacketType.Response,
      headers,
      payload,
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

    return combineLatest([
      this.getMessageStream<T2>(this.channel),
      sendMessage$,
    ]).pipe(
      timeoutWith(timeoutMs ?? 30000, throwError(new Error('ERROR_REQUEST_TIMEOUT'))),
      map(([packet]) => packet),
      filter(
        (packet: Packet<T2>): packet is ResponsePacket<T2> =>
          packet.type === PacketType.Response && packet.headers.correlationId === correlationId,
      ),
      first(),
      map(packet => packet.payload),
    ).toPromise();
  }

  onRequest(callback: OnRequestCallback): void {
    if (typeof this.onRequestCallback !== 'undefined') {
      throw new Error('cannot call onRequest more than once');
    }

    this.onRequestCallback = callback;

    this.getMessageStream(this.channel).pipe(
      filter((packet): packet is RequestPacket => packet.type === PacketType.Request),
      mergeMap(req => combineLatest([
        of(req),
        defer(async () => this.onRequestCallback?.(this.channel, req.payload)),
      ])),
      mergeMap(([req, res]) => defer(async () => tryCatch(() => this.reply(req, res)))),
    ).subscribe();
  }

  onBroadcast(callback: OnBroadcastCallback): void {
    if (typeof this.onBroadcastCallback !== 'undefined') {
      throw new Error('cannot call onBroadcast more than once');
    }

    this.onBroadcastCallback = callback;

    return void this.messageStream$.pipe(
      filter(f => f.packet.type === PacketType.Broadcast),
      tap(({ channel, packet }) => this.onBroadcastCallback?.(channel, packet.payload)),
    ).subscribe();
  }
}
