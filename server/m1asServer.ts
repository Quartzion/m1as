import "dotenv/config";
import mongoose from "mongoose";
import express from "express";
import http from "http";

import { AssetManager } from "../core/assets/AssetManager.js";
import { createAssetRouter } from "../adapters/express/assetsRouter.js";
import { createJsonAssetRouter } from "../adapters/express/jsonAssetRouter.js";
import { JsonAssetAdapter } from "../adapters/express/jsonAssetAdapter.js";
import { MongoAssetRepo } from "../core/assets/mongoAssetRepo.js";
import { MongoStorageAdapter } from "../storage/mongo/mongoStorageAdapter.js";
import { createLogger } from "../core/logging/createLogger.js";
import { m1asConfig } from "../config/m1asConfig.js";

const PORT = m1asConfig.m1asServerPort;

async function startServer() {
  const logger = createLogger(m1asConfig.logger as "console" | "none" | "file" | "cloud", {
    filePath: m1asConfig.logFile,
    level: m1asConfig.logLevel as any
  });

  // ---- MongoDB connection ----
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/m1as"
    );

    logger?.({
      level: "info",
      msg: "MongoDB connected"
    });
  } catch (err) {
    logger?.({
      level: "error",
      msg: "MongoDB connection failed",
      err
    });
    process.exit(1);
  }

  // ---- Express app ----
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json({ limit: "3mb" }));

  // ---- Core services ----
  const storage = new MongoStorageAdapter();
  const repository = new MongoAssetRepo();

  const assetManager = new AssetManager(
    storage,
    repository,
    undefined,
    logger
  );

  // ---- Owner resolver (single source of truth) ----
  const getOwnerId = (req: express.Request): string => {
    const raw = req.headers["m1as-user-id"];

    if (Array.isArray(raw)) {
      throw new Error("Multiple m1as-user-id headers are not allowed");
    }
    if (!raw || raw.trim() === "") {
      throw new Error("m1as-user-id header is required");
    }
    return raw;
  };

  // ---- Multipart API ----
  app.use(
    "/assets",
    createAssetRouter({
      assetManager,
      getOwnerId
    })
  );

  // ---- JSON API ----
  const jsonAdapter = new JsonAssetAdapter({
    assetManager,
    getOwnerId
  });

  app.use("/assets/json", createJsonAssetRouter(jsonAdapter));

  // ---- Health check ----
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ---- HTTP server ----
  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger?.({
      level: "info",
      msg: "Asset server started",
      port: PORT
    });
  });

  // ---- Graceful shutdown ----
  const shutdown = async (signal: string) => {
    logger?.({
      level: "info",
      msg: "Shutdown initiated",
      signal
    });

    try {
      await mongoose.disconnect();
      logger?.({
        level: "info",
        msg: "MongoDB disconnected"
      });
    } catch (err) {
      logger?.({
        level: "error",
        msg: "Error during MongoDB shutdown",
        err
      });
    }

    server.close(() => {
      logger?.({
        level: "info",
        msg: "HTTP server closed"
      });
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch(err => {
  console.error("Fatal startup error:", err);
  process.exit(1);
})
  console.log(`Asset server running on http://localhost:${PORT}`);
  console.log(`POST multipart forms (best for larger files) to http://localhost:${PORT}/assets`);
  console.log(`POST JSON for smaller files to http://localhost:${PORT}/assets/json`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
