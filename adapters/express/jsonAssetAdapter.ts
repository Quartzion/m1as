import { AssetHttpAdapter } from "../AssetHttpAdapter.js";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js";
import { PublicError } from "../../core/middleware/publicErrorHandler.js";

export class JsonAssetAdapter implements AssetHttpAdapter {
    constructor(
        private options: {
            assetManager: AssetManager;
            getOwnerId?: (req: any) => string | undefined;
        }
    ) { }
    getMetadata(req: any, res: any): Promise<void> {
        throw new PublicError("Method not implemented.", 501, "METHOD_NOT_IMPLEMENTED");
    }
    getFile(req: any, res: any): Promise<void> {
        throw new PublicError("Method not implemented.", 501, "METHOD_NOT_IMPLEMENTED");
    }
    delete(req: any, res: any): Promise<void> {
        throw new PublicError("Method not implemented.", 501, "METHOD_NOT_IMPLEMENTED");
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
      throw new PublicError("Unauthorized", 401, "ACCESS_DEINIED");
    }

    const allowedFields = ["displayName", "mimeType", "visibility", "data"];
    const bodyKeys = Object.keys(req.body ?? {});
    const unexpected = bodyKeys.filter(k => !allowedFields.includes(k));

    if (unexpected.length) {
      throw new PublicError(
        `Unexpected fields`,
        400,
        "UNEXPECTED_FIELDS"
      );
    }

    const { displayName, mimeType, visibility, data } = req.body ?? {};

    if (!data || typeof data !== "string") {
      throw new PublicError("Base64 data is required",400, "FILE_NOT_BASE64");
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
      throw new PublicError("Invalid base64 encoding", 400, "INVALID_BASE64");
    }

    const buffer = Buffer.from(data, "base64");

    const maxSize = m1asConfig.maxJsonUploadBytes ?? 2 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new PublicError(
        `JSON upload exceeds the maximum allowed bytes`,
        413,
        "FILE_TOO_LARGE"
      );
    }

    const asset = await this.options.assetManager.upload({
      buffer,
      displayName,
      mimeType,
      size: buffer.length,
      ownerId,
      visibility: visibility === "public" ? "public" : "private"
    });

    res.json(asset);
  }
}
