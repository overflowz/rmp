import TryCatchError from '~self/errors/TryCatchError';

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
