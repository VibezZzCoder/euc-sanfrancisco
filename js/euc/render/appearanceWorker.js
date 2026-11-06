// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { paintAppearancePixels } from './appearancePixelImports.js';
import { appearanceCacheTransferBuffers } from './appearanceRegistry.js';
let accepted = false;
globalThis.onmessage = async (event) => {
    if (accepted)
        return;
    accepted = true;
    const id = event.data?.id;
    try {
        const start = performance.now();
        const caches = await paintAppearancePixels(id, event.data.inputs);
        const transfer = appearanceCacheTransferBuffers(caches);
        globalThis.postMessage({ id, caches, paintMs: performance.now() - start,
            pixelBytes: transfer.reduce((n, buffer) => n + buffer.byteLength, 0) }, transfer);
    }
    catch (error) {
        globalThis.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
