import "dotenv/config";
import mongoose from "mongoose";
import express from "express";

import { AssetManager } from "../core/assets/assetManager.js";
import { createAssetRouter } from "../adapters/express/assetsRouter.js";
import { MongoAssetRepo } from "../core/assets/mongoAssetRepo.js";
import { MongoStorageAdapter } from "../storage/mongo/mongoStorageAdapter.js"; // new adapter

const PORT = 3000;

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

  // 4. Asset manager (core)
  const assetManager = new AssetManager(storage, repository);

  // 5. Asset API
  app.use(
    "/assets",
    createAssetRouter({
      assetManager,
      getOwnerId: (req) => req.headers["x-user-id"] as string | undefined,
    })
  );

  // 6. Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // 7. Start server
  app.listen(PORT, () => {
    console.log(`Asset server running on http://localhost:${PORT}`);
    console.log(`POST files to http://localhost:${PORT}/assets`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });
}

startServer();
