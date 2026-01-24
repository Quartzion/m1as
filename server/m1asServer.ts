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
import { createRateLimit } from "../core/middleware/rateLimitMiddleware.js";

const PORT = m1asConfig.m1asServerPort;
let isReady = false;

// ---- rate limiter ----
const uploadRateLimit = createRateLimit({
  windowMs: m1asConfig.rateLimit.windowMs,
  max: m1asConfig.rateLimit.uploadMax,
  keyFn: (req) =>
    req.headers["m1as-user-id"] ??
    req.ip
});

const readRateLimit = createRateLimit({
  windowMs: m1asConfig.rateLimit.windowMs,
  max: m1asConfig.rateLimit.readMax,
  keyFn: (req) =>
    req.headers["m1as-user-id"] ??
    req.ip
});

const deleteRateLimit = createRateLimit({
  windowMs: m1asConfig.rateLimit.windowMs,
  max: m1asConfig.rateLimit.deleteMax,
  keyFn: (req) =>
    req.headers["m1as-user-id"] ??
    req.ip
});

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
      const err = new Error("Multiple m1as-user-id headers are not allowed");
      (err as any).statusCode = 400;
      throw err;
    }
    if (!raw || raw.trim() === "") {
      const err = new Error("m1as-user-id header is required");
      (err as any).statusCode = 400;
      throw err;
    }
    return raw;
  };

  // ---- Multipart API ----
  app.use(
    "/assets",
    uploadRateLimit,
    readRateLimit,
    deleteRateLimit,
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

  app.use("/assets/json",
    uploadRateLimit,
    createJsonAssetRouter(jsonAdapter));

  // ---- Health check ----
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    if (!isReady) {
      return res.status(503).json({ status: "not ready" });
    }

    try {
      if (!mongoose.connection.db) {
        return res.status(503).json({ status: "not ready" });
      }
      await mongoose.connection.db.admin().ping();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not ready" });
    }
  });


  // --- logging ---
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      err.statusCode ??
      err.status ??
      (err.message?.includes("required") ? 400 : 500);

    logger?.({
      level: status >= 500 ? "error" : "warn",
      msg: "HTTP handler error",
      method: req.method,
      path: req.originalUrl,
      status,
      error: err.message
    });

    res.status(status).json({
      error: err.message ?? "Internal Server Error"
    });
  });


  // ---- HTTP server ----
  const server = http.createServer(app);

  isReady = true;

  server.listen(PORT, () => {
    logger?.({
      level: "info",
      msg: "Asset server started",
      port: PORT
    });

    logger?.({
      level: "info",
      msg: "Health endpoint registered",
      path: `${PORT}/ready`
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
console.log(`Rediness check available at http://localhost:${PORT}/ready`);
console.log(`Health check available at http://localhost:${PORT}/health`);
