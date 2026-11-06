// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/world.ts + reviewed d37efc0 declarations (MANIFEST.json) (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export function createGroundSample() {
    return {
        height: 0,
        normal: { x: 0, y: 1, z: 0 },
        surface: 'pavement',
        traction: undefined,
        offCourse: false,
    };
}
export function copyGroundSample(from, to) {
    to.height = from.height;
    to.normal.x = from.normal.x;
    to.normal.y = from.normal.y;
    to.normal.z = from.normal.z;
    to.surface = from.surface;
    to.traction = from.traction;
    to.offCourse = from.offCourse;
}
