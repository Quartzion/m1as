import { AssetHttpAdapter } from "../AssetHttpAdapter.js";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { m1asConfig } from "../../config/m1asConfig.js";
import { pipeline } from "stream";
import { promisify } from "util";
import { PassThrough } from "stream";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { HttpError } from "../../core/http/HttpError.js";

const pipelineAsync = promisify(pipeline);

export class ExpressAssetAdapter implements AssetHttpAdapter {
  private uploadMiddleware;

  constructor(
    private options: {
      assetManager: AssetManager;
      getOwnerId?: (req: any) => string | undefined;
    }
  ) {
    const allowedFields = m1asConfig.multipartAllowedFields ?? [];

    this.uploadMiddleware = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024,
        files: 1,
        fields: allowedFields.length || 0,
        fieldSize: 256,
      },
    }).single("file");
  }

  private ownerId(req: any): string | undefined {
    return (
      this.options.getOwnerId?.(req) ??
      req.header?.("m1as-user-id")
    );
  }

  private async runMulter(req: any, res: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.uploadMiddleware(req, res, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // --------------------
  // UPLOAD
  // --------------------
  async upload(req: any, res: any): Promise<void> {
    try {
      await this.runMulter(req, res);
    } catch (err: any) {
      if (err instanceof multer.MulterError) {
        throw new HttpError(400, err.message);
      }
      throw err;
    }

    if (!req.file) {
      throw new HttpError(400, "Missing file field");
    }

    const allowedFields = m1asConfig.multipartAllowedFields ?? [];

    if (req.body) {
      const keys = Object.keys(req.body);
      const unexpected = keys.filter(k => !allowedFields.includes(k));

      if (unexpected.length > 0) {
        throw new HttpError(
          400,
          `Unexpected form fields: ${unexpected.join(", ")}`
        );
      }
    }

    const detected = await fileTypeFromBuffer(req.file.buffer);
    const mimeType =
      detected?.mime ??
      req.file.mimetype ??
      "application/octet-stream";

    let visibility: "private" | "public" = "private";

    if (
      m1asConfig.multipartAllowedFields?.includes("visibility") &&
      req.body?.visibility === "public"
    ) {
      visibility = "public";
    }

    const asset = await this.options.assetManager.upload({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType,
      size: req.file.size,
      ownerId: this.ownerId(req),
      visibility
    });

    res.json(asset);
  }

  // --------------------
  // GET METADATA
  // --------------------
  async getMetadata(req: any, res: any): Promise<void> {
    const { id } = req.params;

    const asset = await this.options.assetManager.getMetadataById(
      id,
      this.ownerId(req)
    );

    if (!asset) {
      throw new HttpError(404, "Not found");
    }

    res.json(asset);
  }

  // --------------------
  // GET FILE
  // --------------------
  async getFile(req: any, res: any): Promise<void> {
    const { id } = req.params;

    const result = await this.options.assetManager.getFileById(
      id,
      this.ownerId(req)
    );

    if (result.status === "not_found") {
      throw new HttpError(404, "File not found");
    }

    if (result.status === "forbidden") {
      throw new HttpError(403, "Access denied");
    }

    res.setHeader("Content-Type", result.file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${result.file.filename}"`
    );

    const bufferStream = new PassThrough();
    bufferStream.end(result.file.buffer);

    await pipelineAsync(bufferStream, res);
  }

  // --------------------
  // DELETE
  // --------------------
  async delete(req: any, res: any): Promise<void> {
    const { id } = req.params;

    const result = await this.options.assetManager.delete(id);

    if (result === "not_found") {
      res.status(200).json({
        deleted: "false",
        reason: "File not found"
      });
      return;
    }

    res.json({ success: true });
  }
}
