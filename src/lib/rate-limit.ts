import { LRUCache } from 'lru-cache';

export function rateLimit({
  interval,
  uniqueTokenPerInterval = 500,
}: {
  interval: number;
  uniqueTokenPerInterval?: number;
}) {
  const tokenCache = new LRUCache({
    max: uniqueTokenPerInterval,
    ttl: interval,
  });

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = (tokenCache.get(token) as number[]) || [0];
        if (tokenCount[0] === 0) {
          tokenCache.set(token, tokenCount);
        }
        tokenCount[0] += 1;

        const currentUsage = tokenCount[0];
        const isRateLimited = currentUsage >= limit;
        
        if (isRateLimited) {
          reject();
        } else {
          resolve();
        }
      }),
  };
} 