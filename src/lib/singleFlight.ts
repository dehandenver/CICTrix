const inFlightRequests = new Map<string, Promise<unknown>>();
const recentResults = new Map<string, { value: unknown; expiresAt: number }>();

export const runSingleFlight = <T>(key: string, factory: () => Promise<T>, ttlMs = 1000): Promise<T> => {
  const now = Date.now();
  const cached = recentResults.get(key);

  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value as T);
  }

  const active = inFlightRequests.get(key);
  if (active) {
    return active as Promise<T>;
  }

  const promise = factory()
    .then((value) => {
      recentResults.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise);
  return promise;
};