import mongoose, { Schema, Document } from "mongoose";
import { AssetRecord } from "./types.js";

export interface AssetDoc extends AssetRecord, Document {}

const AssetSchema = new Schema<AssetDoc>({
  id: { type: String, required: true, unique: true, immutable: true },
  displayName: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true },
  storagePath: { type: String, required: true, maxlength: 512 },
  publicUrl: { type: String },
  ownerId: { type: String },
  visibility: { type: String, enum: ["private", "public"], default: "private" },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});

AssetSchema.index({ ownerId: 1 });
AssetSchema.index({ visibility: 1 });


export const AssetModel = mongoose.model<AssetDoc>("Asset", AssetSchema);
