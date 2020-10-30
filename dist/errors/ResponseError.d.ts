export default class ResponseError extends Error {
    constructor(message: string);
    static from(err: Error): ResponseError;
}
