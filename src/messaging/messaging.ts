import debug from 'debug';
import { monotonicFactory } from 'ulid';
import { defer, Observable, Subject, combineLatest, of, throwError } from 'rxjs';
import { filter, first, map, mergeMap, share, timeoutWith } from 'rxjs/operators';

import {
  BroadcastPacket,
  IAdapter,
  ICreateMessengerOptions,
  OnBroadcastCallback,
  OnRequestCallback,
  Packet,
  PacketHeaders,
  PacketType,
  RequestPacket,
  ResponsePacket,
} from './interface';
import tryCatch from '~self/utils/tryCatch';

const DEBUG_NS = 'messaging:core';
const ULID = monotonicFactory();

export class Messenger {
  private onRequestCallback?: OnRequestCallback;

  private readonly messageStream$: Subject<{
    topic: string;
    packet: Packet<unknown>;
  }> = new Subject();

  private constructor(
    private readonly topic: string,
    private readonly adapter: IAdapter,
  ) {
    this.adapter.subClient.onMessage(this.onMessage.bind(this));
  }

  static async create({ topic, adapter }: ICreateMessengerOptions): Promise<Messenger> {
    const instance = new this(topic, adapter);

    await adapter.subClient.subscribe(topic);
    return instance;
  }

  private onMessage(topic: string, message: string): void {
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

    if (type === PacketType.Request && typeof headers?.responseTopic === 'undefined') {
      return void d('missing responseTopic in the request packet: %j', { packet });
    }

    this.messageStream$.next({ topic, packet });
  }

  private getMessageStream<T>(topic: string): Observable<Packet<T>> {
    return this.messageStream$.pipe(
      filter(message => message.topic === topic),
      map(message => message.packet as Packet<T>),
    );
  }

  private getRequestStream<T>(topic: string): Observable<RequestPacket<T>> {
    return this.getMessageStream<T>(topic).pipe(
      filter((packet): packet is RequestPacket<T> => packet.type === PacketType.Request),
      share(),
    );
  }

  private getBroadcastStream<T>(topic: string): Observable<BroadcastPacket<T>> {
    return this.getMessageStream<T>(topic).pipe(
      filter((packet): packet is BroadcastPacket<T> => packet.type === PacketType.Broadcast),
      share(),
    );
  }

  private async reply<T1, T2>(request: RequestPacket<T1>, payload: T2): Promise<void> {
    const d = debug(`${DEBUG_NS}:reply`);
    const { correlationId, responseTopic } = request.headers;

    const headers: PacketHeaders = {
      correlationId,
    };

    const packet: ResponsePacket<T2> = {
      type: PacketType.Response,
      headers,
      payload,
    };

    const publish = await tryCatch(
      () => this.adapter.pubClient.publish(responseTopic, JSON.stringify(packet))
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
      () => this.adapter.pubClient.publish(this.topic, JSON.stringify(packet)),
    );

    if (publish instanceof Error) {
      d('error publishing the packet: %j', { packet, publish });
      return Promise.reject(publish.origin);
    }

    return Promise.resolve();
  }

  request<T1 = unknown, T2 = unknown>(topic: string, payload: T1, timeoutMs?: number): Promise<T2> {
    const d = debug(`${DEBUG_NS}:request`);
    const correlationId = ULID();

    const headers: PacketHeaders = {
      correlationId,
      responseTopic: this.topic,
    };

    const packet: Packet<T1> = {
      type: PacketType.Request,
      headers,
      payload,
    };

    const sendMessage$ = defer(async () => {
      const publish = await tryCatch(
        () => this.adapter.pubClient.publish(topic, JSON.stringify(packet))
      );

      if (publish instanceof Error) {
        d('error publishing the packet: %j', { publish, packet });
        return Promise.reject(publish.origin);
      }

      return Promise.resolve();
    });

    return combineLatest([
      this.getMessageStream<T2>(this.topic),
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

    this.getRequestStream(this.topic).pipe(
      mergeMap(req => combineLatest([
        of(req),
        defer(async () => callback(req.payload)),
      ])),
      mergeMap(([req, res]) => defer(async () => this.reply(req, res))),
    ).subscribe();
  }

  onBroadcast(topic: string, callback: OnBroadcastCallback): void {
    const d = debug(`${DEBUG_NS}:onBroadcast`);

    const subscribe$ = defer(async () => {
      const subscription = await tryCatch(() => this.adapter.subClient.subscribe(topic));

      if (subscription instanceof Error) {
        d('error publishing the packet: %j', { subscription });
        return Promise.reject(subscription.origin);
      }

      return Promise.resolve();
    });

    return void subscribe$.pipe(
      mergeMap(_ => this.getBroadcastStream(topic)),
      map(req => req.payload),
    ).subscribe(callback);
  }
}
