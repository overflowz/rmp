import debug from 'debug';
import { monotonicFactory } from 'ulid';
import { defer, Subject, combineLatest, of, throwError } from 'rxjs';
import { filter, first, map, mergeMap, tap, timeoutWith } from 'rxjs/operators';
import { PacketType, } from './interface';
import tryCatch from '~self/utils/tryCatch';
const DEBUG_NS = '@overflowz/rmp:core';
const ULID = monotonicFactory();
export class RMP {
    constructor(channel, adapter) {
        this.channel = channel;
        this.adapter = adapter;
        this.messageStream$ = new Subject();
        this.adapter.subClient.onMessage(this.onMessage.bind(this));
    }
    static async create({ channel, broadcastChannels, adapter }) {
        const instance = new this(channel, adapter);
        const channelsUniq = [...new Set([channel, ...broadcastChannels ?? []])];
        await Promise.all(channelsUniq.map((channel) => adapter.subClient.subscribe(channel)));
        return instance;
    }
    onMessage(channel, message) {
        const d = debug(`${DEBUG_NS}:onMessage`);
        const packet = tryCatch(() => JSON.parse(message));
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
    getMessageStream(channel) {
        return this.messageStream$.pipe(filter(message => message.channel === channel), map(message => message.packet));
    }
    async reply(request, payload) {
        const d = debug(`${DEBUG_NS}:reply`);
        const { correlationId, responseChannel } = request.headers;
        const headers = {
            correlationId,
        };
        const packet = {
            type: PacketType.Response,
            headers,
            payload,
        };
        const publish = await tryCatch(() => this.adapter.pubClient.publish(responseChannel, JSON.stringify(packet)));
        if (publish instanceof Error) {
            d('error publishing the packet: %j', { packet, publish });
            return Promise.reject(publish.origin);
        }
        return Promise.resolve();
    }
    async broadcast(payload) {
        const d = debug(`${DEBUG_NS}:broadcast`);
        const headers = {
            correlationId: ULID(),
        };
        const packet = {
            type: PacketType.Broadcast,
            headers,
            payload,
        };
        const publish = await tryCatch(() => this.adapter.pubClient.publish(this.channel, JSON.stringify(packet)));
        if (publish instanceof Error) {
            d('error publishing the packet: %j', { packet, publish });
            return Promise.reject(publish.origin);
        }
        return Promise.resolve();
    }
    request(channel, payload, timeoutMs) {
        const d = debug(`${DEBUG_NS}:request`);
        const correlationId = ULID();
        const headers = {
            correlationId,
            responseChannel: this.channel,
        };
        const packet = {
            type: PacketType.Request,
            headers,
            payload,
        };
        const sendMessage$ = defer(async () => {
            const publish = await tryCatch(() => this.adapter.pubClient.publish(channel, JSON.stringify(packet)));
            if (publish instanceof Error) {
                d('error publishing the packet: %j', { publish, packet });
                return Promise.reject(publish.origin);
            }
            return Promise.resolve();
        });
        return combineLatest([
            this.getMessageStream(this.channel),
            sendMessage$,
        ]).pipe(timeoutWith(timeoutMs ?? 30000, throwError(new Error('ERROR_REQUEST_TIMEOUT'))), map(([packet]) => packet), filter((packet) => packet.type === PacketType.Response && packet.headers.correlationId === correlationId), first(), map(packet => packet.payload)).toPromise();
    }
    onRequest(callback) {
        if (typeof this.onRequestCallback !== 'undefined') {
            throw new Error('cannot call onRequest more than once');
        }
        this.onRequestCallback = callback;
        this.getMessageStream(this.channel).pipe(filter((packet) => packet.type === PacketType.Request), mergeMap(req => combineLatest([
            of(req),
            defer(async () => this.onRequestCallback?.(this.channel, req.payload)),
        ])), mergeMap(([req, res]) => defer(async () => tryCatch(() => this.reply(req, res))))).subscribe();
    }
    onBroadcast(callback) {
        if (typeof this.onBroadcastCallback !== 'undefined') {
            throw new Error('cannot call onBroadcast more than once');
        }
        this.onBroadcastCallback = callback;
        return void this.messageStream$.pipe(filter(f => f.packet.type === PacketType.Broadcast), tap(({ channel, packet }) => this.onBroadcastCallback?.(channel, packet.payload))).subscribe();
    }
}
//# sourceMappingURL=rmp.js.map