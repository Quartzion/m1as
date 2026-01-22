import express, { Request, Response, Router } from "express";
import { JsonAssetAdapter } from "./jsonAssetAdapter.js";

export function createJsonAssetRouter(adapter: JsonAssetAdapter) {
  const router = express.Router();

  router.post("/", adapter.upload.bind(adapter));

  return router;
}
