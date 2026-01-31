import { AssetHttpAdapter } from "../AssetHttpAdapter.js";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { m1asConfig } from "../../config/m1asConfig.js";
import { pipeline } from "stream";
import { promisify } from "util";
import { PassThrough } from "stream";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { PublicError } from "../../core/middleware/publicErrorHandler.js";
import { SignedUrlService } from "../../core/security/SignedUrlService.js";

const pipelineAsync = promisify(pipeline);

export class ExpressAssetAdapter implements AssetHttpAdapter {
  private uploadMiddleware;

  constructor(
    private options: {
      signedUrlService: any;
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
  // SIGNED URL
  // --------------------
  async getSignedUrl (req: any, res: any):Promise<void> {
    const { id } = req.params;
    const asset = await this.options.assetManager.get(id);
    if(!asset) {
      throw new PublicError("Not Found", 404, "NOT_FOUND")
    }

    // enforce visibility
    if ( 
      asset.visibility === "private" && 
      this.ownerId(req) !== asset.ownerId
    ) {
      throw new PublicError("Access Denied", 403, "ACCESS_DENIED");
    }

    const ttlRaw = Number(req.query.ttl);

    const ttl = 
      Number.isInteger(ttlRaw) && ttlRaw > 0
      ? ttlRaw
      : m1asConfig.signedUrl?.defaultTTL ?? 300;
    
    const expires = Math.floor(Date.now() / 1000) + ttl;

    const sig = this.options.signedUrlService.sign(
      asset.id,
      expires
    );

    res.json({
      url: `/assets/${asset.id}/file/signed?expires=${expires}&sig=${sig}`,
      expires
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
        throw new PublicError("run_multer_error", 400, "RUN_MULTER_ERROR");
      }
      throw err;
    }

    if (!req.file) {
      throw new PublicError("Missing_file_field", 400, "MISSING_FILE_FIELD");
    }

    const allowedFields = m1asConfig.multipartAllowedFields ?? [];

    if (req.body) {
      const keys = Object.keys(req.body);
      const unexpected = keys.filter(k => !allowedFields.includes(k));

      if (unexpected.length > 0) {
        throw new PublicError(
          `Unexpected form fields`,
          400,
          "INVALID_MULTIPART"
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
      displayName: req.file.original_display_name,
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
      throw new PublicError("Not_found", 404, "NOT_FOUND");
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
      throw new PublicError("Not_found", 404, "FILE_NOT_FOUND");
    }

    if (result.status === "forbidden") {
      throw new PublicError("Access_denied", 403, "ACCESS_DENIED");
    }

    res.setHeader("Content-Type", result.file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(result.file.displayName)}"`
    );

    const bufferStream = new PassThrough();
    bufferStream.end(result.file.buffer);

    await pipelineAsync(bufferStream, res);
  }

  // --------------------
  // SIGNED FILE DELIVERY
  // --------------------
  async getFileSigned(req: any, res: any):Promise<void> {
    const { id } = req.params;
    const { expires, sig } = req.query;

    if (!expires || !sig) {
      throw new PublicError("Invalid_signature", 400, "INVALID_SIGNATURE")
    }

    const expiresNum = Number(expires);
    if(!Number.isFinite(expiresNum)){
      throw new PublicError("Invalid_signature", 400, "INVALID_SIGNATURE")
    }

    const valid = this.options.signedUrlService.verify(
      id,
      expiresNum,
      sig
    );

    if(!valid) {
      throw new PublicError("Access_Denied", 403, "SIGNATURE_INVALID");
    }

    const asset =await this.options.assetManager.get(id);
    if(!asset) {
      throw new PublicError("Not_Found", 404, "NOT_FOUND")
    }

    // visibility invariant
    if(asset.visibility === "private") {
      throw new PublicError("Access_Denied", 403, "ACCESS_DENIED")
    }

    const file = await this.options.assetManager.getFileById(id);
    if(file.status !== "ok") {
      throw new PublicError("Not_Found", 404, "NOT_FOUND")
    }

    res.setHeader("content-type", file.file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(asset.displayName)}"`
    );

    res.end(file.file.buffer);
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
