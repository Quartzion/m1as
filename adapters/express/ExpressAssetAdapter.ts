import { AssetHttpAdapter, AssetHttpAdapterOptions } from "../AssetHttpAdapter.js";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { m1asConfig } from "../../config/m1asConfig.js";
import { pipeline } from "stream";
import { promisify } from "util";
import { PassThrough } from "stream";
import { AssetManager } from "../../core/assets/assetManager.js";
import type { RequestHandler } from "express";

const pipelineAsync = promisify(pipeline);

export class ExpressAssetAdapter implements AssetHttpAdapter {
    private uploadMiddleware;

    constructor(
        private options: {
            assetManager: AssetManager;
            getOwnerId?: (req: any) => string | undefined;
        }) {
        const allowedFields = m1asConfig.multipartAllowedFields ?? [];
        this.uploadMiddleware = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: m1asConfig.maxFileSizeBytes || 10 * 1024 * 1024,
                files: 1,
                fields: allowedFields.length || 0,
                fieldSize: 256,
            },
        }).single("file");
    }

    private ownerId(req: any): string | undefined {
        return (
            this.options.getOwnerId?.(req) ??
            req.header?.("m1as-user-id")
        );
    }

    private async runMulter(req: any, res: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.uploadMiddleware(req, res, (err: any) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private safeHandler = (fn: (req: any, res: any) => Promise<void>) => async (req: any, res: any) => {
        try {
            await fn(req, res);
        } catch (err: any) {
            console.error("HTTP handler error:", err);
            res.status(500).json({ error: "Internal server error" });
        }
    };

    async upload(req: any, res: any) {
        try {
            // Run multipart parsing explicitly
            await this.runMulter(req, res);

            if (!req.file) {
                return res.status(400).json({ error: "Missing file field" });
            }

            // Reject unexpected fields
            const allowedFields = m1asConfig.multipartAllowedFields ?? [];

            if (req.body) {
                const keys = Object.keys(req.body);

                const unexpected = keys.filter(k => !allowedFields.includes(k));
                if (unexpected.length > 0) {
                    return res.status(400).json({
                        error: `Unexpected form fields: ${unexpected.join(", ")}`
                    });
                }
            }


            const detected = await fileTypeFromBuffer(req.file.buffer);
            const mimeType = detected?.mime ?? req.file.mimetype ?? "application/octet-stream";

            let visibility: "private" | "public" = "private";

            if (
                m1asConfig.multipartAllowedFields?.includes("visibility") &&
                req.body?.visibility === "public"
            ) {
                visibility = "public";
            }

            const asset = await this.options.assetManager.upload({
                buffer: req.file.buffer,
                filename: req.file.originalname,
                mimeType,
                size: req.file.size,
                ownerId: this.ownerId(req),
                visibility: visibility,
            });

            return res.json(asset);
        } catch (err: any) {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: err.message });
            }

            console.error("HTTP handler error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async getMetadata(req: any, res: any) {
        await this.safeHandler(async (req: any, res: any) => {
            const { id } = req.params;
            const asset = await this.options.assetManager.getMetadataById(id, this.ownerId(req));
            if (!asset) return res.status(404).json({ error: "Not found" });
            res.json(asset);
        })(req, res);
    }

    async getFile(req: any, res: any) {
        await this.safeHandler(async (req: any, res: any) => {
            const { id } = req.params;
            const result = await this.options.assetManager.getFileById(id, this.ownerId(req));

            if (result.status === "not_found") return res.status(404).json({ error: "File not found" });
            if (result.status === "forbidden") return res.status(403).json({ error: "Access denied" });

            res.setHeader("Content-Type", result.file.mimeType);
            res.setHeader("Content-Disposition", `inline; filename="${result.file.filename}"`);

            const bufferStream = new PassThrough();
            bufferStream.end(result.file.buffer);
            await pipelineAsync(bufferStream, res);
        })(req, res);
    }

    async delete(req: any, res: any) {
        await this.safeHandler(async (req: any, res: any) => {
            const { id } = req.params;
            const result = await this.options.assetManager.delete(id);
            if (result === "not_found") return res.status(200).json({ deleted: "false", reason: "File not found" });
            res.json({ success: true });
        })(req, res);
    }
}