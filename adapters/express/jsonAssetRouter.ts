import express, { Request, Response, Router } from "express";
import { AssetManager } from "../../core/assets/assetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js";

export interface JsonAssetRouterOptions {
  assetManager: AssetManager;
  getOwnerId?: (req: Request) => string | undefined;
}

export function createJsonAssetRouter(options: JsonAssetRouterOptions): Router {
  const router = express.Router();
  const { assetManager, getOwnerId } = options;

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { filename, mimeType, visibility, data } = req.body;

      if (!data || typeof data !== "string") {
        return res.status(400).json({ error: "Base64 data is required" });
      }

      // Decode base64
      const buffer = Buffer.from(data, "base64");

      // JSON uploads should be smaller than multipart
      const maxJsonSize = m1asConfig.maxJsonUploadBytes ?? 2 * 1024 * 1024;

      if (buffer.length > maxJsonSize) {
        return res.status(413).json({
          error: `JSON upload exceeds ${maxJsonSize} bytes`
        });
      }

      const asset = await assetManager.upload({
        buffer,
        filename,
        mimeType,
        size: buffer.length,
        visibility,
        ownerId: getOwnerId?.(req),
      });

      res.json(asset);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
