export default class ResponseError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'ResponseError';

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this);
    }
  }

  static from(err: Error): ResponseError {
    return new ResponseError(err.message);
  }
}
