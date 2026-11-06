// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/rider.ts (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { solveRagdollLeg, solveRagdollLimb } from '../shared/ragdollBoot.js';
import { joinRiderSurface } from './riderJointSurface.js';
import { drapeRiderHem } from './riderClothDrape.js';
import { EUC, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.js';
import { clamp, clamp01, lerp } from '../shared/maths.js';
import { loftGeometry, mapUvInto, mergeGeometries, patchGeometry, vAtHeight, } from './blockoutKit.js';
import { riderLook, MOTION_STILL, } from './riderLook.js';
export function armEaseForSpeed(speed) {
    const t = clamp01((Math.abs(speed) - RIDER_BLOCKOUT.armEaseFullBelow)
        / (RIDER_BLOCKOUT.armEaseGoneAbove - RIDER_BLOCKOUT.armEaseFullBelow));
    return 1 - t * t * (3 - 2 * t);
}
export function createStanceInput() {
    return {
        rollAngle: 0,
        riderPitch: 0,
        torsoPitch: 0,
        lookYaw: 0,
        turnTwist: 0,
        technicalTurn: 0,
        restFactor: 0,
        groundY: 0,
        crouch: 0,
        tuck: 0,
        attack: 0,
        carveStance: 0,
        airBlend: 0,
        falling: false,
        pedalStrike: 0,
        wobbleFootCorrection: 0,
        wobbleYaw: 0,
        pedalRoll: 0,
        wobbleSway: 0,
        wobbleFight: 0,
        crash: 0,
        ragdollBlend: 0,
        ragdollHead: new THREE.Vector3(),
        ragdollHandL: new THREE.Vector3(),
        ragdollHandR: new THREE.Vector3(),
        ragdollFootL: new THREE.Vector3(),
        ragdollFootR: new THREE.Vector3(),
        ragdollJointPoles: new Float32Array(12),
        ragdollRootWorldPosition: new THREE.Vector3(),
        ragdollRootWorldQuaternion: new THREE.Quaternion(),
        ragdollForwardWorld: new THREE.Vector3(0, 0, 1),
        ragdollHeadingY: 0,
        ragdollUp: new THREE.Vector3(0, 1, 0),
        reverse: 0,
        swingAngle: 0,
        swingBlend: 0,
        styleSway: 0,
        oneFoot: 0,
        oneFootSide: 0,
        armEase: 0,
        carry: 0,
    };
}
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
function easedHandTarget(shoulder, base, side) {
    const upper = RIDER_BLOCKOUT.upperArmLength;
    const lower = RIDER_BLOCKOUT.forearmLength;
    const out = Math.abs(base.x - shoulder.x) - RIDER_BLOCKOUT.armEaseIn;
    const forward = base.z - shoulder.z + RIDER_BLOCKOUT.armEaseForward;
    const drop = base.y - shoulder.y;
    const elbow = RIDER_BLOCKOUT.armEaseElbow - (side < 0 ? RIDER_BLOCKOUT.armEaseElbowRightBend : 0);
    const reach = upper * upper + lower * lower - 2 * upper * lower * Math.cos(elbow);
    const bent = -Math.sqrt(Math.max(0, reach - out * out - forward * forward));
    const y = shoulder.y + Math.min(drop + RIDER_BLOCKOUT.armEaseRiseMax, Math.max(drop, bent));
    return new THREE.Vector3(shoulder.x + Math.sign(side) * out, y, shoulder.z + forward);
}
const SOLVE_TO_TARGET = new THREE.Vector3();
const SOLVE_DIRECTION = new THREE.Vector3();
const SOLVE_PERPENDICULAR = new THREE.Vector3();
const SOLVE_MIDDLE = new THREE.Vector3();
const SOLVE_AIM = new THREE.Vector3();
const SOLVE_INVERSE = new THREE.Quaternion();
const RAG_TARGET = new THREE.Vector3();
const SWING_TARGET = new THREE.Vector3();
const RAG_ANKLE = new THREE.Quaternion();
const RAG_LOCAL = new THREE.Quaternion();
const RAG_LEG_HIP = new THREE.Vector3();
const RAG_LEG_FOOT = new THREE.Vector3();
const RAG_ROOT_INVERSE = new THREE.Quaternion();
const RAG_PELVIS_LOCAL_INVERSE = new THREE.Quaternion();
const RAG_PELVIS_WORLD = new THREE.Quaternion();
const RAG_PELVIS_WORLD_INVERSE = new THREE.Quaternion();
const RAG_PELVIS_POSITION = new THREE.Vector3();
const RAG_LEG_SOLVE = new Float64Array(36);
function writeRagLegBasis(at, q) {
    const m11 = RAG_LEG_SOLVE[at], m12 = RAG_LEG_SOLVE[at + 3], m13 = RAG_LEG_SOLVE[at + 6];
    const m21 = RAG_LEG_SOLVE[at + 1], m22 = RAG_LEG_SOLVE[at + 4], m23 = RAG_LEG_SOLVE[at + 7];
    const m31 = RAG_LEG_SOLVE[at + 2], m32 = RAG_LEG_SOLVE[at + 5], m33 = RAG_LEG_SOLVE[at + 8], trace = m11 + m22 + m33;
    if (trace > 0) {
        const s = .5 / Math.sqrt(trace + 1);
        q.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, .25 / s);
    }
    else if (m11 > m22 && m11 > m33) {
        const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
        q.set(.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    }
    else if (m22 > m33) {
        const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
        q.set((m12 + m21) / s, .25 * s, (m23 + m32) / s, (m13 - m31) / s);
    }
    else {
        const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
        q.set((m13 + m31) / s, (m23 + m32) / s, .25 * s, (m21 - m12) / s);
    }
}
function solveChain(chain, upperOut, lowerOut) {
    SOLVE_TO_TARGET.copy(chain.target).sub(chain.origin);
    const reach = SOLVE_TO_TARGET.length();
    if (reach < 1e-9) {
        upperOut.identity();
        lowerOut.identity();
        return;
    }
    SOLVE_DIRECTION.copy(SOLVE_TO_TARGET).multiplyScalar(1 / reach);
    const along = Math.min(Math.max((chain.upperLength ** 2 - chain.lowerLength ** 2 + reach ** 2) / (2 * reach), -chain.upperLength), chain.upperLength);
    const offset = Math.sqrt(Math.max(0, chain.upperLength ** 2 - along ** 2));
    SOLVE_PERPENDICULAR.copy(chain.bendToward)
        .addScaledVector(SOLVE_DIRECTION, -chain.bendToward.dot(SOLVE_DIRECTION));
    if (SOLVE_PERPENDICULAR.lengthSq() < 1e-12)
        SOLVE_PERPENDICULAR.set(0, 0, 1);
    SOLVE_PERPENDICULAR.normalize();
    SOLVE_MIDDLE.copy(chain.origin)
        .addScaledVector(SOLVE_DIRECTION, along)
        .addScaledVector(SOLVE_PERPENDICULAR, offset);
    upperOut.setFromUnitVectors(DOWN, SOLVE_AIM.copy(SOLVE_MIDDLE).sub(chain.origin).normalize());
    SOLVE_INVERSE.copy(upperOut).invert();
    lowerOut.setFromUnitVectors(DOWN, SOLVE_AIM.copy(chain.target).sub(SOLVE_MIDDLE).normalize().applyQuaternion(SOLVE_INVERSE));
}
function outboardAngle(side) {
    return side > 0 ? 0 : Math.PI;
}
export function createPlaceholderRider(look = riderLook('cool-rider')) {
    const root = new THREE.Group();
    root.name = 'rider-blockout';
    const geometries = [];
    const materials = [];
    const textures = [];
    const track = (geometry) => {
        geometries.push(geometry);
        return geometry;
    };
    const trackMaterial = (material) => {
        materials.push(material);
        return material;
    };
    const atlas = look.atlas;
    const sheet = atlas === undefined ? null : atlas.build();
    if (sheet !== null)
        textures.push(sheet);
    const mapsRole = (role) => (atlas !== undefined
        && atlas.roles.some((mapped) => look.materials[mapped] === look.materials[role]));
    const paged = (geometry, role, art) => (atlas !== undefined && mapsRole(role) ? mapUvInto(geometry, atlas.region(art)) : geometry);
    const built = new Map();
    const materialFor = (role, override) => {
        const spec = override ?? look.materials[role];
        const existing = built.get(spec);
        if (existing !== undefined)
            return existing;
        const material = trackMaterial(new THREE.MeshStandardMaterial({
            color: spec.colour,
            roughness: spec.roughness,
            metalness: spec.metalness,
            emissive: spec.emissive ?? 0x000000,
            emissiveIntensity: spec.emissiveIntensity ?? 1,
            opacity: spec.opacity ?? 1,
            transparent: spec.opacity !== undefined && spec.opacity < 1,
            depthWrite: spec.opacity === undefined || spec.opacity >= 1,
            vertexColors: true,
            map: sheet !== null && override === undefined && mapsRole(role) ? sheet : null,
        }));
        built.set(spec, material);
        return material;
    };
    const bodyMaterial = materialFor('body');
    const headMaterial = materialFor('head');
    const gearMaterial = materialFor('gear');
    const handMaterial = materialFor(look.parts.hands);
    const { profiles, shades, panels } = look;
    const density = {
        limb: look.density?.limb ?? 14,
        torso: look.density?.torso ?? 24,
        head: look.density?.head ?? 20,
        boot: look.density?.boot ?? 12,
        hand: look.density?.hand ?? 10,
        neck: look.density?.neck ?? 12,
    };
    const shadowed = (mesh) => {
        mesh.castShadow = true;
        return mesh;
    };
    const surfaceUpdates = [];
    const limb = (profile, role, shade, paintwork, side = 1, page, openEnd) => {
        const geometry = track(paged(loftGeometry(profile, { radialSegments: density.limb, shade, splitSeam: mapsRole(role),
            capTop: !(look.continuousJoints && openEnd === 'top'),
            capBottom: !(look.continuousJoints && openEnd === 'bottom') }), role, typeof page === 'function' ? page(side) : page));
        paintwork?.(geometry, side);
        const mesh = new THREE.Mesh(geometry, materialFor(role));
        return shadowed(mesh);
    };
    const patchBetween = (profile, options) => {
        const { from, to, ...rest } = options;
        return patchGeometry(profile, {
            ...rest,
            v0: vAtHeight(profile, from),
            v1: vAtHeight(profile, to),
        });
    };
    const anchorAngle = (patch, side) => {
        if (patch.anchor === 'outboard')
            return outboardAngle(side);
        return patch.anchor === 'front' ? Math.PI / 2 : -Math.PI / 2;
    };
    const patchOn = (profile, patch, side) => {
        const centre = anchorAngle(patch, side);
        const sign = patch.mirrored === true ? side : 1;
        return patchBetween(profile, {
            u0: centre + sign * patch.u0,
            u1: centre + sign * patch.u1,
            from: patch.from,
            to: patch.to,
            uSegments: patch.uSegments,
            vSegments: patch.vSegments,
            lift: patch.lift,
            sink: patch.sink,
            taper: patch.taper,
            bulge: patch.bulge,
            bow: patch.bow,
            skew: patch.skewFrom !== undefined && patch.skewTo !== undefined
                ? vAtHeight(profile, patch.skewFrom) - vAtHeight(profile, patch.skewTo)
                : undefined,
            shade: patch.shade,
        });
    };
    const panelMesh = (name, group, profile, side) => {
        const parts = [];
        const pageFor = (patch, patchSide) => (patch.artOn !== undefined && Math.sign(patch.artOn) !== Math.sign(patchSide)
            ? patch.artElse
            : patch.art);
        const add = (patch, patchSide) => {
            parts.push(paged(patchOn(profile, patch, patchSide), group.role, pageFor(patch, patchSide)));
        };
        for (const patch of group.patches) {
            if (side !== null) {
                add(patch, side);
            }
            else if (patch.mirrored === true || patch.anchor === 'outboard') {
                for (const pairSide of [-1, 1])
                    add(patch, pairSide);
            }
            else {
                add(patch, 1);
            }
        }
        if (group.build) {
            for (const pairSide of side === null ? [-1, 1] : [side]) {
                const page = typeof group.art === 'function' ? group.art(pairSide) : group.art;
                parts.push(paged(group.build(pairSide), group.role, page));
            }
        }
        const mesh = new THREE.Mesh(track(mergeGeometries(parts)), materialFor(group.role));
        mesh.name = name;
        if (group.casts)
            shadowed(mesh);
        if (group.ghostSilhouette)
            mesh.userData.ghostSilhouette = true;
        return mesh;
    };
    const hipHalfWidth = RIDER_BLOCKOUT.torsoWidth * 0.26;
    const ankleY = WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal;
    const legs = [];
    const arms = [];
    const solvedUpper = new THREE.Quaternion();
    const solvedLower = new THREE.Quaternion();
    for (const side of [-1, 1]) {
        const sideName = side > 0 ? 'left' : 'right';
        const hip = new THREE.Group();
        hip.name = `rider-hip-${sideName}`;
        hip.position.set(side * hipHalfWidth, RIDER.hipHeight, 0);
        const ankleTarget = new THREE.Vector3(side * RIDER_BLOCKOUT.stanceHalfWidth, ankleY, 0);
        solveChain({
            origin: hip.position,
            target: ankleTarget,
            upperLength: RIDER_BLOCKOUT.thighLength,
            lowerLength: RIDER_BLOCKOUT.shinLength,
            bendToward: FORWARD,
        }, solvedUpper, solvedLower);
        hip.quaternion.copy(solvedUpper);
        const thighMesh = limb(profiles.thigh, look.parts.legs, shades.legs, look.paint?.thigh, side, atlas?.lofts?.thigh, 'bottom');
        hip.add(thighMesh);
        if (panels.thighPad) {
            hip.add(panelMesh(`rider-thigh-pad-${sideName}`, panels.thighPad, profiles.thigh, side));
        }
        const knee = new THREE.Group();
        knee.name = `rider-knee-${sideName}`;
        knee.position.y = -RIDER_BLOCKOUT.thighLength;
        knee.quaternion.copy(solvedLower);
        const shinMesh = limb(profiles.shin, look.parts.legs, shades.legs, look.paint?.shin, side, atlas?.lofts?.shin, 'top');
        knee.add(shinMesh);
        if (look.continuousJoints)
            surfaceUpdates.push(joinRiderSurface(thighMesh.geometry, shinMesh.geometry, knee, RIDER_BLOCKOUT.thighLength, .09));
        hip.add(knee);
        const ankle = new THREE.Group();
        ankle.name = `rider-ankle-${sideName}`;
        ankle.position.y = -RIDER_BLOCKOUT.shinLength;
        ankle.quaternion.copy(solvedUpper).multiply(solvedLower).invert();
        knee.add(ankle);
        const soleTop = -RIDER_BLOCKOUT.ankleAbovePedal + 0.018;
        const upper = loftGeometry(profiles.boot, { radialSegments: density.boot })
            .rotateX(Math.PI / 2)
            .translate(0, soleTop + 0.047, 0);
        const sole = loftGeometry(profiles.bootSole, { radialSegments: density.boot + 4, shade: shades.sole })
            .translate(0, soleTop, 0.018);
        const bootGeometry = track(mergeGeometries([
            upper, sole, ...(look.build?.boot ?? []).map((build) => build(side)),
        ]));
        look.paint?.boot?.(bootGeometry, side);
        const boot = shadowed(new THREE.Mesh(bootGeometry, gearMaterial));
        boot.name = `rider-boot-${sideName}`;
        ankle.add(boot);
        if (panels.kneePad) {
            knee.add(panelMesh(`rider-knee-pad-${sideName}`, panels.kneePad, profiles.shin, side));
        }
        root.add(hip);
        legs.push({
            side, hip, knee, ankle, target: ankleTarget,
            lastDrop: 0, lastShift: 0, lastOpen: 0, lastLift: 0, lastFootAdjust: 0,
            lastPedalYaw: 0, lastPedalRoll: 0, lastFreed: 0,
        });
    }
    const pelvis = new THREE.Group();
    pelvis.name = 'rider-pelvis';
    pelvis.position.y = RIDER.hipHeight;
    root.add(pelvis);
    const lofts = atlas?.lofts;
    const torsoParts = [paged(loftGeometry(profiles.torso, { radialSegments: density.torso, splitSeam: mapsRole('body'),
            capBottom: !look.drapedHem }), 'body', lofts?.torso)];
    if (look.parts.seat === 'body') {
        torsoParts.push(paged(loftGeometry(profiles.seat, {
            radialSegments: density.torso,
            shade: shades.seat,
            splitSeam: mapsRole('body'),
        }), 'body', lofts?.seat));
    }
    if (panels.collar)
        torsoParts.push(paged(patchOn(profiles.torso, panels.collar, 1), 'body', panels.collar.art));
    const torsoGeometry = track(mergeGeometries(torsoParts));
    look.paint?.torso?.(torsoGeometry);
    const torso = shadowed(new THREE.Mesh(torsoGeometry, bodyMaterial));
    pelvis.add(torso);
    if (look.drapedHem)
        surfaceUpdates.push(drapeRiderHem(torsoGeometry, pelvis, legs.map(leg => leg.hip), {
            radial: density.torso, rings: profiles.torso.length, splitSeam: mapsRole('body'),
            envelope: look.hemDrapeEnvelope,
        }));
    if (look.parts.seat !== 'body') {
        const seat = new THREE.Mesh(track(paged(loftGeometry(profiles.seat, {
            radialSegments: density.torso,
            shade: shades.seat,
            splitSeam: mapsRole(look.parts.seat),
        }), look.parts.seat, lofts?.seat)), materialFor(look.parts.seat));
        seat.name = 'rider-seat';
        pelvis.add(seat);
    }
    if (panels.waist) {
        pelvis.add(panelMesh('rider-belt', panels.waist, profiles.torso, null));
    }
    const shoulderY = RIDER_BLOCKOUT.torsoLength;
    if (panels.shoulders) {
        pelvis.add(panelMesh('rider-shoulder-panels', panels.shoulders, profiles.torso, null));
    }
    if (panels.torso) {
        pelvis.add(panelMesh('rider-jacket-panels', panels.torso, profiles.torso, null));
    }
    let rightGrip = null;
    for (const side of [-1, 1]) {
        const sideName = side > 0 ? 'left' : 'right';
        const shoulder = new THREE.Group();
        shoulder.name = `rider-shoulder-${sideName}`;
        shoulder.position.set(side * RIDER_BLOCKOUT.shoulderHalfWidth, shoulderY, 0);
        const rightArm = side < 0;
        const reach = RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength;
        const baseSplay = RIDER_BLOCKOUT.shoulderHalfWidth + RIDER_BLOCKOUT.armSplay
            + (rightArm ? RIDER_BLOCKOUT.armAsymmetrySplay : 0)
            + look.armCarriage.splay;
        const baseTarget = new THREE.Vector3(side * baseSplay, shoulderY - reach * RIDER_BLOCKOUT.armHangFraction + look.armCarriage.rise, RIDER_BLOCKOUT.handForward + (rightArm ? RIDER_BLOCKOUT.armAsymmetryForward : 0));
        const bendToward = new THREE.Vector3(0, 0, -1);
        const easedTarget = easedHandTarget(shoulder.position, baseTarget, side);
        solveChain({
            origin: shoulder.position,
            target: baseTarget,
            upperLength: RIDER_BLOCKOUT.upperArmLength,
            lowerLength: RIDER_BLOCKOUT.forearmLength,
            bendToward,
        }, solvedUpper, solvedLower);
        shoulder.quaternion.copy(solvedUpper);
        const upperMesh = limb(profiles.upperArm, 'limbs', 1, look.paint?.upperArm, side, atlas?.lofts?.upperArm, 'bottom');
        shoulder.add(upperMesh);
        if (panels.sleeve) {
            shoulder.add(panelMesh(`rider-sleeve-${sideName}`, panels.sleeve, profiles.upperArm, side));
        }
        if (profiles.sleeve) {
            const sleeve = new THREE.Mesh(track(loftGeometry(profiles.sleeve, { radialSegments: density.limb })), bodyMaterial);
            sleeve.name = `rider-cap-sleeve-${sideName}`;
            shoulder.add(sleeve);
        }
        const elbow = new THREE.Group();
        elbow.name = `rider-elbow-${sideName}`;
        elbow.position.y = -RIDER_BLOCKOUT.upperArmLength;
        elbow.quaternion.copy(solvedLower);
        const forearmMesh = limb(profiles.forearm, 'limbs', 1, look.paint?.forearm, side, atlas?.lofts?.forearm, 'top');
        elbow.add(forearmMesh);
        if (look.continuousJoints)
            surfaceUpdates.push(joinRiderSurface(upperMesh.geometry, forearmMesh.geometry, elbow, RIDER_BLOCKOUT.upperArmLength, .055));
        if (panels.elbowPad) {
            elbow.add(panelMesh(`rider-elbow-pad-${sideName}`, panels.elbowPad, profiles.forearm, side));
        }
        shoulder.add(elbow);
        const handParts = [loftGeometry(profiles.hand, { radialSegments: density.hand })];
        for (const build of look.build?.hand ?? [])
            handParts.push(build(side));
        const handPage = atlas?.lofts?.hand;
        const handGeometry = track(paged(mergeGeometries(handParts), look.parts.hands, typeof handPage === 'function' ? handPage(side) : handPage));
        look.paint?.hand?.(handGeometry, side);
        const hand = shadowed(new THREE.Mesh(handGeometry, handMaterial));
        hand.name = `rider-hand-${sideName}`;
        hand.position.y = -RIDER_BLOCKOUT.forearmLength + 0.012;
        elbow.add(hand);
        const grip = new THREE.Group();
        grip.name = `rider-grip-${sideName}`;
        grip.position.copy(hand.position);
        elbow.add(grip);
        if (side < 0)
            rightGrip = grip;
        pelvis.add(shoulder);
        arms.push({
            side,
            shoulder,
            elbow,
            baseTarget,
            target: baseTarget.clone(),
            baseSplay,
            bendToward,
            easedTarget,
            easedSplay: Math.abs(easedTarget.x),
            easedBend: new THREE.Vector3(),
            hand,
            lastSplay: 0,
            lastForward: 0,
            lastRise: 0,
            lastSwing: 0,
            lastEase: 0,
        });
    }
    const neck = new THREE.Group();
    neck.name = 'rider-neck';
    neck.position.y = shoulderY;
    pelvis.add(neck);
    const neckRole = look.parts.neck ?? 'limbs';
    const neckMesh = shadowed(new THREE.Mesh(track(paged(loftGeometry(profiles.neck, { radialSegments: density.neck, shade: shades.neck, splitSeam: mapsRole(neckRole) }), neckRole, atlas?.lofts?.neck)), materialFor(neckRole)));
    neck.add(neckMesh);
    const headParts = [paged(look.build?.head?.() ?? loftGeometry(profiles.head, { radialSegments: density.head, splitSeam: mapsRole('head') }), 'head', atlas?.lofts?.head)];
    for (const patch of panels.head)
        headParts.push(paged(patchOn(profiles.head, patch, 1), 'head', patch.art));
    const head = shadowed(new THREE.Mesh(track(mergeGeometries(headParts)), headMaterial));
    neck.add(head);
    if (panels.face) {
        neck.add(panelMesh('rider-face', panels.face, profiles.head, null));
    }
    let sway = null;
    for (const extra of look.extras) {
        const mesh = new THREE.Mesh(track(extra.material ? extra.build() : paged(extra.build(), extra.role, extra.art)), materialFor(extra.role, extra.material));
        mesh.name = extra.name;
        if (extra.casts)
            shadowed(mesh);
        const joint = extra.joint === 'neck' ? neck : pelvis;
        if (extra.sways) {
            if (sway === null) {
                sway = new THREE.Group();
                sway.name = 'rider-hair-sway';
                joint.add(sway);
            }
            sway.add(mesh);
        }
        else {
            joint.add(mesh);
        }
    }
    const hairSway = sway;
    pelvis.rotation.x = RIDER_BLOCKOUT.torsoRestPitch;
    const HAIR_NECK_REST = -clamp(RIDER_BLOCKOUT.torsoRestPitch * RIDER_BLOCKOUT.headStabilizationFactor, -RIDER_BLOCKOUT.headStabilizationMax, RIDER_BLOCKOUT.headStabilizationMax);
    const HAIR_REST = new THREE.Quaternion();
    const HAIR_EULER = new THREE.Euler();
    const HAIR_TARGET = new THREE.Quaternion();
    const HAIR_INVERSE = new THREE.Quaternion();
    const bendScratch = new THREE.Vector3();
    const reactionUpper = new THREE.Quaternion();
    const reactionLower = new THREE.Quaternion();
    const pedalReactionEuler = new THREE.Euler();
    const pedalReactionQuaternion = new THREE.Quaternion();
    const pedalReactionTarget = new THREE.Vector3();
    const restAnkleTarget = new THREE.Vector3();
    let lastRest = 0;
    function applyRagdollLeg(leg, stance, rag) {
        RAG_LEG_HIP.copy(leg.hip.position).applyQuaternion(stance.ragdollRootWorldQuaternion).add(stance.ragdollRootWorldPosition);
        RAG_LEG_FOOT.copy(restAnkleTarget).applyQuaternion(stance.ragdollRootWorldQuaternion).add(stance.ragdollRootWorldPosition);
        solveRagdollLeg(RAG_LEG_HIP.x, RAG_LEG_HIP.y, RAG_LEG_HIP.z, RAG_LEG_FOOT.x, RAG_LEG_FOOT.y, RAG_LEG_FOOT.z, stance.ragdollForwardWorld.x, stance.ragdollForwardWorld.z, stance.ragdollHeadingY, RIDER_BLOCKOUT, RAG_LEG_SOLVE, stance.ragdollJointPoles, leg.side > 0 ? 0 : 3);
        writeRagLegBasis(6, reactionUpper);
        writeRagLegBasis(15, reactionLower);
        writeRagLegBasis(24, RAG_ANKLE);
        leg.hip.quaternion.copy(RAG_LOCAL.copy(RAG_ROOT_INVERSE).multiply(reactionUpper));
        leg.knee.quaternion.copy(RAG_LOCAL.copy(reactionUpper).invert().multiply(reactionLower));
        RAG_ANKLE.premultiply(SOLVE_INVERSE.copy(reactionLower).invert());
        if (rag === 1)
            leg.ankle.quaternion.copy(RAG_ANKLE);
        else
            leg.ankle.quaternion.copy(RAG_LOCAL.copy(SOLVE_INVERSE).multiply(stance.ragdollRootWorldQuaternion).multiply(pedalReactionQuaternion)
                .slerp(RAG_ANKLE, rag));
    }
    function applyRagdollArm(arm, stance) {
        RAG_LEG_HIP.copy(RAG_PELVIS_POSITION);
        RAG_LEG_FOOT.copy(arm.target).applyQuaternion(RAG_PELVIS_WORLD).add(RAG_LEG_HIP);
        RAG_LEG_HIP.add(RAG_TARGET.copy(arm.shoulder.position).applyQuaternion(RAG_PELVIS_WORLD));
        solveRagdollLimb(RAG_LEG_HIP.x, RAG_LEG_HIP.y, RAG_LEG_HIP.z, RAG_LEG_FOOT.x, RAG_LEG_FOOT.y, RAG_LEG_FOOT.z, stance.ragdollForwardWorld.x, stance.ragdollForwardWorld.z, stance.ragdollHeadingY, RIDER_BLOCKOUT.upperArmLength, RIDER_BLOCKOUT.forearmLength, RIDER_BLOCKOUT.ragdollArmContactMinReach, RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength - 1e-6, RIDER_BLOCKOUT.ragdollKneeVerticalBand, RAG_LEG_SOLVE, stance.ragdollJointPoles, arm.side > 0 ? 6 : 9);
        writeRagLegBasis(6, reactionUpper);
        writeRagLegBasis(15, reactionLower);
        arm.shoulder.quaternion.copy(RAG_LOCAL.copy(RAG_PELVIS_WORLD_INVERSE).multiply(reactionUpper));
        arm.elbow.quaternion.copy(RAG_LOCAL.copy(reactionUpper).invert().multiply(reactionLower));
    }
    if (rightGrip === null)
        throw new Error('the rider was built without a right grip');
    const grip = rightGrip;
    for (const updateSurface of surfaceUpdates)
        updateSurface();
    return {
        root,
        pelvis,
        neck,
        grip,
        resetCrashPose() { },
        applyStanceReaction(stance) {
            const { rollAngle, riderPitch, lookYaw, groundY } = stance;
            const amount = Math.min(1, Math.abs(rollAngle) / RIDER_BLOCKOUT.carveReactionFullRoll);
            const insideSide = Math.sign(rollAngle);
            const rest = clamp(stance.restFactor, 0, 1);
            const settled = Math.max(rest, clamp(stance.crash, 0, 1));
            const restActive = settled > 1e-6 || Math.abs(settled - lastRest) > 1e-6;
            lastRest = settled;
            const crouch = clamp(stance.crouch, 0, 1) * (1 - rest);
            const air = clamp(stance.airBlend, 0, 1) * (1 - rest);
            const tuck = clamp(stance.tuck, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));
            const attack = clamp(stance.attack, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));
            const carving = clamp(stance.carveStance, 0, 1) * (1 - rest) * (1 - clamp(stance.crash, 0, 1));
            const crashing = clamp(stance.crash, 0, 1);
            const rag = clamp01(stance.ragdollBlend);
            const ragActive = rag > 1e-6;
            const freeFoot = clamp01(stance.oneFoot) * (1 - rest) * (1 - crashing) * (1 - rag);
            const freeSide = freeFoot > 0 ? Math.sign(stance.oneFootSide) : 0;
            const fighting = clamp01(stance.wobbleFight);
            const wobble = fighting * (1 - rest) * (1 - crashing);
            const motion = look.motion ?? MOTION_STILL;
            const sway = clamp(stance.styleSway, -1, 1) * (1 - rest) * (1 - crashing);
            const reverse = clamp01(stance.reverse) * (1 - rest) * (1 - crashing);
            const technical = clamp01(Math.abs(stance.technicalTurn))
                * (1 - rest)
                * (1 - crashing);
            const footCorrection = clamp(stance.wobbleFootCorrection, 0, 1)
                * (1 - rest) * (1 - crashing);
            const footPhase = clamp(stance.wobbleSway, -1, 1);
            pedalReactionEuler.set(0, stance.wobbleYaw, stance.pedalRoll);
            pedalReactionQuaternion.setFromEuler(pedalReactionEuler);
            const strikeSide = Math.sign(stance.pedalStrike);
            const strikeLift = Math.min(1, Math.abs(stance.pedalStrike) / EUC.pedalStrikeReferenceDepth) * RIDER_BLOCKOUT.pedalStrikeFootLift;
            const load = clamp(riderPitch / RIDER_BLOCKOUT.loadReactionFullPitch, -1, 1);
            const driving = Math.max(0, load);
            const bracing = Math.max(0, -load);
            const hipShift = driving * RIDER_BLOCKOUT.accelHipShiftMax
                - bracing * RIDER_BLOCKOUT.brakeHipShiftMax;
            const squat = Math.min(RIDER_BLOCKOUT.squatMax, RIDER_BLOCKOUT.carveSquatMax * amount * (1 - technical)
                + driving * RIDER_BLOCKOUT.accelSquatMax
                + bracing * RIDER_BLOCKOUT.brakeSquatMax
                + crouch * RIDER_BLOCKOUT.crouchHipDrop
                + tuck * RIDER_BLOCKOUT.tuckHipDrop
                + attack * RIDER_BLOCKOUT.attackHipDrop * (1 - amount)
                + wobble * RIDER_BLOCKOUT.wobbleHipDrop * (1 + motion.staggerHips)
                + reverse * RIDER_BLOCKOUT.reverseSquat);
            const torsoPitch = Math.min(RIDER_BLOCKOUT.tuckTorsoPitchMax, stance.torsoPitch
                + tuck * RIDER_BLOCKOUT.tuckTorsoPitch
                + Math.max(attack * RIDER_BLOCKOUT.attackTorsoPitch, carving * RIDER_BLOCKOUT.carveStanceTorsoPitch));
            pelvis.rotation.x = torsoPitch;
            pelvis.position.x = RIDER_BLOCKOUT.restHipShift * rest;
            pelvis.position.y = lerp(RIDER.hipHeight - squat, RIDER_BLOCKOUT.restHipHeight, settled);
            pelvis.position.z = (hipShift - attack * RIDER_BLOCKOUT.attackHipShift) * (1 - settled);
            if (ragActive) {
                pelvis.position.x *= 1 - rag;
                pelvis.position.y = lerp(pelvis.position.y, RIDER.hipHeight, rag);
                pelvis.position.z *= 1 - rag;
                pelvis.rotation.x *= 1 - rag;
            }
            pelvis.rotation.y = (stance.turnTwist * (1 - reverse)
                + reverse * RIDER_BLOCKOUT.reverseTorsoTwist) * (1 - rag);
            if (ragActive) {
                RAG_ROOT_INVERSE.copy(stance.ragdollRootWorldQuaternion).invert();
                RAG_PELVIS_LOCAL_INVERSE.copy(pelvis.quaternion).invert();
                RAG_PELVIS_WORLD.copy(stance.ragdollRootWorldQuaternion).multiply(pelvis.quaternion);
                RAG_PELVIS_WORLD_INVERSE.copy(RAG_PELVIS_WORLD).invert();
                RAG_PELVIS_POSITION.copy(pelvis.position).applyQuaternion(stance.ragdollRootWorldQuaternion).add(stance.ragdollRootWorldPosition);
            }
            for (const leg of legs) {
                if (rag === 1) {
                    leg.lastDrop = NaN;
                    leg.hip.position.set(leg.side * hipHalfWidth, RIDER.hipHeight, 0);
                    restAnkleTarget.copy(leg.side > 0 ? stance.ragdollFootL : stance.ragdollFootR);
                    applyRagdollLeg(leg, stance, rag);
                    continue;
                }
                const inside = insideSide !== 0 && Math.sign(leg.side) === insideSide;
                const outside = insideSide !== 0 && Math.sign(leg.side) === -insideSide;
                const drop = squat
                    + (inside ? RIDER_BLOCKOUT.carveInsideHipDropMax * amount * (1 - technical) : 0)
                    + (outside ? RIDER_BLOCKOUT.technicalTurnOutsideHipDropMax * amount * technical : 0);
                const carveOpen = inside
                    ? RIDER_BLOCKOUT.carveInsideKneeOpen * amount * (1 - technical)
                    : 0;
                const restOpen = leg.side < 0 ? RIDER_BLOCKOUT.restPedalKneeOpen * rest : 0;
                const open = Math.max(carveOpen, restOpen);
                const lift = strikeSide !== 0 && Math.sign(leg.side) === strikeSide ? strikeLift : 0;
                const footAdjust = -leg.side * footPhase * footCorrection
                    * RIDER_BLOCKOUT.wobbleFootAdjust;
                const freed = freeSide !== 0 && Math.sign(leg.side) === freeSide ? freeFoot : 0;
                if (!restActive
                    && !ragActive
                    && Math.abs(drop - leg.lastDrop) < 1e-6
                    && Math.abs(hipShift - leg.lastShift) < 1e-6
                    && Math.abs(open - leg.lastOpen) < 1e-6
                    && Math.abs(lift - leg.lastLift) < 1e-6
                    && Math.abs(footAdjust - leg.lastFootAdjust) < 1e-6
                    && Math.abs(stance.wobbleYaw - leg.lastPedalYaw) < 1e-6
                    && Math.abs(stance.pedalRoll - leg.lastPedalRoll) < 1e-6
                    && Math.abs(freed - leg.lastFreed) < 1e-6)
                    continue;
                leg.lastDrop = drop;
                leg.lastShift = hipShift;
                leg.lastOpen = open;
                leg.lastLift = lift;
                leg.lastFootAdjust = footAdjust;
                leg.lastPedalYaw = stance.wobbleYaw;
                leg.lastPedalRoll = stance.pedalRoll;
                leg.lastFreed = freed;
                leg.hip.position.x = leg.side * hipHalfWidth + RIDER_BLOCKOUT.restHipShift * rest;
                leg.hip.position.y = lerp(RIDER.hipHeight - drop, RIDER_BLOCKOUT.restHipHeight, settled);
                leg.hip.position.z = hipShift * (1 - settled);
                const grounding = leg.side > 0 ? rest : 0;
                const settling = Math.max(grounding, crashing);
                const outboard = crashing > grounding
                    ? leg.side * RIDER_BLOCKOUT.crashFootOutboard
                    : RIDER_BLOCKOUT.restFootOutboard;
                pedalReactionTarget.copy(leg.target).applyEuler(pedalReactionEuler);
                restAnkleTarget.set(lerp(pedalReactionTarget.x, outboard, settling), lerp(pedalReactionTarget.y + lift, RIDER_BLOCKOUT.ankleAbovePedal + groundY, settling), lerp(pedalReactionTarget.z + footAdjust, -RIDER_BLOCKOUT.restFootBack, settling));
                if (freed > 0) {
                    restAnkleTarget.set(lerp(restAnkleTarget.x, pedalReactionTarget.x + leg.side * RIDER_BLOCKOUT.oneFootOutboard, freed), lerp(restAnkleTarget.y, pedalReactionTarget.y + RIDER_BLOCKOUT.oneFootRise, freed), lerp(restAnkleTarget.z, pedalReactionTarget.z - RIDER_BLOCKOUT.oneFootTrail, freed));
                }
                if (ragActive) {
                    leg.hip.position.x = lerp(leg.hip.position.x, leg.side * hipHalfWidth, rag);
                    leg.hip.position.y = lerp(leg.hip.position.y, RIDER.hipHeight, rag);
                    leg.hip.position.z *= 1 - rag;
                    restAnkleTarget.lerp(leg.side > 0 ? stance.ragdollFootL : stance.ragdollFootR, rag);
                }
                if (ragActive) {
                    applyRagdollLeg(leg, stance, rag);
                    continue;
                }
                solveChain({
                    origin: leg.hip.position,
                    target: restAnkleTarget,
                    upperLength: RIDER_BLOCKOUT.thighLength,
                    lowerLength: RIDER_BLOCKOUT.shinLength,
                    bendToward: open > 0 ? bendScratch.set(Math.sign(leg.side) * open, 0, 1).normalize() : FORWARD,
                }, reactionUpper, reactionLower);
                leg.hip.quaternion.copy(reactionUpper);
                leg.knee.quaternion.copy(reactionLower);
                SOLVE_INVERSE.copy(reactionUpper).multiply(reactionLower).invert()
                    .multiply(pedalReactionQuaternion);
                leg.ankle.quaternion.copy(SOLVE_INVERSE);
            }
            const ease = Math.max(clamp01(stance.armEase), rest)
                * (1 - air) * (1 - crashing) * (1 - rag) * (1 - tuck) * (1 - attack) * (1 - carving)
                * (1 - Math.min(1, 2 * reverse));
            const carry = clamp01(stance.carry);
            for (const arm of arms) {
                if (rag === 1) {
                    arm.lastSplay = NaN;
                    arm.hand.rotation.y = 0;
                    arm.target.copy(arm.side > 0 ? stance.ragdollHandL : stance.ragdollHandR)
                        .sub(pelvis.position).applyQuaternion(RAG_PELVIS_LOCAL_INVERSE);
                    applyRagdollArm(arm, stance);
                    continue;
                }
                const inside = insideSide !== 0 && Math.sign(arm.side) === insideSide;
                const splay = (driving + bracing) * RIDER_BLOCKOUT.armLoadSplay
                    + amount * (inside
                        ? -RIDER_BLOCKOUT.armCarveInsideTuck
                        : RIDER_BLOCKOUT.armCarveOutsideSplay)
                    + air * RIDER_BLOCKOUT.airArmSplay
                    + wobble * RIDER_BLOCKOUT.wobbleArmSplay * (1 + motion.staggerArms)
                    + crashing * RIDER_BLOCKOUT.crashArmSplay
                    + sway * Math.sign(arm.side) * motion.swayArmSplay
                    + tuck * RIDER_BLOCKOUT.tuckArmSplay
                    + attack * RIDER_BLOCKOUT.attackArmSplay
                    + (inside ? 0 : carving * RIDER_BLOCKOUT.carveStanceOutsideSplay)
                    + reverse * RIDER_BLOCKOUT.reverseArmSplay;
                const forward = bracing * RIDER_BLOCKOUT.armBrakeForward
                    - driving * RIDER_BLOCKOUT.armAccelBack
                    - tuck * RIDER_BLOCKOUT.tuckArmBack
                    - attack * RIDER_BLOCKOUT.attackArmBack
                    + (inside
                        ? -carving * RIDER_BLOCKOUT.carveStanceInsideBack
                        : carving * RIDER_BLOCKOUT.carveStanceOutsideForward)
                    + sway * Math.sign(arm.side) * motion.swayArmSwing;
                const rise = (inside ? 0 : amount * RIDER_BLOCKOUT.armCarveOutsideRise)
                    + air * RIDER_BLOCKOUT.airArmRise
                    + wobble * RIDER_BLOCKOUT.wobbleArmRise * (1 + motion.staggerArms)
                    - tuck * RIDER_BLOCKOUT.tuckArmDrop
                    - attack * RIDER_BLOCKOUT.attackArmDrop
                    + (inside
                        ? carving * RIDER_BLOCKOUT.carveStanceInsideRise
                        : -carving * RIDER_BLOCKOUT.carveStanceOutsideDrop)
                    + crashing * RIDER_BLOCKOUT.crashArmRise;
                const swinging = arm.side < 0 ? clamp(stance.swingBlend, 0, 1) : 0;
                const eased = arm.side < 0 ? ease * (1 - carry) : ease;
                if (!ragActive
                    && swinging <= 1e-6
                    && Math.abs(swinging - arm.lastSwing) < 1e-6
                    && Math.abs(splay - arm.lastSplay) < 1e-6
                    && Math.abs(forward - arm.lastForward) < 1e-6
                    && Math.abs(rise - arm.lastRise) < 1e-6
                    && Math.abs(eased - arm.lastEase) < 1e-6)
                    continue;
                arm.lastSplay = splay;
                arm.lastForward = forward;
                arm.lastRise = rise;
                arm.lastSwing = swinging;
                arm.lastEase = eased;
                arm.target.set(Math.sign(arm.side) * (lerp(arm.baseSplay, arm.easedSplay, eased * (1 - amount)) + splay), lerp(arm.baseTarget.y, arm.easedTarget.y, eased) + rise, lerp(arm.baseTarget.z, arm.easedTarget.z, eased) + forward);
                const settle = eased * (1 - swinging);
                arm.hand.rotation.y = settle > 0 ? Math.sign(arm.side) * RIDER_BLOCKOUT.armEaseHandRoll * settle : 0;
                const bowOut = arm.side < 0 ? RIDER_BLOCKOUT.armEaseElbowOutRight : RIDER_BLOCKOUT.armEaseElbowOut;
                const bend = settle > 0
                    ? arm.easedBend.set(Math.sign(arm.side) * bowOut * settle, 0, -1).normalize()
                    : arm.bendToward;
                if (swinging > 0) {
                    const extent = (RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength) * 0.94;
                    SWING_TARGET.set(arm.shoulder.position.x + Math.sin(stance.swingAngle) * extent, arm.shoulder.position.y - extent * RIDER_BLOCKOUT.armHangFraction * 0.35, arm.shoulder.position.z + Math.cos(stance.swingAngle) * extent);
                    arm.target.lerp(SWING_TARGET, swinging);
                }
                if (ragActive) {
                    RAG_TARGET.copy(arm.side > 0 ? stance.ragdollHandL : stance.ragdollHandR)
                        .sub(pelvis.position)
                        .applyQuaternion(RAG_PELVIS_LOCAL_INVERSE);
                    arm.target.lerp(RAG_TARGET, rag);
                }
                if (ragActive) {
                    applyRagdollArm(arm, stance);
                    continue;
                }
                solveChain({
                    origin: arm.shoulder.position,
                    target: arm.target,
                    upperLength: RIDER_BLOCKOUT.upperArmLength,
                    lowerLength: RIDER_BLOCKOUT.forearmLength,
                    bendToward: bend,
                }, reactionUpper, reactionLower);
                arm.shoulder.quaternion.copy(reactionUpper);
                arm.elbow.quaternion.copy(reactionLower);
            }
            const tuckPitch = torsoPitch - stance.torsoPitch;
            neck.rotation.x = -clamp((riderPitch + RIDER_BLOCKOUT.torsoRestPitch) * RIDER_BLOCKOUT.headStabilizationFactor, -RIDER_BLOCKOUT.headStabilizationMax, RIDER_BLOCKOUT.headStabilizationMax) - clamp(tuckPitch * RIDER_BLOCKOUT.tuckHeadStabilization, 0, RIDER_BLOCKOUT.tuckHeadStabilizationMax) - (stance.falling ? air * RIDER_BLOCKOUT.airHeadDown : 0)
                - rest * motion.sipNeckPitch;
            neck.rotation.y = lerp(lookYaw, RIDER_BLOCKOUT.reverseHeadYaw, reverse);
            if (hairSway !== null) {
                const fold = Math.max(0, torsoPitch - RIDER_BLOCKOUT.torsoRestPitch);
                HAIR_EULER.set(Math.max(HAIR_NECK_REST + fold * RIDER_BLOCKOUT.hairTrailPitch, neck.rotation.x), clamp(neck.rotation.y * (1 - RIDER_BLOCKOUT.hairFollowYaw), -RIDER_BLOCKOUT.hairYawMax, RIDER_BLOCKOUT.hairYawMax), 0);
                HAIR_TARGET.setFromEuler(HAIR_EULER);
                HAIR_INVERSE.copy(neck.quaternion).invert().multiply(HAIR_TARGET);
                if (rag > 0)
                    HAIR_INVERSE.slerp(HAIR_REST.identity(), rag);
                hairSway.quaternion.copy(HAIR_INVERSE);
                hairSway.position.z = -RIDER_BLOCKOUT.hairFollowLift
                    * clamp(fold / RIDER_BLOCKOUT.hairFollowPitchMax, 0, 1) * (1 - rag);
            }
            if (ragActive) {
                RAG_TARGET.copy(stance.ragdollHead)
                    .sub(pelvis.position)
                    .applyQuaternion(RAG_PELVIS_LOCAL_INVERSE);
                const towardY = Math.max(0.08, RAG_TARGET.y - shoulderY);
                neck.rotation.x = lerp(neck.rotation.x, Math.atan2(RAG_TARGET.z, towardY), rag);
                neck.rotation.y *= 1 - rag;
                neck.rotation.z = -Math.atan2(RAG_TARGET.x, towardY) * rag;
            }
            else {
                neck.rotation.z = -sway * motion.swayHeadTilt
                    - wobble * footPhase * motion.staggerHeadLoll;
            }
            for (const updateSurface of surfaceUpdates)
                updateSurface();
        },
        dispose() {
            surfaceUpdates.length = 0;
            for (const geometry of geometries)
                geometry.dispose();
            for (const material of materials)
                material.dispose();
            for (const texture of textures)
                texture.dispose();
            geometries.length = 0;
            materials.length = 0;
            textures.length = 0;
            root.removeFromParent();
        },
    };
}
