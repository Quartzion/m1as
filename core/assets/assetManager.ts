import {
  AssetStorageAdapter,
  AssetRepository,
  AssetCache,
  AssetUploadInput
} from "./contracts.js";
import { AssetRecord } from "./types.js";
import { randomUUID } from "crypto";
import { m1asConfig } from "../../config/m1asConfig.js";

export class AssetManager {
  constructor(
    private storage: AssetStorageAdapter,
    private repository: AssetRepository,
    private cache?: AssetCache
  ) { }

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
  }

  // ===== PUBLIC METHODS =====
  async upload(input: AssetUploadInput): Promise<AssetRecord> {
    // enforce validation first
    this.validateUpload(input);

    const id = randomUUID();
    const now = new Date();

    // Save to storage (only after validation passes)
    const stored = await this.storage.save({
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

    // Persist to repository
    const saved = await this.repository.create(asset);

    // Cache for fast retrieval
    await this.cache?.set(saved);

    return saved;
  }

  async get(id: string): Promise<AssetRecord | null> {
    const cached = await this.cache?.get(id);
    if (cached) return cached;

    const asset = await this.repository.findById(id);
    if (asset) {
      await this.cache?.set(asset);
    }

    return asset;
  }

  async getFileById(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
    const asset = await this.get(id); // use existing public get()
    if (!asset) return null;

    // Retrieve file from storage
    return this.storage.get(asset.storagePath);
  }

  async delete(id: string): Promise<void> {
    const asset = await this.repository.findById(id);
    if (!asset) return;

    await this.storage.delete(asset.storagePath);
    await this.repository.deleteById(id);
    await this.cache?.delete(id);
  }
}
