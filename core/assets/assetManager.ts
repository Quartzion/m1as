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
import { normalizeDisplayName } from "../utils/normalizeDisplayName.js";
import { PublicError } from "../middleware/publicErrorHandler.js";

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
      displayName: asset.displayName,
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
      throw new PublicError("Asset buffer is required", 400, "MISSING_ASSET_BUFFER");
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
      throw new PublicError(`MIME type not allowed`, 400, "FILE_TYPE_RESTRICTED");
    }

    // Size checks
    if (!input.size || input.size <= 0) {
      throw new PublicError("Invalid file size", 400, "INVALID_FILE_SIZE");
    }
    if (input.size !== input.buffer.length) {
      throw new PublicError("File size mismatch", 400, "FILE_SIZE_MISMATCH");
    }
    const maxFileSize = m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024;
    if (input.size > maxFileSize) {
      throw new PublicError(`File exceeds maximum size permitted`, 400, "FILE_TOO_LARGE");
    }

    // OwnerId checks (optional, but must be valid if provided)
    if (input.ownerId !== undefined) {
      if (
        typeof input.ownerId !== "string" ||
        input.ownerId.trim() === ""
      ) {
        throw new PublicError("ownerId must be a non-empty string if provided", 400, "M1AS-USER-ID_MUST_NOT_BE_EMPTY");
      }
    }
  }

  // ===== PUBLIC METHODS =====
  async upload(input: AssetUploadInput): Promise<AssetRecord> {
    this.validateUpload(input);

    const id = randomUUID();
    const now = new Date();


    // normalize displayName
    const displayNameNormalized = normalizeDisplayName(input.displayName, {
      mode: "sanitize",
      fallbackExtension: ".bin"
    });

    if (displayNameNormalized.sanitized) {
        this.log("warn", "displayName sanitized", {
        event: "DISPLAY_NAME_SANITIZED",
        original: displayNameNormalized.original,
        displayName: displayNameNormalized.displayName,
        reason: displayNameNormalized.reason
      });

    };


    let stored;
    try {
      // Save file bytes first
      stored = await this.storage.save({
        buffer: input.buffer,
        displayName: displayNameNormalized.displayName,
        mimeType: input.mimeType
      });

      // Construct asset record
      const asset: AssetRecord = {
        id,
        displayName: displayNameNormalized.displayName,
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
        displayName: input.displayName,
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
        displayName: input.displayName,
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
    | { status: "ok"; 
        file: { 
          buffer: Buffer; 
          displayName: string; 
          mimeType: string } }
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
      file: {
        buffer: file.buffer,
        displayName: asset.displayName,
        mimeType: file.mimeType
      }
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
