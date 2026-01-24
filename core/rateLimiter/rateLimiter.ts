type Bucket = {
    count: number;
    resetAt: number;
};

export class RateLimiter {
    private buckets = new Map<string, Bucket>();

    constructor(
        private windowMs: number,
        private max: number
    ) { }

    check(key: string): boolean {
        const now = Date.now();
        const bucket = this.buckets.get(key);

        if (!bucket || bucket.resetAt < now) {
            this.buckets.set(key, {
                count: 1,
                resetAt: now + this.windowMs
            });
            return true;
        }

        if (bucket.count >= this.max) {
            return false;
        }

        bucket.count++;
        return true;
    }
}
