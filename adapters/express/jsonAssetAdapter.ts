import { AssetHttpAdapter } from "../AssetHttpAdapter.js";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js";

export class JsonAssetAdapter implements AssetHttpAdapter {
    constructor(
        private options: {
            assetManager: AssetManager;
            getOwnerId?: (req: any) => string | undefined;
        }
    ) { }
    getMetadata(req: any, res: any): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getFile(req: any, res: any): Promise<void> {
        throw new Error("Method not implemented.");
    }
    delete(req: any, res: any): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private ownerId(req: any): string | undefined {
        return (
            this.options.getOwnerId?.(req) ??
            req.header?.("m1as-user-id")
        );
    }

    private safeHandler =
        (fn: (req: any, res: any) => Promise<void>) =>
            async (req: any, res: any) => {
                try {
                    await fn(req, res);
                } catch (err) {
                    console.error("HTTP handler error:", err);
                    res.status(500).json({ error: "Internal server error" });
                }
            };

    async upload(req: any, res: any) {
        await this.safeHandler(async (req, res) => {
            const ownerId = this.ownerId(req);
            if (!ownerId) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const allowedFields = ["filename", "mimeType", "visibility", "data"];
            const bodyKeys = Object.keys(req.body ?? {});
            const unexpected = bodyKeys.filter(k => !allowedFields.includes(k));

            if (unexpected.length) {
                return res.status(400).json({
                    error: `Unexpected fields: ${unexpected.join(", ")}`
                });
            }

            const { filename, mimeType, visibility, data } = req.body;

            if (!data || typeof data !== "string") {
                return res.status(400).json({ error: "Base64 data is required" });
            }

            if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
                return res.status(400).json({ error: "Invalid base64 encoding" });
            }
            const buffer = Buffer.from(data, "base64");

            const maxSize = m1asConfig.maxJsonUploadBytes ?? 2 * 1024 * 1024;

            if (buffer.length > maxSize) {
                return res.status(413).json({
                    error: `JSON upload exceeds ${maxSize} bytes`
                });
            }

            const asset = await this.options.assetManager.upload({
                buffer,
                filename,
                mimeType,
                size: buffer.length,
                ownerId,
                visibility: visibility === "public" ? "public" : "private",
            });

            res.json(asset);
        })(req, res);
    }
}
