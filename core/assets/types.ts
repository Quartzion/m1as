export type AssetId = string;

export type AssetVisibility = "private" | "public";

export interface AssetRecord {
  id: AssetId;

  filename: string;
  mimeType: string;
  size: number;

  storagePath: string;
  publicUrl?: string;

  ownerId?: string;
  visibility: AssetVisibility;

  createdAt: Date;
  updatedAt: Date;
}
