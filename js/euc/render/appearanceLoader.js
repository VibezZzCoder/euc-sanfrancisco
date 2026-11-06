// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { importAppearance, isAppearanceId, appearancePixelCacheIds } from './appearanceImports.js';
import { registerPreparedAppearance, installAppearanceCachePixels, releaseAppearanceCaches, appearanceResourceStats as cacheStats } from './appearanceRegistry.js';
export { releaseAppearanceCaches } from './appearanceRegistry.js';
let activeJob = null;
export function appearanceResourceStats() {
    return { ...cacheStats(), activePreparation: activeJob?.id ?? null, workerActive: !!activeJob?.worker };
}
function abortError() { return new DOMException('Appearance preparation cancelled', 'AbortError'); }
export function prepareAppearance(id, { signal, prepaint = true } = {}) {
    if (!isAppearanceId(id))
        return Promise.reject(new Error('Unknown playable appearance: ' + String(id)));
    if (signal?.aborted)
        return Promise.reject(abortError());
    activeJob?.cancel();
    releaseAppearanceCaches();
    return new Promise((resolve, reject) => {
        const job = { id, worker: null, done: false, cancel: () => finish(abortError()) };
        const finish = (error, appearance) => {
            if (job.done)
                return;
            job.done = true;
            signal?.removeEventListener('abort', job.cancel);
            if (job.worker) {
                job.worker.onmessage = job.worker.onerror = job.worker.onmessageerror = null;
                job.worker.terminate();
                job.worker = null;
            }
            if (activeJob === job)
                activeJob = null;
            if (error)
                reject(error);
            else
                resolve(registerPreparedAppearance(id, appearance));
        };
        activeJob = job;
        signal?.addEventListener('abort', job.cancel, { once: true });
        importAppearance(id).then(appearance => {
            if (job.done)
                return;
            if (!prepaint || typeof Worker === 'undefined' || (!appearance.look.atlas && !appearance.machine.atlas)) {
                finish(null, appearance);
                return;
            }
            try {
                const worker = job.worker = new Worker(new URL('./appearanceWorker.js', import.meta.url), { type: 'module', name: 'euc-appearance-pixels' });
                worker.onmessage = event => {
                    if (job.done || activeJob !== job)
                        return;
                    try {
                        if (event.data?.id !== id)
                            throw new Error('Appearance worker returned the wrong rider');
                        if (event.data.error)
                            throw new Error(event.data.error);
                        if (JSON.stringify(Object.keys(event.data.caches ?? {}).sort()) !== JSON.stringify([...appearancePixelCacheIds(id)].sort())) {
                            throw new Error('Appearance worker returned an incomplete pixel bank');
                        }
                        installAppearanceCachePixels(event.data.caches);
                        finish(null, appearance);
                    }
                    catch (error) {
                        finish(error);
                    }
                };
                worker.onerror = event => { event.preventDefault?.(); finish(new Error(event.message || 'Appearance worker failed')); };
                worker.onmessageerror = () => finish(new Error('Appearance worker pixel transfer failed'));
                const inputs = Object.fromEntries([appearance.look.atlas, appearance.machine.atlas].filter(Boolean).map(atlas => {
                    if (typeof atlas.paintInput !== 'function')
                        throw new Error('Appearance is missing its painting input');
                    const { cache, args } = atlas.paintInput();
                    return [cache, args];
                }));
                worker.postMessage({ id, inputs });
            }
            catch (error) {
                finish(error);
            }
        }, cause => {
            if (job.done)
                return;
            if (cause?.name === 'AbortError') {
                finish(cause);
                return;
            }
            const error = new Error('Rider appearance module could not load. Reload NYC to retry this download.', { cause });
            error.reloadRequired = true;
            finish(error);
        });
    });
}
