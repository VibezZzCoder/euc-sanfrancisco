// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
const prepared = new Map();
const caches = new Map();
export function registerPreparedAppearance(id, appearance) {
    prepared.delete(id);
    prepared.set(id, appearance);
    while (prepared.size > 2)
        prepared.delete(prepared.keys().next().value);
    return appearance;
}
export function preparedRiderLook(id) {
    const value = prepared.get(id);
    if (!value)
        throw new Error('Appearance not prepared: ' + id);
    return value.look;
}
export function preparedMachineLook(id) {
    for (const value of prepared.values())
        if (value.machine.machine === id)
            return value.machine;
    throw new Error('Machine appearance not prepared: ' + id);
}
export function registerAppearanceCache(id, release, arrays, snapshot, install) { caches.set(id, { release, arrays, snapshot, install }); }
export function releaseAppearanceCaches() { for (const cache of caches.values())
    cache.release(); }
export function appearanceCacheSnapshot() {
    return Object.fromEntries([...caches].filter(([, cache]) => cache.arrays().some(Boolean))
        .map(([id, cache]) => [id, cache.snapshot()]));
}
export function appearanceCacheTransferBuffers(snapshot) {
    const buffers = new Set();
    const visit = value => {
        if (ArrayBuffer.isView(value)) {
            buffers.add(value.buffer);
            return;
        }
        if (value && typeof value === 'object')
            for (const child of Object.values(value))
                visit(child);
    };
    visit(snapshot);
    return [...buffers];
}
export function installAppearanceCachePixels(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
        throw new Error('Invalid appearance pixel bank');
    for (const [id, bank] of Object.entries(snapshot)) {
        if (!caches.has(id) || !(bank?.pixels instanceof Uint8Array) || bank.pixels.byteLength === 0) {
            throw new Error('Invalid appearance pixel cache: ' + id);
        }
    }
    const bytes = appearanceCacheTransferBuffers(snapshot).reduce((n, b) => n + b.byteLength, 0);
    if (bytes > 16 * 1024 * 1024)
        throw new Error('Appearance pixel bank exceeds selected-rider budget');
    releaseAppearanceCaches();
    for (const [id, bank] of Object.entries(snapshot))
        caches.get(id).install(bank);
}
export function appearanceResourceStats() {
    const buffers = new Set();
    for (const cache of caches.values())
        for (const array of cache.arrays())
            if (array)
                buffers.add(array.buffer);
    return { cachedPixelBuffers: buffers.size, cachedPixelBytes: [...buffers].reduce((n, b) => n + b.byteLength, 0),
        registeredCaches: caches.size, preparedIds: [...prepared.keys()] };
}
