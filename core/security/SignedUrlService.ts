import crypto from "crypto";
import { PublicError } from "../middleware/publicErrorHandler.js";

export interface SignedAssetAccess {
    assetId: string;
    expiresAt: number;
    accessType: "signed";
}

export class SignedUrlService {
    constructor(private secret: string) {}

    sign(assetId: string, expires: number): string {
        const payload = `${assetId}:${expires}`;
        return crypto 
            .createHmac("sha256", this.secret)
            .update(payload)
            .digest("hex");
    }

    verifyOrThrow(
        assetId: string,
        expires: number,
        sig: string
    ): SignedAssetAccess {
        if(Date.now() > expires * 1000) {throw new PublicError("signed url expired")};
        
        const expected = this.sign(assetId, expires);

        if(!crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(sig)
        )) {
            throw new PublicError("invalid signed URL siganture")
        }

        return {
            assetId,
            expiresAt: expires,
            accessType: "signed"
        };
    }
}