/* eslint-disable lines-between-class-members, @typescript-eslint/no-explicit-any */

export class TryCatchError extends Error {
  public readonly origin: any;

  constructor(message: string, origin: any) {
    super(message);

    this.name = 'TryCatchError';
    this.origin = origin;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this);
    }
  }

  static from(err: Error): TryCatchError {
    return new TryCatchError(err.message, err);
  }
}

const tryCatch = <T>(fn: () => T): T | TryCatchError => {
  try {
    const res: any = fn();

    return typeof res?.then === 'function'
      ? res.catch((err: any) => TryCatchError.from(
        err instanceof Error ? err : new Error(err)),
      )
      : res;
  } catch (err) {
    return TryCatchError.from(
      err instanceof Error ? err : new Error(err),
    );
  }
};

export default tryCatch;
