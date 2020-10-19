export declare class TryCatchError extends Error {
    readonly origin: any;
    constructor(message: string, origin: any);
    static from(err: Error): TryCatchError;
}
declare const tryCatch: <T>(fn: () => T) => TryCatchError | T;
export default tryCatch;
