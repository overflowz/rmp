export type OnMessageCallback = (channel: string, message: string) => void;
export type OnRequestCallback = (channel: string, message: unknown) => unknown | Promise<unknown>;
export type OnBroadcastCallback = (channel: string, message: unknown) => void | Promise<void>;

export type PacketHeaders = {
  correlationId: string;
  responseChannel?: string;
};

export enum PacketType {
  Request,
  Response,
  Broadcast,
}

export type Packet<T = unknown> = {
  type: PacketType;
  headers: PacketHeaders;
  payload: T;
};

export type RequestPacket<T = unknown> = Packet<T> & {
  type: PacketType.Request;
  headers: Packet<T>['headers'] & {
    responseChannel: string;
  };
};

export type ResponsePacket<T = unknown> = Packet<T> & {
  type: PacketType.Response;
};

export type BroadcastPacket<T = unknown> = Packet<T> & {
  type: PacketType.Broadcast;
};

export interface IPubClient {
  publish(channel: string, message: string): Promise<void>;
};

export interface ISubClient {
  subscribe(channel: string): Promise<void>;
  onMessage(callback: OnMessageCallback): void;
};

export interface IAdapter {
  pubClient: IPubClient;
  subClient: ISubClient;
}

export type ConnectOptions = {
  channel: string;
  subscribeTo?: string[];
  adapter: IAdapter;
};
