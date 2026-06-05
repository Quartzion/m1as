import { AssetRepository } from "../../core/assets/contracts.js";
import { AssetRecord } from "../../core/assets/types.js";
import { AssetModel } from "./mongooseModels.js";

export class MongoAssetRepo implements AssetRepository {
  async create(asset: AssetRecord): Promise<AssetRecord> {
    try {
      const doc = new AssetModel(asset);
      await doc.save({ validateBeforeSave: true });
      return asset;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new Error(`asset with id ${asset.id} already exists`)
      }
      throw err;
    }
  }

  async findById(id: string): Promise<AssetRecord | null> {
    return AssetModel.findOne({ id }).lean<AssetRecord>().exec();
  }

    async findPublicAssets(): Promise<AssetRecord[]> {
    return AssetModel.find({
      visibility: "public"
    })
      .sort({ createdAt: -1 })
      .lean<AssetRecord[]>()
      .exec();
  }

  async deleteById(id: string): Promise<void> {
   const result = await AssetModel.deleteOne({ id }).exec();
    if (result.deletedCount === 0) {
      return;
    }
  }
}
