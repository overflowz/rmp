export default class TryCatchError extends Error {
    readonly origin?: any;
    constructor(message: string, origin?: any);
    static from(err: Error): TryCatchError;
}
