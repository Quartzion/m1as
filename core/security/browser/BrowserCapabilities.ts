export type BrowserPreviewCapability =
    | "none"
    | "inline"
    | "sandboxed";


export interface BrowserCapabilities {

    canStream: boolean;

    canPreview: boolean;

    previewMode: BrowserPreviewCapability;

    canDownload: boolean;

}