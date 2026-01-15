import { AssetRepository } from "./contracts.js";
import { AssetRecord } from "./types.js";
import { AssetModel } from "./mongooseModels.js";

export class MongoAssetRepo implements AssetRepository {
  async create(asset: AssetRecord): Promise<AssetRecord> {
    const doc = new AssetModel(asset);
    await doc.save();
    return asset;
  }

  async findById(id: string): Promise<AssetRecord | null> {
    return AssetModel.findOne({ id }).lean<AssetRecord>().exec();
  }

  async deleteById(id: string): Promise<void> {
    await AssetModel.deleteOne({ id }).exec();
  }
}
