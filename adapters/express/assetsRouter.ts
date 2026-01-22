// adapters/express/assetsRouter.ts
import express, { Router } from "express";
import { ExpressAssetAdapter } from "./ExpressAssetAdapter.js";
import { AssetManager } from "../../core/assets/AssetManager.js";

export interface AssetRouterOptions {
  assetManager: AssetManager;
  getOwnerId?: (req: any) => string | undefined;
}

export function createAssetRouter(options: AssetRouterOptions): Router {
  const router = express.Router();

  const adapter = new ExpressAssetAdapter({
    assetManager: options.assetManager,
    getOwnerId: options.getOwnerId,
  });

  // --- CORS (router-scoped, not business logic) ---
  router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, m1as-user-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // --- Routes delegate to adapter ---
  router.post("/", (req, res) => adapter.upload(req, res));
  router.get("/:id", (req, res) => adapter.getMetadata(req, res));
  router.get("/:id/file", (req, res) => adapter.getFile(req, res));
  router.delete("/:id", (req, res) => adapter.delete(req, res));

  return router;
}
