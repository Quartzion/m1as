import { AssetManager } from "../core/assets/assetManager.js";

export interface AssetHttpAdapterOptions {
  assetManager: AssetManager;
  getOwnerId?: (req: any) => string | undefined;
}

export interface AssetHttpAdapter {
  upload(req: any, res: any): Promise<void>;
  getMetadata(req: any, res: any): Promise<void>;
  getFile(req: any, res: any): Promise<void>;
  delete(req: any, res: any): Promise<void>;
}