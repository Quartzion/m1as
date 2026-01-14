import {
  AssetStorageAdapter,
  AssetRepository,
  AssetCache,
  AssetUploadInput
} from "./contracts.js";
import { AssetRecord } from "./types.js";
import { randomUUID } from "crypto";

export class AssetManager {
  constructor(
    private storage: AssetStorageAdapter,
    private repository: AssetRepository,
    private cache?: AssetCache
  ) { }

  async upload(input: AssetUploadInput): Promise<AssetRecord> {
    // validation lives here
    const id = randomUUID();
    const now = new Date();

    const stored = await this.storage.save({
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType
    });

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

    const saved = await this.repository.create(asset);

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

    // storage is private but accessible here
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
