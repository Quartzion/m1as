// adapters/express/assetsRouter.ts
import express, { Router } from "express";
import { ExpressAssetAdapter } from "./ExpressAssetAdapter.js";
import { AssetManager } from "../../core/assets/AssetManager.js";
import { SignedUrlService } from "../../core/security/SignedUrlService.js";

export interface AssetRouterOptions {
  assetManager: AssetManager;
  signedUrlService: SignedUrlService;
  getOwnerId?: (req: any) => string | undefined;
  uploadRateLimit?: (req: any, res: any, next: any) => void;
  readRateLimit?: (req: any, res: any, next: any) => void;
  deleteRateLimit?: (req: any, res: any, next: any) => void;
}

export function createAssetRouter(options: AssetRouterOptions): Router {
  const router = express.Router();

  const adapter = new ExpressAssetAdapter({
    assetManager: options.assetManager,
    signedUrlService: options.signedUrlService,
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
  router.post("/", options.uploadRateLimit || ((_, __, next) => next()), (req, res) => adapter.upload(req, res));
  router.get("/:id", options.readRateLimit || ((_, __, next) => next()), (req, res) => adapter.getMetadata(req, res));
  router.get("/:id/file", options.readRateLimit || ((_, __, next) => next()), (req, res) => adapter.getFile(req, res));
  // signed url routes
  router.get("/:id/file/signed", options.readRateLimit || ((_, __, next) => next()), adapter.getFileSigned.bind(adapter));
  router.get("/:id/signed", options.readRateLimit || ((_, __, next) => next()), adapter.getSignedUrl.bind(adapter))
  router.delete("/:id", options.deleteRateLimit || ((_, __, next) => next()), (req, res) => adapter.delete(req, res));

  return router;
}
