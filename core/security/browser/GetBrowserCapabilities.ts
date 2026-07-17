import {
    getBrowserContentPolicy
} from "./BrowserContentPolicy.js";

import {
    BrowserCapabilities
} from "./BrowserCapabilities.js";


export function getBrowserCapabilities(
    mimeType: string
): BrowserCapabilities {

    const policy =
        getBrowserContentPolicy(mimeType);


    return {

        canStream: true,

        canPreview: policy.supportsPreview,

        previewMode:
            policy.supportsPreview
                ? policy.previewMode
                : "none",

        canDownload: false
    };
}