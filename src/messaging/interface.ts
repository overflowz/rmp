export type OnMessageCallback = (topic: string, message: string) => void;
export type OnRequestCallback = (payload: unknown) => unknown | Promise<unknown>;
export type OnBroadcastCallback = (payload: unknown) => void | Promise<void>;

export type PacketHeaders = {
  correlationId: string;
  responseTopic?: string;
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
    responseTopic: string;
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

export type ICreateMessengerOptions = {
  topic: string;
  adapter: IAdapter;
};
