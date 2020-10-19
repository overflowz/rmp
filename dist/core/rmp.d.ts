import { ICreateMessengerOptions, OnBroadcastCallback, OnRequestCallback } from './interface';
export declare class RMP {
    private readonly channel;
    private readonly adapter;
    private onRequestCallback?;
    private onBroadcastCallback?;
    private readonly messageStream$;
    private constructor();
    static create({ channel, broadcastChannels, adapter }: ICreateMessengerOptions): Promise<RMP>;
    private onMessage;
    private getMessageStream;
    private reply;
    broadcast<T>(payload: T): Promise<void>;
    request<T1 = unknown, T2 = unknown>(channel: string, payload: T1, timeoutMs?: number): Promise<T2>;
    onRequest(callback: OnRequestCallback): void;
    onBroadcast(callback: OnBroadcastCallback): void;
}
