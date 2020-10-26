"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RMP = void 0;
const debug_1 = __importDefault(require("debug"));
const ulid_1 = require("ulid");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const interface_1 = require("./interface");
const tryCatch_1 = __importDefault(require("~self/utils/tryCatch"));
const DEBUG_NS = '@overflowz/rmp:core';
const ULID = ulid_1.monotonicFactory();
class RMP {
    constructor(channel, adapter) {
        this.channel = channel;
        this.adapter = adapter;
        this.messageStream$ = new rxjs_1.Subject();
        this.adapter.subClient.onMessage(this.onMessage.bind(this));
    }
    static async connect({ channel, subscribeTo, adapter }) {
        const instance = new this(channel, adapter);
        const channelsUniq = [...new Set([channel, ...subscribeTo ?? []])];
        await Promise.all(channelsUniq.map((channel) => adapter.subClient.subscribe(channel)));
        return instance;
    }
    onMessage(channel, message) {
        const d = debug_1.default(`${DEBUG_NS}:onMessage`);
        const packet = tryCatch_1.default(() => JSON.parse(message));
        if (packet instanceof Error) {
            return void d('unable to parse the packet: %j', { packet });
        }
        const { type, headers } = packet;
        if (typeof interface_1.PacketType[type] === 'undefined') {
            return void d(`invalid packet type (${type}) received: %j`, { packet, type });
        }
        if (typeof headers?.correlationId === 'undefined') {
            return void d('missing correlationId in the packet header: %j', { packet });
        }
        if (type === interface_1.PacketType.Request && typeof headers?.responseChannel === 'undefined') {
            return void d('missing responseChannel in the request packet: %j', { packet });
        }
        if (type === interface_1.PacketType.Broadcast && channel === this.channel) {
            return void d('ignoring the own broadcast message');
        }
        this.messageStream$.next({ channel, packet });
    }
    getMessageStream(channel) {
        return this.messageStream$.pipe(operators_1.filter(message => message.channel === channel), operators_1.map(message => message.packet));
    }
    async reply(request, payload) {
        const d = debug_1.default(`${DEBUG_NS}:reply`);
        const { correlationId, responseChannel } = request.headers;
        const headers = {
            correlationId,
        };
        const packet = {
            type: interface_1.PacketType.Response,
            headers,
            payload,
        };
        const publish = await tryCatch_1.default(() => this.adapter.pubClient.publish(responseChannel, JSON.stringify(packet)));
        if (publish instanceof Error) {
            d('error publishing the packet: %j', { packet, publish });
            return Promise.reject(publish.origin);
        }
        return Promise.resolve();
    }
    async broadcast(payload) {
        const d = debug_1.default(`${DEBUG_NS}:broadcast`);
        const headers = {
            correlationId: ULID(),
        };
        const packet = {
            type: interface_1.PacketType.Broadcast,
            headers,
            payload,
        };
        const publish = await tryCatch_1.default(() => this.adapter.pubClient.publish(this.channel, JSON.stringify(packet)));
        if (publish instanceof Error) {
            d('error publishing the packet: %j', { packet, publish });
            return Promise.reject(publish.origin);
        }
        return Promise.resolve();
    }
    request(channel, payload, timeoutMs) {
        const d = debug_1.default(`${DEBUG_NS}:request`);
        const correlationId = ULID();
        const headers = {
            correlationId,
            responseChannel: this.channel,
        };
        const packet = {
            type: interface_1.PacketType.Request,
            headers,
            payload,
        };
        const sendMessage$ = rxjs_1.defer(async () => {
            const publish = await tryCatch_1.default(() => this.adapter.pubClient.publish(channel, JSON.stringify(packet)));
            if (publish instanceof Error) {
                d('error publishing the packet: %j', { publish, packet });
                return Promise.reject(publish.origin);
            }
            return Promise.resolve();
        });
        return rxjs_1.combineLatest([
            this.getMessageStream(this.channel),
            sendMessage$,
        ]).pipe(operators_1.timeoutWith(timeoutMs ?? 30000, rxjs_1.throwError(new Error('ERROR_REQUEST_TIMEOUT'))), operators_1.map(([packet]) => packet), operators_1.filter((packet) => packet.type === interface_1.PacketType.Response && packet.headers.correlationId === correlationId), operators_1.first(), operators_1.map(packet => packet.payload)).toPromise();
    }
    onRequest(callback) {
        if (typeof this.onRequestCallback !== 'undefined') {
            throw new Error('cannot call onRequest more than once');
        }
        this.onRequestCallback = callback;
        this.getMessageStream(this.channel).pipe(operators_1.filter((packet) => packet.type === interface_1.PacketType.Request), operators_1.mergeMap(req => rxjs_1.combineLatest([
            rxjs_1.of(req),
            rxjs_1.defer(async () => this.onRequestCallback?.(this.channel, req.payload)),
        ])), operators_1.mergeMap(([req, res]) => rxjs_1.defer(async () => tryCatch_1.default(() => this.reply(req, res))))).subscribe();
    }
    onBroadcast(callback) {
        if (typeof this.onBroadcastCallback !== 'undefined') {
            throw new Error('cannot call onBroadcast more than once');
        }
        this.onBroadcastCallback = callback;
        return void this.messageStream$.pipe(operators_1.filter(f => f.packet.type === interface_1.PacketType.Broadcast), operators_1.tap(({ channel, packet }) => this.onBroadcastCallback?.(channel, packet.payload))).subscribe();
    }
}
exports.RMP = RMP;
//# sourceMappingURL=rmp.js.map