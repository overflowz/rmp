import { ConnectOptions, OnBroadcastCallback, OnRequestCallback } from './interface';
export declare class RMP {
    private readonly channel;
    private readonly adapter;
    private onRequestCallback;
    private onBroadcastCallback;
    private onRequestSubscription?;
    private onBroadcastSubscription?;
    private readonly messageStream$;
    private constructor();
    static connect({ channel, subscribeTo, adapter }: ConnectOptions): Promise<RMP>;
    private onMessage;
    private getMessageStream;
    private reply;
    broadcast<T>(payload: T): Promise<void>;
    request<T1 = unknown, T2 = unknown>(channel: string, payload: T1, timeoutMs?: number): Promise<T2>;
    get onRequest(): OnRequestCallback;
    set onRequest(callback: OnRequestCallback);
    get onBroadcast(): OnBroadcastCallback;
    set onBroadcast(callback: OnBroadcastCallback);
}
