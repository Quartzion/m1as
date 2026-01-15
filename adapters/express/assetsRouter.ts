import express, { Request, Response, Router } from "express";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import { AssetManager } from "../../core/assets/assetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js"

// check for m1as config
if (m1asConfig.maxFileSizeBytes <= 0) {
  throw new Error("Invalid M1AS_MAX_FILE_SIZE_BYTES");
}

export interface AssetRouterOptions {
  assetManager: AssetManager;
  getOwnerId?: (req: Request) => string | undefined;
}

export function createAssetRouter(options: AssetRouterOptions): Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024, // 10 MB
      files: 1,
      fields: 0,                 // no non-file fields allowed
      fieldNameSize: 100,
      fieldSize: 0,
    },
  });

  const { assetManager, getOwnerId } = options;

  // Upload endpoint
  router.post(
    "/",
    (req, res, next) => {
      upload.single("file")(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
          }
          return res.status(400).json({ error: "Invalid multipart request" });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file uploaded in field 'file'" });

        // Reject unexpected multipart fields
        if (req.body && Object.keys(req.body).length > 0) {
          return res.status(400).json({
            error: "Unexpected form fields provided",
          });
        }

        // Detect real file type from buffer
        const detectedType = await fileTypeFromBuffer(file.buffer);

        const mimeType =
          detectedType?.mime ?? file.mimetype ?? "application/octet-stream";

        const filename =
          detectedType?.ext && !file.originalname.includes(".")
            ? `${file.originalname}.${detectedType.ext}`
            : file.originalname;

        const asset = await assetManager.upload({
          buffer: file.buffer,
          filename,
          mimeType,
          size: file.size,
          ownerId: getOwnerId?.(req),
        });

        res.json(asset);
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Get asset metadata
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const asset = await assetManager.get(req.params.id);
      if (!asset) return res.status(404).json({ error: "Not found" });

      res.json(asset);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // File retrieval endpoint
  router.get("/:id/file", async (req: Request, res: Response) => {
    try {
      const file = await assetManager.getFileById(req.params.id); // <-- safe call
      if (!file) return res.status(404).json({ error: "File not found" });

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
      res.send(file.buffer);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete asset
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      await assetManager.delete(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
