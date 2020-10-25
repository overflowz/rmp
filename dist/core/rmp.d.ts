import { IConnectOptions, OnBroadcastCallback, OnRequestCallback } from './interface';
export declare class RMP {
    private readonly channel;
    private readonly adapter;
    private onRequestCallback?;
    private onBroadcastCallback?;
    private readonly messageStream$;
    private constructor();
    static connect({ channel, broadcastChannels, adapter }: IConnectOptions): Promise<RMP>;
    private onMessage;
    private getMessageStream;
    private reply;
    broadcast<T>(payload: T): Promise<void>;
    request<T1 = unknown, T2 = unknown>(channel: string, payload: T1, timeoutMs?: number): Promise<T2>;
    onRequest(callback: OnRequestCallback): void;
    onBroadcast(callback: OnBroadcastCallback): void;
}
