import crypto from "crypto";

export class SignedUrlService {
    constructor(private secret: string) {}

    sign(assetId: string, expires: number): string {
        const payload = `${assetId}:${expires}`;
        return crypto 
            .createHmac("sha256", this.secret)
            .update(payload)
            .digest("hex");
    }

    verify(assetId: string, expires: number, sig: string): boolean {
        if(Date.now() > expires * 1000) return false;
        return this.sign(assetId, expires) === sig;
    }
}