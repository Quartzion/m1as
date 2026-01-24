import { RateLimiter } from "../../core/rateLimiter/rateLimiter.js";
import { HttpError } from "../../core/http/HttpError.js";
import { m1asConfig } from "../../config/m1asConfig.js";

export function createRateLimit({
    max,
    windowMs,
    keyFn
}: {
    max: number;
    windowMs: number;
    keyFn: (req: any) => string;
}) {
    const limiter = new RateLimiter(windowMs, max);

    return (req: any, _res: any, next: any) => {
        if (!m1asConfig.rateLimit.enabled) return next();

        const key = keyFn(req);

        if (!limiter.check(key)) {

            return next(new HttpError(429, "Rate limit exceeded"));
        }

        next();
    };

}
