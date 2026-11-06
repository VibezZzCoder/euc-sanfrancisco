// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/gnarwheelLook.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.js';
import { GNARWHEEL_LOGO_ASPECT } from '../data/gnarwheelLogoAsset.js';
import { loftGeometry, loftPoint, loftProfile, mergeGeometries, shaded, tintOver, vAtHeight } from './blockoutKit.js';
import { GNARWHEEL_REGIONS, createGnarwheelAtlas } from './gnarwheelAtlas.js';
import { SEAL_ON_A_WHEEL_LOOK as BASE } from './sealOnAWheelLook.js';
const mat = (colour, roughness, metalness = 0) => Object.freeze({ colour, roughness, metalness });
const CLOTH = mat(C.gnarwheelCloth, .94), TROUSER = mat(C.gnarwheelPrint, .88);
const SHELL = mat(C.gnarwheelHelmet, .42), GLASS = mat(C.gnarwheelVisor, .12, .08);
const GEAR = mat(C.gnarwheelGuard, .52), PRINT = mat(C.gnarwheelPrint, .94);
const profile = (rows, square = 2.5) => loftProfile(rows.map(([y, halfWidth, halfDepth, z = 0]) => ({ y: y, halfWidth: halfWidth, halfDepth: halfDepth, z, square })));
export const GNARWHEEL_TORSO = profile([
    [-.014, .193, .119], [.006, .201, .125], [.036, .205, .128], [.076, .202, .130],
    [.116, .197, .132], [.156, .193, .132], [.196, .192, .132], [.236, .191, .131],
    [.276, .192, .130], [.316, .193, .130], [.356, .193, .129], [.396, .192, .124],
    [.436, .188, .118], [.476, .178, .111], [.516, .148, .090], [.548, .089, .072],
]);
export const GNARWHEEL_HOOD = profile([
    [.445, .025, .006, -.115], [.457, .055, .011, -.116], [.477, .095, .012, -.117],
    [.498, .109, .017, -.111], [.505, .111, .020, -.108], [.514, .110, .022, -.106],
    [.523, .100, .020, -.106], [.531, .089, .012, -.086], [.549, .045, .008, -.062],
    [.561, 0, 0, -.030],
], 2.2);
export const GNARWHEEL_SEAT = profile([
    [-.118, .146, .077, .018], [-.088, .163, .089, .013], [-.055, .178, .108, .009],
    [-.020, .191, .118, .004], [.030, .176, .109],
], 2.25);
const UPPER = profile([[.034, 0, 0], [.028, .029, .029], [.014, .052, .051], [0, .064, .061],
    [-.040, .065, .061], [-.080, .064, .059], [-.120, .062, .057], [-.160, .059, .055],
    [-.200, .057, .053], [-.240, .054, .050], [-.280, .051, .048]], 2.3);
export const GNARWHEEL_FOREARM = profile([[0, .051, .048], [-.035, .053, .049], [-.070, .053, .048],
    [-.105, .050, .045], [-.140, .047, .043], [-.175, .044, .040], [-.210, .040, .036],
    [-.240, .039, .034], [-.258, .038, .033], [-.267, .034, .029]], 2.3);
const printPatch = (anchor, art, centre) => {
    const half = .56, v = vAtHeight(GNARWHEEL_TORSO, centre);
    let width = 0, previous = loftPoint(GNARWHEEL_TORSO, Math.PI / 2 - half, v, new THREE.Vector3());
    for (let i = 1; i <= 64; i += 1) {
        const p = loftPoint(GNARWHEEL_TORSO, Math.PI / 2 - half + 2 * half * i / 64, v, new THREE.Vector3());
        width += p.distanceTo(previous);
        previous = p;
    }
    const height = width / GNARWHEEL_LOGO_ASPECT;
    return { anchor, art, u0: -half, u1: half, from: centre - height / 2, to: centre + height / 2,
        uSegments: 16, vSegments: 5, lift: .0015, sink: -.003, shade: 1 };
};
export const GNARWHEEL_PRINTS = Object.freeze([
    Object.freeze(printPatch('front', 'chest', .338)), Object.freeze(printPatch('back', 'back', .337)),
]);
function clothPaint(g) {
    const p = g.getAttribute('position'), c = g.getAttribute('color');
    for (let i = 0; i < p.count; i += 1) {
        const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
        const waist = Math.exp(-(((y - .065) / .055) ** 2));
        const shade = 1 - .10 * waist * (.5 + .5 * Math.cos(x * 65 + z * 24));
        c.setXYZ(i, shade, shade, shade);
    }
}
function glovePaint(g, side) {
    const p = g.getAttribute('position'), c = g.getAttribute('color');
    const navy = tintOver(C.gnarwheelGuard, C.gnarwheelGlove);
    const motif = tintOver(C.gnarwheelGuard, C.gnarwheelGlovePattern);
    for (let i = 0; i < p.count; i += 1) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const back = side * x > .014;
        const curl = Math.sin(y * 155 + Math.sin(z * 145) * 1.8 + x * 100);
        const tint = back && y < -.027 && curl > .62 ? motif : navy;
        const palm = side * x < -.01 ? .68 : 1;
        c.setXYZ(i, tint[0] * palm, tint[1] * palm, tint[2] * palm);
    }
}
function shoePaint(g) {
    const positions = g.getAttribute('position');
    const soleTop = -B.ankleAbovePedal + .018, upperCentre = soleTop + .047;
    for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y > soleTop + 1e-6 && y < upperCentre - 1e-6)
            positions.setY(i, soleTop - .001);
    }
    g.computeVertexNormals();
}
export function gnarwheelCamera() {
    const tinted = (g, colour) => {
        shaded(g);
        const tint = tintOver(C.gnarwheelHelmet, colour), c = g.getAttribute('color');
        for (let i = 0; i < c.count; i += 1)
            c.setXYZ(i, ...tint);
        return g;
    };
    const box = (size, at, colour) => tinted(new THREE.BoxGeometry(...size), colour).translate(...at);
    const lens = tinted(new THREE.CylinderGeometry(.015, .015, .009, 20), C.gnarwheelVisor)
        .rotateX(Math.PI / 2).translate(-.013, .100, .231);
    return mergeGeometries([
        box([.027, .016, .100], [0, .067, .163], C.gnarwheelGuard),
        box([.018, .027, .024], [0, .080, .204], C.gnarwheelGuard),
        box([.072, .049, .035], [0, .100, .211], C.gnarwheelCamera),
        box([.063, .040, .004], [0, .100, .230], C.gnarwheelCameraRim),
        box([.026, .023, .006], [.019, .100, .234], C.gnarwheelVisor), lens,
    ]);
}
function hoodieDetails() {
    const parts = [];
    for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * .052, .525, .078), new THREE.Vector3(side * .055, .480, .109),
            new THREE.Vector3(side * .046, .438, .129), new THREE.Vector3(side * .048, .401, .133),
        ]);
        parts.push(shaded(new THREE.TubeGeometry(curve, 10, .0022, 5, false), .78));
    }
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.133, .154, .104), new THREE.Vector3(-.096, .195, .127),
        new THREE.Vector3(0, .201, .135), new THREE.Vector3(.096, .195, .127),
        new THREE.Vector3(.133, .154, .104),
    ]);
    parts.push(shaded(new THREE.TubeGeometry(curve, 24, .0025, 5, false), .74));
    return mergeGeometries(parts);
}
function foldedHood() {
    const hood = loftGeometry(GNARWHEEL_HOOD, { radialSegments: 32 });
    const positions = hood.getAttribute('position'), colours = hood.getAttribute('color');
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const back = z < -.090;
        const foldY = .514 + .012 * (x / .10) ** 2;
        const fold = back ? Math.exp(-(((y - foldY) / .006) ** 2))
            * Math.max(0, 1 - (x / .10) ** 4) : 0;
        positions.setZ(i, z + .018 * fold);
        const shade = 1 - .66 * fold;
        colours.setXYZ(i, shade, shade, shade);
    }
    hood.computeVertexNormals();
    return hood;
}
export const GNARWHEEL_LOOK = Object.freeze({
    ...BASE, id: 'gnarwheel', continuousJoints: true, drapedHem: true,
    hemDrapeEnvelope: Object.freeze({ x: .092, z: .087, cap: .070 }),
    density: Object.freeze({ limb: 18, torso: 30, head: 32, boot: 16, hand: 18 }),
    materials: Object.freeze({ body: CLOTH, limbs: TROUSER, accent: PRINT, head: SHELL, face: GLASS, gear: GEAR }),
    build: Object.freeze({ ...BASE.build, head: () => mergeGeometries([
            loftGeometry(BASE.profiles.head, { radialSegments: 32 }), gnarwheelCamera(),
        ]) }),
    profiles: Object.freeze({ ...BASE.profiles, torso: GNARWHEEL_TORSO, upperArm: UPPER,
        forearm: GNARWHEEL_FOREARM, seat: GNARWHEEL_SEAT }),
    shades: Object.freeze({ seat: .82, legs: 1, collar: 1, sole: .60, neck: .75 }),
    parts: Object.freeze({ hands: 'gear', neck: 'limbs', kneePad: 'gear', legs: 'limbs', seat: 'body' }),
    atlas: Object.freeze({ paintInput: () => ({ cache: 'gnarwheelAtlas.ts', args: [GNARWHEEL_FOREARM] }),
        build: () => createGnarwheelAtlas(GNARWHEEL_FOREARM),
        roles: Object.freeze(['accent', 'limbs']),
        lofts: Object.freeze({ upperArm: 'limb', forearm: (side) => side > 0 ? 'forearmLeft' : 'forearmRight',
            thigh: 'limb', shin: 'limb', neck: 'limb' }),
        region: (art) => GNARWHEEL_REGIONS[art] ?? GNARWHEEL_REGIONS.limb }),
    panels: Object.freeze({
        torso: Object.freeze({ role: 'accent', casts: false, patches: GNARWHEEL_PRINTS }),
        thighPad: Object.freeze({ role: 'gear', casts: false, ghostSilhouette: true,
            patches: Object.freeze([Object.freeze({ anchor: 'front', u0: -.70, u1: .70,
                    from: -.395, to: -.302, uSegments: 16, vSegments: 5, lift: .011, sink: -.007,
                    taper: .50, bulge: .10 })]) }),
        kneePad: Object.freeze({ role: 'gear', casts: false, ghostSilhouette: true,
            patches: Object.freeze([
                Object.freeze({ anchor: 'front', u0: -.76, u1: .76, from: -.032, to: 0,
                    uSegments: 16, vSegments: 3, lift: .015, sink: -.007, taper: .32 }),
                Object.freeze({ anchor: 'front', u0: -.80, u1: .80, from: -.266, to: -.034,
                    uSegments: 12, vSegments: 8, lift: .012, sink: -.007, taper: .32 }),
            ]) }),
        head: Object.freeze(BASE.panels.head.map(({ art: _art, ...patch }) => Object.freeze(patch))),
        face: Object.freeze({ ...BASE.panels.face, patches: Object.freeze(BASE.panels.face.patches.map(p => Object.freeze({ ...p, u0: -1.10, u1: 1.10, lift: .002, sink: -.010,
                taper: .52, bulge: .04 }))) }),
    }),
    extras: Object.freeze([
        Object.freeze({ name: 'rider-gnarwheel-hood', joint: 'pelvis', role: 'body', casts: true,
            build: () => mergeGeometries([foldedHood(), hoodieDetails()]) }),
    ]),
    paint: Object.freeze({ torso: clothPaint, upperArm: clothPaint, forearm: clothPaint,
        hand: glovePaint, thigh: clothPaint, shin: clothPaint, boot: shoePaint }),
    armCarriage: Object.freeze({ splay: .014, rise: 0 }),
});
