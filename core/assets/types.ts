export type AssetId = string;

export type AssetVisibility = "private" | "public";

export interface AssetRecord {
 readonly id: AssetId;
 readonly displayName: string;
 readonly mimeType: string;
 readonly size: number;
 readonly storagePath: string;
 readonly publicUrl?: string;
 readonly ownerId?: string;
 readonly visibility: AssetVisibility;
 readonly createdAt: Date;
 readonly updatedAt: Date;
}

export type PublicAssetMetadata = {
  id: string;
  displayName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

export type PrivateAssetMetadata = PublicAssetMetadata & {
  ownerId?: string;
  visibility: "public" | "private";
  updatedAt: Date;
};
