export type AssetId = string;

export type AssetVisibility = "private" | "public";

export interface AssetRecord {
 readonly id: AssetId;
 readonly  filename: string;
 readonly mimeType: string;
 readonly size: number;
 readonly storagePath: string;
 readonly publicUrl?: string;
 readonly  ownerId?: string;
 readonly visibility: AssetVisibility;
 readonly  createdAt: Date;
 readonly updatedAt: Date;
}
