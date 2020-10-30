export default class TryCatchError extends Error {
  public readonly origin?: any;

  constructor(message: string, origin?: any) {
    super(message);

    this.name = 'TryCatchError';

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this);
    }
  }

  static from(err: Error): TryCatchError {
    return new TryCatchError(err.message, err);
  }
}
