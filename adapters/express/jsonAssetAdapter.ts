import { AssetHttpAdapter } from "../AssetHttpAdapter.js";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js";
import { HttpError } from "../../core/http/HttpError.js";

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

  
    async upload(req: any, res: any) {
    const ownerId = this.ownerId(req);
    if (!ownerId) {
      throw new HttpError(401, "Unauthorized");
    }

    const allowedFields = ["filename", "mimeType", "visibility", "data"];
    const bodyKeys = Object.keys(req.body ?? {});
    const unexpected = bodyKeys.filter(k => !allowedFields.includes(k));

    if (unexpected.length) {
      throw new HttpError(
        400,
        `Unexpected fields: ${unexpected.join(", ")}`
      );
    }

    const { filename, mimeType, visibility, data } = req.body ?? {};

    if (!data || typeof data !== "string") {
      throw new HttpError(400, "Base64 data is required");
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
      throw new HttpError(400, "Invalid base64 encoding");
    }

    const buffer = Buffer.from(data, "base64");

    const maxSize = m1asConfig.maxJsonUploadBytes ?? 2 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new HttpError(
        413,
        `JSON upload exceeds ${maxSize} bytes`
      );
    }

    const asset = await this.options.assetManager.upload({
      buffer,
      filename,
      mimeType,
      size: buffer.length,
      ownerId,
      visibility: visibility === "public" ? "public" : "private"
    });

    res.json(asset);
  }
}
