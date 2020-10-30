import TryCatchError from '~self/errors/TryCatchError';
declare const tryCatch: <T>(fn: () => T) => TryCatchError | T;
export default tryCatch;
