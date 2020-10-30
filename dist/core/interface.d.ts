export declare type OnMessageCallback = (channel: string, message: string) => void;
export declare type OnRequestCallback = (channel: string, message: unknown) => unknown | Promise<unknown>;
export declare type OnBroadcastCallback = (channel: string, message: unknown) => void | Promise<void>;
export declare type PacketHeaders = {
    correlationId: string;
    responseChannel?: string;
    isErrorResponse?: boolean;
};
export declare enum PacketType {
    Request = 0,
    Response = 1,
    Broadcast = 2
}
export declare type Packet<T = unknown> = {
    type: PacketType;
    headers: PacketHeaders;
    payload: T;
};
export declare type RequestPacket<T = unknown> = Packet<T> & {
    type: PacketType.Request;
    headers: Packet<T>['headers'] & {
        responseChannel: string;
    };
};
export declare type ResponsePacket<T = unknown> = Packet<T> & {
    type: PacketType.Response;
};
export declare type BroadcastPacket<T = unknown> = Packet<T> & {
    type: PacketType.Broadcast;
};
export interface IPubClient {
    publish(channel: string, message: string): Promise<void>;
}
export interface ISubClient {
    subscribe(channel: string): Promise<void>;
    onMessage(callback: OnMessageCallback): void;
}
export interface IAdapter {
    pubClient: IPubClient;
    subClient: ISubClient;
}
export declare type ConnectOptions = {
    channel: string;
    subscribeTo?: string[];
    adapter: IAdapter;
};
