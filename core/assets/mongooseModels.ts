import mongoose, { Schema, Document } from "mongoose";
import { AssetRecord } from "./types.js";

export interface AssetDoc extends AssetRecord, Document {}

const AssetSchema = new Schema<AssetDoc>({
  id: { type: String, required: true, unique: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  storagePath: { type: String, required: true },
  publicUrl: { type: String },
  ownerId: { type: String },
  visibility: { type: String, default: "private" },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});

export const AssetModel = mongoose.model<AssetDoc>("Asset", AssetSchema);
