import express, { Request, Response, Router } from "express";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import { AssetManager } from "../../core/assets/assetManager.js";
import { m1asConfig } from "../../config/m1asConfig.js";
import { pipeline } from "stream";
import { promisify } from "util";
import { PassThrough } from "stream";

const pipelineAsync = promisify(pipeline);

// --- Validate UUID (for :id param) ---
function isValidUUID(id: string) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(id);
}

// --- Safety wrapper for async handlers ---
function safeHandler(fn: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err: any) {
      console.error("HTTP handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// --- Header validation middleware ---
function requireUserIdHeader(req: Request, res: Response, next: Function) {
  const userId = req.header("m1as-user-id");
  if (!userId || userId.trim() === "") {
    return res.status(401).json({ error: "Missing m1as-user-id header" });
  }
  // normalize for downstream
  (req as any).requesterOwnerId = userId;
  next();
}

export interface AssetRouterOptions {
  assetManager: AssetManager;
  getOwnerId?: (req: Request) => string | undefined;
}

export function createAssetRouter(options: AssetRouterOptions): Router {
  const router = express.Router();
  const { assetManager, getOwnerId } = options;

  // --- Configure multer for in-memory uploads ---
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024,
      files: 1,
      fields: m1asConfig.multiPartFormFields || 0,
      fieldNameSize: 100,
      fieldSize: m1asConfig.multiPartFieldSizeBytes || 256,
    },
  });

  // --- Basic CORS headers for all routes ---
  router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // adjust as needed
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, m1as-user-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // --- Upload endpoint ---
  router.post(
    "/",
    requireUserIdHeader,
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
    safeHandler(async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded in field 'file'" });

      // Reject unexpected multipart fields
      const maxFields = m1asConfig.multiPartFormFields || 0;
      if (req.body && Object.keys(req.body).length > maxFields) {
        return res.status(400).json({ error: "Unexpected form fields provided" });
      }

      // Detect real MIME type
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const mimeType = detectedType?.mime ?? file.mimetype ?? "application/octet-stream";

      // Sanitize filename
      let filename = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      if (detectedType?.ext && !filename.includes(".")) filename += `.${detectedType.ext}`;
      if (filename.length > 255) filename = filename.slice(0, 255);

      // Determine visibility
      const visibility = req.body?.visibility === "public" ? "public" : "private";

      // --- Always normalized ---
      const ownerId = getOwnerId?.(req) ?? (req as any).requesterOwnerId;

      const asset = await assetManager.upload({
        buffer: file.buffer,
        filename,
        mimeType,
        size: file.size,
        ownerId,
        visibility,
      });

      res.json(asset);
    })
  );

  // --- Metadata retrieval ---
  router.get(
    "/:id",
    requireUserIdHeader,
    safeHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!isValidUUID(id)) return res.status(400).json({ error: "Invalid asset ID" });
      const requesterOwnerId = getOwnerId?.(req) ?? (req as any).requesterOwnerId;
      const asset = await assetManager.getMetadataById(id, requesterOwnerId);
      if (!asset) return res.status(404).json({ error: "Not found" });

      res.json(asset);
    })
  );

  // --- File retrieval ---
  router.get(
    "/:id/file",
    requireUserIdHeader,
    safeHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!isValidUUID(id)) return res.status(400).json({ error: "Invalid asset ID" });

      const requesterOwnerId = getOwnerId?.(req) ?? (req as any).requesterOwnerId;
      const result = await assetManager.getFileById(id, requesterOwnerId);
      
      if (result.status === "not_found") return res.status(404).json({ error: "File not found" });
      if (result.status === "forbidden") return res.status(403).json({ error: "Access denied" });

      res.setHeader("Content-Type", result.file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${result.file.filename}"`);

      // Stream large files
      const bufferStream = new PassThrough();
      bufferStream.end(result.file.buffer);
      await pipelineAsync(bufferStream, res);
    })
  );

  // --- Delete asset ---
  router.delete(
    "/:id",
    requireUserIdHeader,
    safeHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!isValidUUID(id)) return res.status(400).json({ error: "Invalid asset ID" });

      const result = await assetManager.delete(id);
      if (result === "not_found") return res.status(200).json({ deleted: "false", reason: "File not found" });

      res.json({ success: true });
    })
  );

  return router;
}
