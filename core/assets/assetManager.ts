import {
  AssetStorageAdapter,
  AssetRepository,
  AssetCache,
  AssetUploadInput,
} from "./contracts.js";
import {
  AssetRecord,
  PublicAssetMetadata,
  PrivateAssetMetadata
} from "./types.js";
import { randomUUID } from "crypto";
import { m1asConfig } from "../../config/m1asConfig.js";
import { m1asLogger } from "../logging/createLogger.js";

export class AssetManager {
  constructor(
    private storage: AssetStorageAdapter,
    private repository: AssetRepository,
    private cache?: AssetCache,
    private logger?: m1asLogger,
  ) { }

  private log(
    level: "error" | "warn" | "info" | "debug",
    msg: string,
    fields?: Record<string, unknown>
  ) {
    if (!this.logger) return;

    try {
      this.logger({
        level,
        msg,
        time: Date.now(),
        ...fields,
      });
    } catch (err) {
      console.error("logger failed:", err);
    }
  }


  private toPublicMetadata(asset: AssetRecord): PublicAssetMetadata {
    return {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
    };
  }

  private toPrivateMetadata(asset: AssetRecord): PrivateAssetMetadata {
    return {
      ...this.toPublicMetadata(asset),
      ownerId: asset.ownerId,
      visibility: asset.visibility,
      updatedAt: asset.updatedAt,
    };
  }


  // ===== PRIVATE VALIDATION =====
  private validateUpload(input: AssetUploadInput) {
    // Buffer checks
    if (!input.buffer || input.buffer.length === 0) {
      throw new Error("Asset buffer is required");
    }

    // Filename checks
    if (!input.filename || input.filename.trim() === "") {
      throw new Error("Filename is required");
    }
    if (input.filename.includes("..") || input.filename.includes("/")) {
      throw new Error("Invalid filename (path traversal not allowed)");
    }
    if (input.filename.length > 255) {
      throw new Error("Filename too long (max 255 characters)");
    }

    // MIME type allowlist
    const allowedMimeTypes =
      m1asConfig.allowedMimeTypes ||
      // default fall back allowed file types list
      [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];
    if (!input.mimeType || !allowedMimeTypes.includes(input.mimeType)) {
      throw new Error(`MIME type not allowed: ${input.mimeType}`);
    }

    // Size checks
    if (!input.size || input.size <= 0) {
      throw new Error("Invalid file size");
    }
    if (input.size !== input.buffer.length) {
      throw new Error("File size mismatch");
    }
    const maxFileSize = m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024;
    if (input.size > maxFileSize) {
      throw new Error(`File exceeds maximum size of ${maxFileSize} bytes`);
    }

    // OwnerId checks (optional, but must be valid if provided)
    if (input.ownerId !== undefined) {
      if (
        typeof input.ownerId !== "string" ||
        input.ownerId.trim() === ""
      ) {
        throw new Error("ownerId must be a non-empty string if provided");
      }
    }
  }

  // ===== PUBLIC METHODS =====
  async upload(input: AssetUploadInput): Promise<AssetRecord> {
    this.validateUpload(input);

    const id = randomUUID();
    const now = new Date();

    let stored;

    try {
      // Save file bytes first
      stored = await this.storage.save({
        buffer: input.buffer,
        filename: input.filename,
        mimeType: input.mimeType
      });

      // Construct asset record
      const asset: AssetRecord = {
        id,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        storagePath: stored.storagePath,
        publicUrl: stored.publicUrl,
        ownerId: input.ownerId,
        visibility: input.visibility ?? "private",
        createdAt: now,
        updatedAt: now
      };

      // Attempt repo write
      const saved = await this.repository.create(asset);

      try {
        // Cache for fast retrieval
        await this.cache?.set(saved);

      } catch (err: any) {
        this.log("warn","Cache write failure",{ event: "CACHE_FAIL", assetId: id, error: err.message });
      }

      this.log("info", "Asset Upload Succeeded",{
        event: "UPLOAD_SUCCESS",
        assetId: id,
        filename: input.filename,
        size: input.size,
        ownerId: input.ownerId,
        visibility: asset.visibility,
        timestamp: now.toISOString()
      });

      return saved;
    } catch (err: any) {
      // If storage succeeded but repo failed, delete storage
      if (stored) {
        try {
          await this.storage.delete(stored.storagePath);
        } catch (cleanupErr) {
          console.error("Failed to rollback storage after repo failure:", cleanupErr);
        }
      }

      this.log("error","Asset Upload Failed",{
        event: "UPLOAD_FAIL",
        assetId: id,
        filename: input.filename,
        ownerId: input.ownerId,
        error: err.message,
        timestamp: new Date().toISOString()
      });

      throw err; // propagate original error
    }
  }

  // get metadata
  async get(id: string): Promise<AssetRecord | null> {
    const cached = await this.cache?.get(id);
    if (cached) return cached;

    const asset = await this.repository.findById(id);
    if (asset) {
      try {
        await this.cache?.set(asset);
      } catch (cacheErr) {
        console.warn("Failed to refresh cache after get():", cacheErr);
      }
    }

    return asset;
  }

  // get metadata
  async getMetadataById(
    id: string,
    requesterOwnerId?: string
  ): Promise<PublicAssetMetadata | PrivateAssetMetadata | null> {

    const asset = await this.get(id);
    if (!asset) return null;

    if (
      asset.visibility === "private" &&
      requesterOwnerId !== asset.ownerId
    ) {
      this.log("info","Private Metadata Redacted",{
        event: "METADATA_REDACTED",
        assetId: id,
        requesterOwnerId,
        reason: "m1as policy visibility-invariant",
        timestamp: new Date().toISOString()
      });

      return this.toPublicMetadata(asset);
    }

    return this.toPrivateMetadata(asset);
  }


  async getFileById(
    id: string,
    requesterOwnerId?: string
  ): Promise<
    | { status: "ok"; file: { buffer: Buffer; filename: string; mimeType: string } }
    | { status: "not_found" }
    | { status: "forbidden" }
  > {
    const asset = await this.get(id);
    const now = new Date();

    if (!asset) {
      this.log("info","File not found",{ event: "FILE_GET_NOT_FOUND", assetId: id, timestamp: now });
      return { status: "not_found" };
    }

    // === Built-in visibility invariant ===
    if (
      asset.visibility === "private" &&
      requesterOwnerId !== asset.ownerId
    ) {
      this.log("warn","File Access Restricted",{
        event: "FILE_GET_FORBIDDEN",
        assetId: id,
        requesterOwnerId,
        reason: "m1as policy visibility-invariant",
        timestamp: now
      });
      return { status: "forbidden" };
    }

    // Try/catch around storage
    let file;
    try {
      file = await this.storage.get(asset.storagePath);
    } catch (err: any) {
      if (err.code === "ENOENT" || err.message?.includes("FileNotFound")) {
        // Treat missing file as "not found"
        this.log("warn","Asset File Not Found",{
          event: "FILE_GET_NOT_FOUND",
          assetId: id,
          reason: "storage-missing",
          originalError: err.message,
          timestamp: now
        });
        return { status: "not_found" };
      }
      // Re-throw other errors
      throw err;
    }

    if (!file) {
      this.log("warn","File Asset missing",{
        event: "FILE_GET_NOT_FOUND",
        assetId: id,
        reason: "storage-missing",
        timestamp: now
      });
      return { status: "not_found" };
    }

    this.log("info","File Retrieved",{
      event: "FILE_GET_SUCCESS",
      assetId: id,
      ownerId: asset.ownerId,
      visibility: asset.visibility,
      timestamp: now
    });

    return {
      status: "ok",
      file
    };
  }

  async delete(id: string): Promise<"deleted" | "not_found"> {
    const asset = await this.repository.findById(id);

    if (!asset) {
      this.log("info","Record not found",{
        event: "DELETE_NOT_FOUND",
        assetId: id,
        timestamp: new Date().toISOString()
      });

      return "not_found";
    }

    try {
      await this.storage.delete(asset.storagePath);
      await this.repository.deleteById(id);
      await this.cache?.delete(id);

      this.log("info","Successful Delete",{
        event: "DELETE_SUCCESS",
        assetId: id,
        ownerId: asset.ownerId,
        visibility: asset.visibility,
        timestamp: new Date().toISOString()
      });

      return "deleted";
    } catch (err: any) {
      this.log("error","DELETE FAIL",{
        event: "DELETE_FAIL",
        assetId: id,
        error: err.message,
        timestamp: new Date().toISOString()
      });

      throw err;
    }
  }

}
