/* eslint-disable lines-between-class-members, @typescript-eslint/no-explicit-any */
export class TryCatchError extends Error {
    constructor(message, origin) {
        super(message);
        this.name = 'TryCatchError';
        this.origin = origin;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this);
        }
    }
    static from(err) {
        return new TryCatchError(err.message, err);
    }
}
const tryCatch = (fn) => {
    try {
        const res = fn();
        return typeof res?.then === 'function'
            ? res.catch((err) => TryCatchError.from(err instanceof Error ? err : new Error(err)))
            : res;
    }
    catch (err) {
        return TryCatchError.from(err instanceof Error ? err : new Error(err));
    }
};
export default tryCatch;
//# sourceMappingURL=tryCatch.js.map