import {
  AssetStorageAdapter,
  AssetRepository,
  AssetCache,
  AssetUploadInput
} from "./contracts.js";
import { AssetRecord } from "./types.js";
import { randomUUID } from "crypto";
import { m1asConfig } from "../../config/m1asConfig.js";
import { error } from "console";

export interface m1asLogger {
  (log: Record<string, any>): void;
}

export class AssetManager {
  constructor(
    private storage: AssetStorageAdapter,
    private repository: AssetRepository,
    private cache?: AssetCache,
    private logger?: m1asLogger
  ) {}

  private log(event: Record<string, any>) {
    if(this.logger) {
      try {
        this.logger(event);
      } catch (err) {
        console.error("logger failed:", err)
      }
    }
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
    const allowedMimeTypes = m1asConfig.allowedMimeTypes || [
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
        this.log({ event: "CACHE_FAIL", assetId: id, error: err.message });
      }

        this.log({
        event: "UPLOAD_SUCCESS",
        assetId: id,
        filename: input.filename,
        size: input.size,
        ownerId: input.ownerId,
        visibility: asset.visibility,
        timestamp: now.toISOString()
      });

      return saved;
    } catch (err : any) {
      // If storage succeeded but repo failed, delete storage
      if (stored) {
        try {
          await this.storage.delete(stored.storagePath);
        } catch (cleanupErr) {
          console.error("Failed to rollback storage after repo failure:", cleanupErr);
        }
      }

        this.log({
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

  async getFileById(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
    const asset = await this.get(id); // use existing public get()
    if (!asset) return null;

    // Retrieve file from storage
    return this.storage.get(asset.storagePath);
  }

  async delete(id: string): Promise<"deleted" | "not_found"> {
    const asset = await this.repository.findById(id);
    if (!asset) {
      return "not_found";
    }

    await this.storage.delete(asset.storagePath);
    await this.repository.deleteById(id);
    await this.cache?.delete(id);

    return "deleted"
  }
}
