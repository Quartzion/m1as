# m1as – MERN-First Asset Service (POC v1.0.0)

## Overview

**m1as (MERN-First Asset Service)** is a backend-first asset management service designed to validate a modular, production-oriented architecture for handling digital assets (uploads, storage, metadata, and retrieval) within a MERN ecosystem.

This framework focuses on:
* Compatibility with modern Node.js LTS environments
---

## Technology Stack

### Backend

* **Node.js** (20 LTS)
* **Express** (API layer)
* **MongoDB** (asset metadata persistence)
* **Multer** (multipart upload handling)
* **file-type** (buffer-based MIME detection)

### Tooling

* **TypeScript** (type safety and maintainability)
* **npm** (10.x)
* **GitHub** (version control, issues, hardening workflow)

---

## High-Level Architecture

```mermaid
graph TD
    Client[Client / Frontend / Service Consumer]
    API[Express API Layer]
    Router[Asset Router]
    Manager[AssetManager Domain Service]
    Repo[AssetRepository]
    Cache["AssetCache (Optional)"]
    Storage[Storage Adapter]
    FS[Local File System]
    DB[(MongoDB)]

    Client -->|HTTP Requests| API
    API --> Router
    Router --> Manager
    Manager --> Repo
    Manager --> Cache
    Manager --> Storage

    Repo --> DB
    Storage --> FS
```

---

## Architectural Principles

### 1. Backend-First Design

The asset service is designed to operate independently of any frontend application. This ensures:

* Reusability across multiple clients
* Stability during frontend outages
* Clear API contracts

### 2. Domain-Centric Asset Management

The `AssetManager` acts as the central orchestration layer responsible for:

* Validating asset inputs
* Coordinating storage and persistence
* Enforcing future business rules

### 3. Pluggable Storage Adapters

Storage is abstracted behind a contract, allowing:

* Mongo filesystem storage
* Future cloud adapters (S3, R2, GCS)
* No API-level changes when swapping storage backends

---

## Current Capabilities (v1.0.0)

* Asset upload via multipart/form-data
* Secure server-side file type detection
* Metadata persistence to MongoDB
* Deterministic storage paths
* Decoupled storage and repository layers

---

## warning (POC Scope)

the following in not handled with this version of the code.
* Authentication / authorization
* CDN or public asset delivery
* Rate limiting or abuse protection
* Virus scanning

These concerns are intentionally deferred to the **hardening phase**.

---

## Repository Structure (Simplified)

```
/asset-service
  /api
    /routes
      assetsRouter.ts           ← handles framework-agnostic CRUD operations 
      ExpressAssetAdapter.ts    ← contract handling requests/responses for all framework. Handles multipart form submission (post) 
      jsonAssetRouter.ts        ← Specifically handles json submissions (post)
      AssetHttpAdapter.ts       ← interface handling requests/responses for any framework.
  /config
    /m1asConfig.ts
  /core
    /assets
      assetManager.ts
      contracts.ts
      mongoAssetRepo.ts
      mongooseModels.ts
      types.ts
  /storage
    /mongo
      mongoStorageAdapter.ts
  /server
    /m1asServer.ts
    /db
      /mongoClient.ts
```

---

## Environment Requirements

* Node.js **20.x LTS**
* npm **10.x**
* MongoDB (local or managed)

```bash
node -v
npm -v
```

---

## Getting Started (POC)

```bash
npm install
npm run build
npm run m1asTest
```

---
# Operation Notes
- there are 2 adapters for uploading files. 
     - **EpressAssetRouter** upload (post) uses multipart forms intentionally to improve support for larger file uploads.
     - **jsonAssetRouter** upoad (post) sends JSON payloads intentionally to improve support for smaller file uploads and MERN integration.  
- **m1asConfig** is used for setting environment variables for customizability. m1asConfig maintains the following values:
     - maxFileSizeBytes           ← sets the max upload file size for the multipart form post. Default / fallback - 10 MB.
     - allowedMimeTypes           ← sets the list of accepted file types. Default / fallback "image/png","image/jpeg","image/webp"
     - maxJsonUploadBytes         ← sets the max upload file size for the JSON body post. Default / fallbalc - 2 MB.
     - multiPartAllowedFields     ← set to "visibility" for centrally enforced visibility invariant support. 
     - logger                     ← sets the m1asLogger logging location. values: console | file | cloud | none.
     - logFile                    ← sets the m1asLogger log file location. For use when logger=file. Default - ./logs/m1as.log
     - logLevel                   ← sets the m1asLogger verbosity. Values: error | warn | info | debug | none
     - m1asServerPort             ← sets the server port m1as runs on.  
- **visibility defaults to private** 
     - when a file is uploaded and the visibility is not set to public via the headers (for multipart form submissions) or in the JSON payload, the visibility will default to private. 
     - In order to set the visibility to public via the API, use the jsonAssetRouter with the JSON body demonstrated later below.
     - To set the visibility to public on a  multipart form submission (ExpressAssetsAdapter) use the curl listed below. 
```ruby
curl -v -X POST http://localhost:<PORT>/assets \
  -H "m1as-user-id: ANY-USER-123" \
  -F "file=@C:<your-filepath>/<your-file>.png"\
  -F "visibility=public"
```
- the **data** key of the JSON payload MUST be the **base64** value of the file for uploading via **jsonAssetRouter**
  - gitbash
     ```ruby
     base64 -w 0 C:<filepath>/<filename-with-extension>
     ```   
---

## how to evaluate
1. open a gitbash terminal and execute the npm scripts listed in the Getting Started section
2. after m1as is running the service should report ok status on the health check http://localhost:<PORT>/health
3. Files can be uploaded by opening an auxillary gitbash terminal and executing the following curl:
<!-- multipart form -->
```ruby
curl -v -X POST http://localhost:<PORT>/assets \
  -H "m1as-user-id: ANY-USER-123" \
  -F "file=@C:<your-filepath>/<your-file>.png"
```
<!-- JSON body -->
```ruby
# POST http://localhost:<PORT>/assets/json
# header
m1as-user-id
# payload
{
  "filename": "json-test.png",
  "mimeType": "image/png",
  "visibility": "public",
	"data": "<base64-image>"
}
```
4. files can be retrieved by navigating to the following url
- **note** in order to retrieve files that are set to visibility=private, the request must be sent with the header m1as-user-id matching the ownerId. Sending requests with the header and ownerId discrepant will result in an access denied alert and the file will not be retrieved.
```ruby
http://localhost:<PORT>/assets/<id>/file
```
5. metadata can be retrieved by navigating to the to following url
- **note** metadata will be **redacted** when the request m1as-user-id header is discrepant from the file's ownerId. 
```ruby
http://localhost:<PORT>/assets/<id>
```
6. to delete a file execute the following curl
```ruby
curl -v -X DELETE http://localhost:<PORT>/assets/<id> \
```
7. m1as configuration settings should be handled in the .env file. The m1as demo configuration is the following:
```ruby
M1AS_MAX_FILE_SIZE_BYTES=10485760
M1AS_MAX_JSON_UPLOAD_BYTES=2097152
M1AS_ALLOWED_MIME_TYPES=image/png,image/jpeg,image/webp,image/gif
M1AS_LOGGER=console
# values: console | file | cloud | none
M1AS_LOG_FILE=./logs/m1as.log
M1AS_LOG_LEVEL=debug
# values: error | warn | info | debug | none
M1AS_SERVER_PORT=3000
```
---

## Versioning

This repository represents:

* **m1as – v1.0.0**

Breaking changes are expected prior to a production release.

---

## Hardening Initiative (Next Phase)

The next phase will be conducted in a **separate Quartzion-owned clone** of this repository and tracked via GitHub Issues.

Planned focus areas include:

* Input validation & schema enforcement
* Authentication & authorization hooks
* Rate limiting & abuse prevention
* Secure headers & transport guarantees
* Observability (logging, metrics)
* Storage encryption & integrity checks

---

## Ownership & Attribution

Developed by Peter J Smith (peteCodes4u) for **Quartzion Technology Solutions Corp.**

This project is part of Quartzion’s broader mission to build ethical, scalable, and resilient technology systems.

---

## Status

🚧 **Proof of Concept – Active Development**


## Physical Repository Layout (POC Implementation)
```ruby
├─ adapters/
|  ├─ AssetHttpAdapter.ts       ← interface handling requests/responses for any framework. 
|  └─ express/
│     ├─ assetRouter.ts         ← framework-agnostic CRUD operations
|     ├─ ExpressAssetAdapter.ts ← contract handling requests/responses for any framework. Specifically handles multipart form submission (post)
│     ├─ jsonAssetRouter.ts     ← json adapter for upload via json
│     └─ index.ts
│
├─ config/
|  └─ m1asConfig.ts             ← configuration settings
├─ core/
|  ├─ logging/
|  |    └─ createLogger.ts      ← m1asLogger
|  |
|  └─ assets/
│     ├─ assetManager.ts        ← storage + validation
│     ├─ mongoAssetRepo.ts      ← MongoDB logic
│     ├─ index.ts
│     ├─ mongooseModels.ts
│     ├─ contracts.ts
│     └─ types.ts
│
├─ logs/
|  └─ m1as.log                  ← m1asLogger log file location. For use when M1AS_LOGGER=file.
│  
├─ server/
│  ├─ m1asServer.ts
|  └─ db/
│     └─ mongoClient.ts  
│
├─ storage/  
│  └─ mongo/
│     ├─ index.ts                
│     └─ mongoStorageAdapter.ts  ← m1as storage adapter. 
│
├─ .gitignore
├─ .env
├─ LICENSE
├─ package.json
├─ README.md
└─ tsconfig.json
```
