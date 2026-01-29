import { AssetId, AssetRecord } from "./types.js";

export interface AssetUploadInput {
  buffer: Buffer;
  filename: string;
  displayName: string;
  mimeType: string;
  size: number;

  ownerId?: string;
  visibility?: "private" | "public";
}

export interface AssetStorageAdapter {
  save(input: {
    buffer: Buffer;
    filename: string;
    displayName: string;
    mimeType: string;
  }): Promise<{
    storagePath: string;
    publicUrl?: string;
  }>;
  get(storagePath: string): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null>;
  delete(storagePath: string): Promise<void>;
}

export interface AssetRepository {
  create(asset: AssetRecord): Promise<AssetRecord>;
  findById(id: AssetId): Promise<AssetRecord | null>;
  deleteById(id: AssetId): Promise<void>;
}

export interface AssetCache {
  get(id: AssetId): Promise<AssetRecord | null>;
  set(asset: AssetRecord): Promise<void>;
  delete(id: AssetId): Promise<void>;
}

