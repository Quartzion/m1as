// import { promises as fs } from "fs";
// import path from "path";
// import { randomUUID } from "crypto";
// import { AssetStorageAdapter } from "../../core/assets/contracts.js";

// interface DiskStorageOptions {
//   rootDir: string;        // absolute path on disk
//   publicBaseUrl?: string; // e.g. "/uploads" or full URL
// }

// export class DiskStorageAdapter implements AssetStorageAdapter {
//   private rootDir: string;
//   private publicBaseUrl?: string;

//   constructor(options: DiskStorageOptions) {
//     this.rootDir = options.rootDir;
//     this.publicBaseUrl = options.publicBaseUrl;
//   }

//   async save(input: {
//     buffer: Buffer;
//     filename: string;
//     mimeType: string;
//   }): Promise<{ storagePath: string; publicUrl?: string }> {
//     await fs.mkdir(this.rootDir, { recursive: true });

//     const ext = path.extname(input.filename);
//     const uniqueName = `${randomUUID()}${ext}`;
//     const filePath = path.join(this.rootDir, uniqueName);

//     await fs.writeFile(filePath, input.buffer);

//     return {
//       storagePath: uniqueName,
//       publicUrl: this.publicBaseUrl
//         ? `${this.publicBaseUrl}/${uniqueName}`
//         : undefined
//     };
//   }

//   async delete(storagePath: string): Promise<void> {
//     const filePath = path.join(this.rootDir, storagePath);

//     try {
//       await fs.unlink(filePath);
//     } catch (err: any) {
//       // File may already be gone — do not crash the system
//       if (err.code !== "ENOENT") {
//         throw err;
//       }
//     }
//   }
// }
