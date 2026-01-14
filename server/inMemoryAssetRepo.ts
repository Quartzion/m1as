import { AssetRepository } from "../core/assets/contracts.js";
import { AssetId, AssetRecord } from "../core/assets/types.js";

export class InMemoryAssetRepo implements AssetRepository {
  private store = new Map<AssetId, AssetRecord>();

  async create(asset: AssetRecord): Promise<AssetRecord> {
    this.store.set(asset.id, asset);
    return asset;
  }

  async findById(id: AssetId): Promise<AssetRecord | null> {
    return this.store.get(id) ?? null;
  }

  async deleteById(id: AssetId): Promise<void> {
    this.store.delete(id);
  }
}
