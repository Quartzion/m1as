import { AssetRepository } from "./contracts.js";
import { AssetRecord } from "./types.js";
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

  async deleteById(id: string): Promise<void> {
   const result = await AssetModel.deleteOne({ id }).exec();
    if (result.deletedCount === 0) {
      return;
    }
  }
}
