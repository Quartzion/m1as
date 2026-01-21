import "dotenv/config";
import mongoose from "mongoose";
import express from "express";

import { AssetManager } from "../core/assets/assetManager.js";
import { createAssetRouter } from "../adapters/express/assetsRouter.js";
import { createJsonAssetRouter } from "../adapters/express/jsonAssetRouter.js";
import { MongoAssetRepo } from "../core/assets/mongoAssetRepo.js";
import { MongoStorageAdapter } from "../storage/mongo/mongoStorageAdapter.js";
import { createLogger } from "../core/logging/createLogger.js"
import { m1asConfig } from "../config/m1asConfig.js"

const PORT = m1asConfig.m1asServerPort;

async function startServer() {
  // 1. Connect to Mongo
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/m1as");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }

  // 2. Express setup
  const app = express();

  // 3. Mongo-backed storage & repository
  const storage = new MongoStorageAdapter(); // stores actual file bytes in Mongo (GridFS)
  const repository = new MongoAssetRepo(); // stores metadata
  const cache = undefined;
  const logger = createLogger(m1asConfig.logger, {
  filePath: m1asConfig.logFile,
  level: m1asConfig.logLevel as any
  });

  // 4. Asset manager (core)
  const assetManager = new AssetManager(
    storage,
    repository,
    cache,
    logger
    );

  // 5. Asset API
  app.use(
    "/assets",
    createAssetRouter({
      assetManager,
      getOwnerId: (req) => {
        const raw = req.headers["m1as-user-id"];

        if (Array.isArray(raw)) {
          throw new Error("Multiple m1as-user-id headers are not allowed");
        }

        if (raw === undefined || raw.trim() === "") {
          throw new Error("m1as-user-id header is required");
        }

        return raw;
      }

    })
  );
  // 5.b JSON Asset API
  app.use(express.json({ limit: "3mb" }));
  app.use("/assets/json",
    createJsonAssetRouter({
      assetManager,
      getOwnerId: (req) => {
        const raw = req.headers["m1as-user-id"];

        if (Array.isArray(raw)) {
          throw new Error("Multiple m1as-user-id headers are not allowed");
        }

        if (raw === undefined || raw.trim() === "") {
          throw new Error("m1as-user-id header is required");
        }

        return raw;
      }
    })
  );

  // 6. Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // 7. Start server
  app.listen(PORT, () => {
    console.log(`Asset server running on http://localhost:${PORT}`);
    console.log(`POST multipart forms (best for larger files) to http://localhost:${PORT}/assets`);
    console.log(`POST JSON for smaller files to http://localhost:${PORT}/assets/json`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });
}

startServer();
