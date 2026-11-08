#!/usr/bin/env node
// tools/vendor-euc.mjs — copy the EUC riding systems out of a local EUC Thrills clone into js/euc/ as plain ES modules.
//
// usage: node tools/vendor-euc.mjs [--src ../EUC-thrills] [--donor ../EUC-thrills-latest] [--check]
//        node tools/vendor-euc.mjs [--src ../EUC-thrills] --audit <dir>    (scan a whole tree, e.g. a release)
//        --no-preloads leaves host-owned index.html synchronization to the integration owner (also in --check).
//
// The fork has no build step, so the TypeScript is converted once, here, and the JavaScript is committed. Each
// module keeps its upstream path (src/simulation/X.ts -> js/euc/simulation/X.js) and its upstream licence banner.
//
// Reviewed eleven-rider inventory, not an open-ended upstream roster import. Appearances are sliced by declaration
// dependency, selected through fixed local import functions, and excluded from the eager/preload graph (including
// Cool Rider). CPU pixel/logo caches have explicit release hooks. Preserve all NYC controller/wheel adaptations.
// Public participant-rights guidance travels in generated roster/look modules; see NOTICE-EUC-THRILLS.md.
//
// Needs TypeScript, resolved from the EUC Thrills clone's node_modules (npm ci there first). Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const SRC_ROOT = path.resolve(ROOT, argValue('--src', '../EUC-thrills'));
const DONOR_ROOT = path.resolve(ROOT, argValue('--donor', '../EUC-thrills-latest'));
const CHECK_ONLY = args.includes('--check');
const SYNC_PRELOADS = !args.includes('--no-preloads');
const AUDIT_DIR = argValue('--audit', null);
const OUT = path.join(ROOT, 'js', 'euc');
const EXPECTED_COMMIT = '5f45fff19b258e140833841ba2473069af751a12';
const DONOR_COMMIT = 'd37efc07cddc0d76ff7aa585901710d357b8e5a1';
// Complete-file hashes identify the donor even when only individual declarations are extracted. The base remains
// authoritative for every other module, all reviewed appearances/audio, and NYC's existing adaptation layers.
const DONOR_HASHES = {
  'app/nearSolids.ts': '59350bb61e53a9bda09660f6cf8a0f6cded9557815fb34cda977ca5f97ef2480',
  'render/ridingRig.ts': '7413e04db970dd1c791eb9fa59a06cfb62556c464b9e98502baff4a12912bad0',
  'simulation/EucController.ts': '5304c5f60cc443418d7b8836932482b2ef806b3bc69f6fe0d5565cadf91cdfe9',
  'simulation/eucStepPrimitives.ts': '46c74ca9d4845b9c4b47049da0cd9f9861ff1c9d85220cdc29f3c2ad9f043d27',
  'data/tuning.ts': 'a084dbc4237910707d41a949bc8d395aa6d09682c84a23fbdd049843e3fce069',
  'simulation/world.ts': 'fc42f20124279aae9b037de4b4940b4ea2603c568023a7ce8554a88350d6f400',
};
const REVIEWED_MODULES = new Set(`app/oneFootPose app/nearSolids data/rideStyles data/riders data/machines data/surfaces data/tuning
input/actions render/blockoutKit render/coolRiderAtlas render/coolRiderLook render/euc render/inkKit
render/machineLook render/paddle render/rider render/riderClothDrape render/riderJointSurface render/riderLook
render/ridingRig render/rigConsolidation shared/freeze shared/letterPaths shared/maths shared/ragdollBoot
shared/ragdollContact shared/ragdollHip shared/ragdollInterpolation shared/ragdollLimbContact shared/riderOccupancy
shared/riderSideContact simulation/EucController simulation/eucStepPrimitives simulation/hazards
simulation/lateralCeiling simulation/launchPadField simulation/planSampler simulation/ragdoll simulation/riderLean
simulation/roughness simulation/softBodies simulation/world render/maribelHair render/maribelAtlas render/wimAtlas
render/drunkardAtlas render/wimMachineAtlas render/drunkardMachineAtlas render/floWithZoLook render/sealOnAWheelLook
render/sealAtlas render/wyldistLook render/wyldistAtlas render/wyldistMachineLook render/gnarwheelLook
render/gnarwheelAtlas render/gnarwheelMachineLook render/wyldistHelmet render/pngDecode data/mvLogoAsset data/wimLogoAsset
data/gnarwheelLogoAsset`.split(/\s+/).map(p => `${p}.ts`));

// The runtime entry points the fork imports. Everything else comes in through their imports.
const ENTRIES = [
  'app/oneFootPose.ts',
  'app/nearSolids.ts',
  'simulation/EucController.ts',
  'simulation/planSampler.ts',
  'simulation/world.ts',
  'input/actions.ts',
  'render/ridingRig.ts',
  'render/riderLook.ts',
  'render/machineLook.ts',
  'render/appearanceLoader.ts',
  'data/riders.ts',
  'data/machines.ts',
];
// Worker roots are shipped/audited but never preloaded or imported into the document's initial graph.
const WORKER_ENTRIES = ['render/appearanceWorker.ts'];

// Eleven playable riders; Dorkins' separate cop look remains NPC-only.
const REVIEWED_ROSTER = [
  ['cool-rider', 'standard', 'COOL_RIDER_LOOK', 'STANDARD_MACHINE_LOOK', 'crash_wipeout.wav'],
  ['trollina', 'trollina', 'TROLLINA_LOOK', 'TROLLINA_MACHINE_LOOK', 'crash_trollina.wav'],
  ['red-rider', 'red-rider', 'RED_RIDER_LOOK', 'RED_RIDER_MACHINE_LOOK', 'crash_red_rider.wav'],
  ['adonisb2', 'adonisb2', 'ADONISB2_LOOK', 'ADONISB2_MACHINE_LOOK', 'crash_adonisb2.wav'],
  ['maribel-vargas', 'maribel', 'MARIBEL_LOOK', 'MARIBEL_MACHINE_LOOK', 'crash_maribel.wav'],
  ['wheel-in-motion', 'wheel-in-motion', 'WHEEL_IN_MOTION_LOOK', 'WHEEL_IN_MOTION_MACHINE_LOOK', 'crash_wheel_in_motion.wav'],
  ['drunkard', 'drunkard', 'DRUNKARD_LOOK', 'DRUNKARD_MACHINE_LOOK', 'crash_drunkard.wav'],
  ['flo-with-zo', 'flo-with-zo', 'FLO_WITH_ZO_LOOK', 'FLO_WITH_ZO_MACHINE_LOOK', 'crash_flo_with_zo.wav'],
  ['seal-on-a-wheel', 'seal-on-a-wheel', 'SEAL_ON_A_WHEEL_LOOK', 'SEAL_ON_A_WHEEL_MACHINE_LOOK', 'crash_seal_on_a_wheel.wav'],
  ['wyldist', 'wyldist', 'WYLDIST_LOOK', 'WYLDIST_MACHINE_LOOK', 'crash_wyldist.wav'],
  ['gnarwheel', 'gnarwheel', 'GNARWHEEL_LOOK', 'GNARWHEEL_MACHINE_LOOK', 'crash_gnarwheel.wav'],
];
const KEEP_IDS = new Set(REVIEWED_ROSTER.flatMap(([id, machine]) => [id, machine]));
// The two reviewed CC0 sirens are restored for the Dorkins integration; offroad remains omitted.
const UNSHIPPED_AUDIO = {
  'tyre_offroad_loop.wav': 'No active SF offroad sample consumer',
};
const UNSHIPPED_COLOURS = {};
const PIXEL_CACHE_IDS = {
  'cool-rider': ['coolRiderAtlas.ts'], trollina: [], 'red-rider': [], adonisb2: [],
  'maribel-vargas': ['maribelAtlas.ts'], 'wheel-in-motion': ['wimAtlas.ts', 'wimMachineAtlas.ts'],
  drunkard: ['drunkardAtlas.ts', 'drunkardMachineAtlas.ts'], 'flo-with-zo': [],
  'seal-on-a-wheel': ['sealAtlas.ts'], wyldist: ['wyldistAtlas.ts'], gnarwheel: ['gnarwheelAtlas.ts'],
};
// Exact painter roots and cache payloads from the reviewed source. No DataTexture/rig/appearance construction
// belongs in the worker graph. Main-realm look closures supply their already-resolved plain layout data.
const PIXEL_PAINTERS = [
  ['coolRiderAtlas', 'createCoolAtlas', 'paintCoolAtlas', ''],
  ['maribelAtlas', 'createMaribelAtlas', 'maribelAtlasPixels', ', mark: cachedMark'],
  ['wimAtlas', 'createWimAtlas', 'wimAtlasPixels', ', upright: cachedMarks.upright, turned: cachedMarks.turned'],
  ['wimMachineAtlas', 'createWimMachineAtlas', 'wimMachineAtlasPixels', ''],
  ['drunkardAtlas', 'createDrunkardAtlas', 'drunkardAtlasPixels', ''],
  ['drunkardMachineAtlas', 'createDrunkardMachineAtlas', 'drunkardMachineAtlasPixels', ''],
  ['sealAtlas', 'createSealAtlas', 'sealAtlasPixels', ''],
  ['wyldistAtlas', 'createWyldistAtlas', 'wyldistAtlasPixels', ''],
  ['gnarwheelAtlas', 'createGnarwheelAtlas', 'gnarwheelAtlasPixels', ''],
];
const PAINT_VECTOR_SOURCE = 'vendor/three/build/three.core.js';
const PAINT_VECTOR_SHA256 = '5fb576f559a503bdaaac4990a632984a3673f13369e947540986b0d392be3a2f';
const PAINT_VECTOR_METHODS = ['constructor', 'set', 'copy', 'distanceTo', 'distanceToSquared', 'subVectors',
  'crossVectors', 'length', 'multiplyScalar', 'addScaledVector'];
// Reviewed logos are allowed. Private source paths and work assets are never runtime dependencies.
// Actual private file references are forbidden. A bare directory mention in a verbatim licence
// excerpt (or the audit's own regex fixture) is not distributed private content. Filesystem
// directory entries are rejected independently by --audit, even when the directory is empty.
const GENERIC_DENY = /(?:references|assets\/work|private|permissions?)\/[A-Za-z0-9_.-]/i;

/** Fail closed if the source adds/reorders characters, voices or machines beyond the reviewed inventory. */
function readScope(srcRoot) {
  const riders = fs.readFileSync(path.join(srcRoot, 'src', 'data', 'riders.ts'), 'utf8');
  const machines = fs.readFileSync(path.join(srcRoot, 'src', 'data', 'machines.ts'), 'utf8');
  const union = (text, type) => {
    const m = new RegExp(`export type ${type} =([^;]*);`).exec(text);
    if (!m) throw new Error(`scope: type ${type} not found upstream; the roster format changed`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  const ids = new Set([...union(riders, 'PlayableCharacterId'), ...union(riders, 'CrashVoiceId'), ...union(machines, 'MachineId')]);
  for (const keep of ['cool-rider', 'trollina', 'standard']) if (!ids.has(keep)) throw new Error(`scope: kept id ${keep} missing upstream`);
  const excluded = [...ids].filter((id) => !KEEP_IDS.has(id));
  if (excluded.length) throw new Error(`Unreviewed upstream roster IDs: ${excluded.join(', ')}`);
  const playable = union(riders, 'PlayableCharacterId');
  if (JSON.stringify(playable) !== JSON.stringify(REVIEWED_ROSTER.map(([id]) => id))) {
    throw new Error('Reviewed playable roster/order changed');
  }
  for (const [actual, expected, label] of [
    [union(machines, 'MachineId'), REVIEWED_ROSTER.map(row => row[1]), 'machines'],
    [union(riders, 'CrashVoiceId'), REVIEWED_ROSTER.map(row => row[0] === 'maribel-vargas' ? 'maribel' : row[0]), 'voices'],
  ]) {
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) throw new Error(`Reviewed ${label} inventory changed`);
  }
  return { reviewed: playable };
}

function hitsIn(line) {
  const match = GENERIC_DENY.exec(line);
  return match ? [{ text: match[0] }] : [];
}

function auditAudioInventory(root, reviewed) {
  const directory = path.join(root, 'audio/euc'), problems = [];
  const installed = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => /\.wav$/i.test(name)) : [];
  for (const name of installed) {
    const record = reviewed.find(item => path.basename(item.source) === name);
    if (!record || crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') !== record.sourceSha256) {
      problems.push(`unreviewed or changed EUC audio: ${name}`);
    } else if (!record.shipped) problems.push(`unshipped EUC audio: ${name}`);
  }
  for (const record of reviewed.filter(item => item.shipped)) {
    if (!installed.includes(path.basename(record.source))) problems.push(`missing shipped EUC audio: ${path.basename(record.source)}`);
  }
  return problems;
}

// Local controller seams are exact, fail-closed replacements against EXPECTED_COMMIT.
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`EUC adaptation site changed: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

// Only this audited declaration is dead in the fork, not the tuning constants around it. Pin its complete source
// text so upstream shape/value/side-effect changes require review. In particular, never cut at TUNING or truncate
// the file: deepFreeze(TUNING) freezes live shared exports, and more active constants follow LIVE_TUNABLES.
function pruneLiveTuningMetadata(source) {
  const declarations = [...source.matchAll(/^export const LIVE_TUNABLES: readonly TunableSpec\[\] = deepFreeze\(\[\n[^]*?^\]\);/gm)];
  if (declarations.length !== 1
      || crypto.createHash('sha256').update(declarations[0][0]).digest('hex')
        !== '5a9619b34bd2dee88fdef8a043e29f8e2397509259b29a3fc018aa793c2ae0cf') {
    throw new Error('EUC LIVE_TUNABLES metadata changed; review before pruning');
  }
  return replaceOnce(source, declarations[0][0], '');
}

function pruneUnshippedColours(source) {
  for (const [key, value] of Object.entries(UNSHIPPED_COLOURS)) {
    source = replaceOnce(source, `  ${key}: ${value},`, '');
  }
  return source;
}

// No upstream application/level migration: explicit
// AST members/declarations only. Hashes and unchanged-member checks fail closed if the reviewed closure changes.
const donorSources = new Map();
const donorOrigins = new Map();
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
function donorSource(rel) {
  if (!donorSources.has(rel)) {
    const source = fs.readFileSync(path.join(DONOR_ROOT, 'src', rel), 'utf8');
    if (sha256(source) !== DONOR_HASHES[rel]) throw new Error(`Reviewed donor hash changed: src/${rel}`);
    donorSources.set(rel, source);
  }
  return donorSources.get(rel);
}
function useDonor(rel, selection) {
  donorOrigins.set(rel, { commit: DONOR_COMMIT, source: `src/${rel}`, sourceSha256: DONOR_HASHES[rel], selection });
  return donorSource(rel);
}
function sourceTree(source) {
  return ts.createSourceFile('reviewed.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}
function namedDeclaration(source, name) {
  const tree = sourceTree(source);
  const matches = tree.statements.filter(node => node.name?.text === name
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(tree) === name)));
  if (matches.length !== 1) throw new Error(`Reviewed donor declaration changed: ${name}`);
  return matches[0].getText(tree);
}
const TRANSITION_FIELDS = ['wallTurnSeconds', 'wallTurnDirection', 'wallTurns', 'comeBackTurn', 'comeBackDirection',
  'comeBackFlight', 'comeBackClimb', 'comeBackUpX', 'comeBackUpZ', 'comeBackAirs', 'kickRise', 'kickRun', 'kickOnTop', 'flaggedSlopeRun'];
const TRANSITION_METHODS = ['transitionLaunch', 'onFlaggedSlope', 'kickArmed', 'transitionHop', 'stepKickLatch',
  'stepWallTurn', 'faceBrake', 'comeBackAtLip', 'updateComeBackClimb', 'startComeBack', 'comeBackAgainstFace',
  'alignComeBackWithSpin', 'comeBackTouchdown', 'clearTransitionMotion', 'wallTurnCount', 'comeBackAirCount', 'inComeBackAir'];
const TRANSITION_REPLACEMENTS = ['reset', 'stepNative', 'updateSafePosition', 'obstacleWithinWheelRadius',
  'stepHop', 'launchHop', 'leaveGround', 'separate'];
function controllerTransitions(base) {
  const rel = 'simulation/EucController.ts';
  const donor = useDonor(rel, { fields: TRANSITION_FIELDS, methods: TRANSITION_METHODS, replace: TRANSITION_REPLACEMENTS,
    excluded: ['respawn', 'recoveryTarget', 'clearAheadRecoveryTarget', 'clearAhead'],
    nyc: ['validated fallen-support rest policy', 'dynamic admission restores automatic turn sweep'] });
  const members = source => {
    const tree = sourceTree(source);
    const cls = tree.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'EucController');
    if (!cls) throw new Error('Missing reviewed controller class');
    return { tree, cls, byName: new Map(cls.members.map(m => [m.name?.getText(tree) ?? 'constructor', m])) };
  };
  const a = members(base), b = members(donor);
  const selected = [...TRANSITION_FIELDS, ...TRANSITION_METHODS];
  const ignored = ['respawn', 'recoveryTarget', 'clearAheadRecoveryTarget', 'clearAhead'];
  // No unrelated controller difference can hitchhike in a selected member or escape the review inventory.
  for (const [name, node] of b.byName) {
    const old = a.byName.get(name);
    if ((!old || node.getText(b.tree) !== old.getText(a.tree))
      && ![...selected, ...TRANSITION_REPLACEMENTS, ...ignored].includes(name)) throw new Error(`Unreviewed controller member: ${name}`);
  }
  const edits = TRANSITION_REPLACEMENTS.map(name => {
    const old = a.byName.get(name), next = b.byName.get(name);
    if (!old || !next || old.getText(a.tree) === next.getText(b.tree)) throw new Error(`Missing transition seam: ${name}`);
    return { start: old.getStart(a.tree), end: old.end, text: next.getText(b.tree) };
  });
  const additions = selected.map(name => {
    if (a.byName.has(name) || !b.byName.has(name)) throw new Error(`Transition member inventory changed: ${name}`);
    return b.byName.get(name).getText(b.tree);
  });
  edits.push({ start: a.cls.end - 1, end: a.cls.end - 1, text: `\n  ${additions.join('\n\n  ')}\n` });
  let source = base;
  for (const edit of edits.sort((x, y) => y.start - x.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const constants = ['WALL_TURN_NORMAL_Y', 'WALL_TURN_ALIGNED', 'COME_BACK_NORMAL_Y', 'WALL_TURN_CREST_MIN_REACH',
    'WALL_TURN_CREST_MARGIN', 'COME_BACK_APPROACH', 'COME_BACK_LAND_NORMAL_Y', 'KICK_MIN_RISE'];
  source = replaceOnce(source, 'const PREPARED_CONTROLLER_STEPS =', constants.map(name => namedDeclaration(donor, name)).join('\n') + '\nconst PREPARED_CONTROLLER_STEPS =');
  source = replaceOnce(source, 'RIDER_BLOCKOUT, LAUNCH_PAD }', 'RIDER_BLOCKOUT, LAUNCH_PAD, SKATE_TRANSITION }');
  // Every feature query selects by the rider's actual elevation, including ahead/offset candidate queries. Flight
  // latches are deliberately not gated again by the current location: they survive crossing the feature boundary.
  let flags = 0;
  source = source.replace(/this\.sampler\.transitionAt([?!]?)\.?(\()([^;\n]*?)(\))/g, (_all, optional, open, args) => {
    flags++;
    return `this.sampler.transitionAt${optional}${optional === '?' ? '.' : ''}${open}${args}, this.y)`;
  });
  if (flags !== 11) throw new Error(`Transition query inventory changed: ${flags}`);
  return source;
}

function controllerGroundHeights(source) {
  const tree = sourceTree(source), edits = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'this.sampler.sampleGround') {
      if (node.arguments.length !== 3) throw new Error('Unexpected controller ground query signature');
      const first = node.arguments[0].getText(tree);
      const y = first.startsWith('spawn.position') ? 'spawn.position.y'
        : first.startsWith('pelvis[') ? 'pelvis[RD_PELVIS * 3 + 1]'
        : first.startsWith('this.safeX') ? 'this.safeY' : 'this.y';
      edits.push({ at: node.arguments.end, y });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (edits.length !== 22) throw new Error(`controller height query sites changed: ${edits.length}`);
  for (const { at, y } of edits.sort((a, b) => b.at - a.at)) source = source.slice(0, at) + `, ${y}` + source.slice(at);
  return source;
}

const OVERRIDES = {
  // SF optional finite convex-prism contact records. Ordinary numeric OBB records
  // retain the original implementation byte-for-byte after this early dispatch.
  // The host owns exact geometry; no renderer or SF module enters the engine.
  'shared/ragdollContact.ts': (src) => {
    const hooks = {
      contactBoxFace: 'face(face,out,at)',
      contactSegmentOverlapsBox: 'segment(ax,ay,az,bx,by,bz,radius)',
      contactCapsuleOverlapsBox: 'capsule(ax,ay,az,bx,by,bz,radius,contact)',
      contactOrientedBoxOverlaps: 'oriented(px,py,pz,basis,basisAt,minX,maxX,minY,maxY,minZ,maxZ)',
      contactOrientedBoxContact: 'oriented(px,py,pz,basis,basisAt,minX,maxX,minY,maxY,minZ,maxZ,out)',
    };
    let s = src;
    for (const [name, call] of Object.entries(hooks)) {
      const declaration = `export function ${name}(`;
      if (s.split(declaration).length !== 2) throw new Error(`SF prism contact site changed: ${name}`);
      const start = s.indexOf('{', s.indexOf(declaration));
      s = s.slice(0, start + 1) + `
  // Optional exact convex-prism narrow phase; records without metadata remain native boxes.
  const sfPrism = (records as any).sfContacts?.get(box);
  if (sfPrism) return sfPrism.${call};` + s.slice(start + 1);
    }
    return s;
  },
  'app/nearSolids.ts': () => {
    let source = useDonor('app/nearSolids.ts', 'complete helper; NYC elevation forwarding and selected visual tyre envelope; native physical axle and flat-floor answers preserved');
    source = replaceOnce(source, 'sample: GroundSample): number {', 'sample: GroundSample, referenceY: number): number {');
    source = replaceOnce(source, 'sampler.sampleGround(x, z, sample)', 'sampler.sampleGround(x, z, sample, referenceY)');
    source = replaceOnce(source, 's, scratchSample);', 's, scratchSample, y);');
    source = replaceOnce(source, 'midS, scratchSample);', 'midS, scratchSample, y);');
    source = replaceOnce(source, 'x, z, rollSample)', 'x, z, rollSample, pose.y)');
    source = replaceOnce(source, 'const scratchSample = createGroundSample();', `// Selected geometry supplies this presentation-only envelope, never a controller/wheel tuning value.
function checkedVisualTyreRadius(radius: number): number {
  if (!Number.isFinite(radius) || radius < TYRE_RADIUS || radius > TYRE_RADIUS * 2) {
    throw new RangeError('Visual tyre radius must be finite and between one and two native tyre radii');
  }
  // The authored native circle is Float32 geometry: a few nanometres of rounding must not perturb its exact
  // original sampling/bisection answers. Actual reviewed lugs/rim overhangs are millimetres, far past this bound.
  return radius <= TYRE_RADIUS + 1e-7 ? TYRE_RADIUS : radius;
}

const scratchSample = createGroundSample();`);
    source = replaceOnce(source, 'forwardZ: number,\n): number {', `forwardZ: number,
  visualTyreRadius = TYRE_RADIUS,
): number {
  const radius = checkedVisualTyreRadius(visualTyreRadius);`);
    source = replaceOnce(source, 'const spacing = TYRE_RADIUS / perSide;', 'const spacing = radius / perSide;');
    source = replaceOnce(source, 'if (s >= TYRE_RADIUS) continue;', 'if (s >= radius) continue;');
    source = replaceOnce(source, 'high + Math.sqrt(TYRE_RADIUS * TYRE_RADIUS - s * s)', 'high + Math.sqrt(radius * radius - s * s)');
    source = replaceOnce(source, 'forwardX: number, forwardZ: number): number {', 'forwardX: number, forwardZ: number, radius: number): number {');
    source = replaceOnce(source, 'tyreStepLift(sampler, x, pose.y, z, forwardX, forwardZ)', 'tyreStepLift(sampler, x, pose.y, z, forwardX, forwardZ, radius)');
    source = replaceOnce(source, 'const spacing = TYRE_RADIUS / NEAR_SOLID.liftSamplesPerSide;', 'const spacing = radius / NEAR_SOLID.liftSamplesPerSide;');
    source = replaceOnce(source, 'pose: EucPose, out: NearSolids): NearSolids {', 'pose: EucPose, out: NearSolids, visualTyreRadius = TYRE_RADIUS): NearSolids {');
    source = replaceOnce(source, 'clearNearSolids(out);\n  if (pose.airHeight', 'clearNearSolids(out);\n  const radius = checkedVisualTyreRadius(visualTyreRadius);\n  if (pose.airHeight');
    source = replaceOnce(source, 'tyreStepLift(sampler, pose.x, pose.y, pose.z, forwardX, forwardZ)', 'tyreStepLift(sampler, pose.x, pose.y, pose.z, forwardX, forwardZ, radius)');
    source = replaceOnce(source, 'restingRoll(sampler, pose, forwardX, forwardZ)', 'restingRoll(sampler, pose, forwardX, forwardZ, radius)');
    source = replaceOnce(source, '          forwardX, forwardZ);', '          forwardX, forwardZ, radius);');
    return source;
  },
  // Wheel-sidequest: original procedural rubber and motor-cover detail. Keep the existing axle/spin contract,
  // silhouette and all stationary parts. Textures are made once per machine and owned by its disposal registry.
  'render/euc.ts': (src) => {
    let s = replaceOnce(src, 'const RIM_SHADE = 3.0;', 'const RIM_SHADE = 1.25;');
    s = replaceOnce(s, 'const HUB_SHADE = 4.6;', 'const HUB_SHADE = 0.48;');
    s = replaceOnce(s, 'const tyreMaterial = trackMaterial(', `
  // Two small, mipmapped atlases: tread in the upper half, moulded sidewall in the lower half.
  // The albedo is sRGB; height is non-colour data. No animated offsets, RNG, canvas or per-frame allocations.
  const rubberWidth = 512, rubberHeight = 256;
  const rubberColour = new Uint8Array(rubberWidth * rubberHeight * 4);
  const rubberHeightmap = new Uint8Array(rubberWidth * rubberHeight * 4);
  const pulse = (distance: number, width: number, feather: number): number =>
    1 - THREE.MathUtils.smoothstep(Math.abs(distance), width - feather, width + feather);
  for (let y = 0; y < rubberHeight; y++) {
    for (let x = 0; x < rubberWidth; x++) {
      const u = (x + 0.5) / rubberWidth;
      const v = (y + 0.5) / rubberHeight;
      let colour = 210, height = 190;
      if (v >= 0.5) {
        const across = (v - 0.5) * 2;
        // Staggered diagonal drainage slots, a narrow centre rib, and rounded shoulders.
        const shoulder = Math.abs(across - 0.5) * 2;
        const phase = u * 24 - shoulder * 0.72 + (across < 0.5 ? 0 : 0.32);
        const slot = pulse(phase - Math.floor(phase) - 0.5, 0.105, 0.025)
          * THREE.MathUtils.smoothstep(shoulder, 0.06, 0.14)
          * (1 - THREE.MathUtils.smoothstep(shoulder, 0.80, 0.98));
        const channel = pulse(shoulder - 0.52, 0.022, 0.010);
        const groove = Math.max(slot, channel);
        colour = 214 - groove * 80 - shoulder * 12;
        height = 195 - groove * 115;
      } else {
        const dx = (u - 0.5) * 2, dz = (v * 2 - 0.5) * 2;
        const radius = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);
        const bead = pulse(radius - 0.91, 0.014, 0.008);
        const phase = angle / (Math.PI * 2) * 24;
        const rib = pulse(phase - Math.floor(phase) - 0.5, 0.09, 0.035)
          * THREE.MathUtils.smoothstep(radius, 0.74, 0.78)
          * (1 - THREE.MathUtils.smoothstep(radius, 0.85, 0.89));
        // A pair of short mould marks, not a bright circumferential stripe or invented branding.
        const mark = Math.max(pulse(angle - 0.27, 0.025, 0.01), pulse(angle - 0.37, 0.025, 0.01))
          * pulse(radius - 0.67, 0.065, 0.01);
        colour = 193 + bead * 13 + rib * 15 + mark * 24;
        height = 170 + bead * 26 + rib * 30 + mark * 25;
      }
      const at = (y * rubberWidth + x) * 4;
      for (let c = 0; c < 3; c++) { rubberColour[at + c] = colour; rubberHeightmap[at + c] = height; }
      rubberColour[at + 3] = rubberHeightmap[at + 3] = 255;
    }
  }
  const rubberTexture = (data: Uint8Array, colour: boolean): THREE.DataTexture => {
    const texture = new THREE.DataTexture(data, rubberWidth, rubberHeight);
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  };
  const tyreMaterial = trackMaterial(`);
    s = replaceOnce(s, 'color: look.tyre?.colour ?? BLOCKOUT_COLOURS.tyre,', 'color: look.tyre?.colour ?? 0x343638,');
    s = replaceOnce(s, 'roughness: look.tyre?.roughness ?? 0.92,', `roughness: look.tyre?.roughness ?? 0.86,
      map: rubberTexture(rubberColour, true),
      bumpMap: rubberTexture(rubberHeightmap, false),
      bumpScale: 0.002,`);
    s = replaceOnce(s, 'loftGeometry(TREAD, { radialSegments: 20, capBottom: false, capTop: false })',
      'loftGeometry(TREAD, { radialSegments: 20, capBottom: false, capTop: false, splitSeam: true })');
    // Seat the cover face half a millimetre inward, leaving its detail at the original outer extent (no z-fighting).
    s = replaceOnce(s, 'WHEEL.tyreWidth + 0.016, 16)', 'WHEEL.tyreWidth + 0.015, 16)');
    s = replaceOnce(s, 'const tyreParts: THREE.BufferGeometry[] = [tread, rim, hub];', `
  const treadUV = tread.getAttribute('uv');
  for (let i = 0; i < treadUV.count; i++) treadUV.setY(i, 0.5 + treadUV.getY(i) * 0.5);
  const sidewallUV = rim.getAttribute('uv');
  for (let i = 0; i < sidewallUV.count; i++) sidewallUV.setY(i, sidewallUV.getY(i) * 0.5);
  const tyreParts: THREE.BufferGeometry[] = [tread, rim];
  // The original motor cover now uses the existing satin-metal pedal material. All details stay within
  // the existing hub's axial extent; the hub child inherits tyre spin and cannot merge into the fixed body.
  const motorParts: THREE.BufferGeometry[] = [hub];
  for (const side of [-1, 1]) {
    const faceY = side * (TYRE_HALF_WIDTH + 0.008);
    const face = (geometry: THREE.BufferGeometry, y: number): THREE.BufferGeometry =>
      geometry.rotateX(-side * Math.PI / 2).translate(0, y, 0);
    motorParts.push(face(shaded(new THREE.RingGeometry(TYRE_RADIUS * 0.77, TYRE_RADIUS * 0.817, 40), 0.65),
      side * (TYRE_HALF_WIDTH + 0.0005)));
    motorParts.push(face(shaded(new THREE.RingGeometry(TYRE_RADIUS * 0.40, TYRE_RADIUS * 0.455, 32), 0.8), faceY));
    for (let i = 0; i < 6; i++) {
      const theta = i * Math.PI / 3 + 0.12;
      // Short recessed-looking arcs in the closed motor cover, never open bicycle spokes.
      motorParts.push(face(shaded(new THREE.RingGeometry(TYRE_RADIUS * 0.27, TYRE_RADIUS * 0.35,
        4, 1, theta, 0.47), 0.16), faceY));
      const screw = shaded(new THREE.CircleGeometry(0.005, 6), 0.95)
        .translate(Math.cos(theta) * TYRE_RADIUS * 0.405, Math.sin(theta) * TYRE_RADIUS * 0.405, 0);
      motorParts.push(face(screw, faceY));
    }
    // One valve per side supplies an asymmetric rotation cue at the bead, with a dark cap.
    motorParts.push(shaded(new THREE.BoxGeometry(0.009, 0.004, 0.020), 0.24)
      .translate(TYRE_RADIUS * 0.69, side * (TYRE_HALF_WIDTH + 0.003), 0.031));
  }`);
    s = replaceOnce(s, "group.add(tyre);", `group.add(tyre);
  const motor = new THREE.Mesh(track(mergeGeometries(motorParts)), pedalMaterial);
  motor.name = 'euc-motor-cover';
  motor.castShadow = true;
  motor.receiveShadow = true;
  tyre.add(motor);`);
    return s;
  },
  // The city has stacked roads. Forward query height without changing the controller's tuning / contact maths.
  // Exact counts deliberately fail when the upstream query sites change.
  'simulation/EucController.ts': (src) => {
    let s = controllerGroundHeights(controllerTransitions(src));
    s = replaceOnce(s, 'private dynamicSpinApplied = 0;', `private dynamicSpinApplied = 0;
  private dynamicComeBackApplied = 0;`);
    s = replaceOnce(s, 'this.dynamicSpinApplied = 0;', 'this.dynamicSpinApplied = 0; this.dynamicComeBackApplied = 0;');
    s = replaceOnce(s, 'working.dynamicSpinApplied = 0;', 'working.dynamicSpinApplied = 0; working.dynamicComeBackApplied = 0;');
    s = replaceOnce(s, 'this.comeBackTurn -= sweep;', `if (this.dynamicPrevious) this.dynamicComeBackApplied = sweep;
        this.comeBackTurn -= sweep;`);
    s = replaceOnce(s, 'this.styleHeading = lerp(this.dynamicStyleHeadingPrevious, this.styleHeading, fraction);',
      `this.styleHeading = lerp(this.dynamicStyleHeadingPrevious, this.styleHeading, fraction);
    // Automatic yaw is subject to the same admission as a player spin. Refused angular travel remains due.
    if (this.dynamicComeBackApplied > 0) this.comeBackTurn += this.dynamicComeBackApplied * (1 - fraction);`);
    s = replaceOnce(s, 'private clearTransitionMotion(): void {', `private clearTransitionMotion(): void {
    this.dynamicComeBackApplied = 0;`);
    let wheelSites = 0;
    s = s.replace(/(private (?:applyWallStandoff|obstacleWithinWheelRadius)\([^]*?const raycastObstacle = )this\.sampler\.raycastObstacle;/g,
      (_all, prefix) => { wheelSites++; return prefix + 'this.sampler.raycastWheelObstacle ?? this.sampler.raycastObstacle;'; });
    if (wheelSites !== 2) throw new Error(`controller wheel clearance sites changed: ${wheelSites}`);
    s = s.replace('private safeX = 0;', 'private safeX = 0;\n  private safeY = 0;');
    s = s.replace('this.x = this.spawn.position.x;', 'this.y = this.spawn.position.y;\n    this.x = this.spawn.position.x;');
    s = s.replace('destination.headingY, initialSpeed, placementReason)', 'destination.headingY, initialSpeed, placementReason, destination.position.y)');
    s = s.replace("reason: EucPlacementRequest['reason']): boolean", "reason: EucPlacementRequest['reason'], referenceY = reason === 'recover' ? this.safeY : this.y): boolean");
    s = s.replace('this.sampler.sampleGround(x, z, this.probe, this.y);', 'this.sampler.sampleGround(x, z, this.probe, referenceY);');
    s = s.replaceAll('this.safeX = this.x;', 'this.safeX = this.x; this.safeY = this.y;');
    s = s.replace('this.x = target.x;', 'this.y = target.y;\n    this.x = target.x;');
    s = s.replace('new Float64Array(3 * POPULATION_CONTACT.recoveryRingPoints)', 'new Float64Array(4 * POPULATION_CONTACT.recoveryRingPoints)');
    s = s.replaceAll('% size) * 3;', '% size) * 4;').replace('this.safeRingNext * 3;', 'this.safeRingNext * 4;');
    s = s.replace('ring[slot + 2] = this.safeHeading;', 'ring[slot + 2] = this.safeHeading; ring[slot + 3] = this.safeY;');
    s = s.replace('private recoveryTarget(restored: number): { x: number; z: number; headingY: number }',
      'private recoveryTarget(restored: number): { x: number; y: number; z: number; headingY: number }');
    s = s.replace('return { x: this.safeX, z: this.safeZ, headingY: this.safeHeading };',
      'return { x: this.safeX, y: this.safeY, z: this.safeZ, headingY: this.safeHeading };');
    s = s.replace("this.dynamicPlacementClear(x, z, headingY, restored, 'recover')) return { x, z, headingY };",
      "this.dynamicPlacementClear(x, z, headingY, restored, 'recover', ring[slot + 3])) return { x, y: ring[slot + 3], z, headingY };");
    s = s.replace('return { x, z, headingY: this.safeHeading };', 'return { x, y: this.safeY, z, headingY: this.safeHeading };');
    s = s.replace('this.sampler.sampleGround(x, z, ground, this.y);', 'this.sampler.sampleGround(x, z, ground, this.safeY);');
    s = s.replace('safePosition: { x: this.safeX, y: 0, z: this.safeZ }', 'safePosition: { x: this.safeX, y: this.safeY, z: this.safeZ }');
    s = replaceOnce(s, 'readonly chargeImpact?: boolean;', `readonly chargeImpact?: boolean;
  readonly vehicleImpact?: boolean;
  readonly crashVelocityX?: number;
  readonly crashVelocityZ?: number;`);
    s = replaceOnce(s, 'readonly ragObstacleBodies?: () => readonly PopulationFootprint[];',
      `readonly ragObstacleBodies?: (fallen?: { x: number; z: number }) => readonly PopulationFootprint[];
  readonly crashObstacleBodies?: (fallen: { x: number; z: number }) => readonly PopulationFootprint[];`);
    s = s.replaceAll('ragObstacleBodies: world.ragObstacleBodies,',
      'ragObstacleBodies: world.ragObstacleBodies, crashObstacleBodies: world.crashObstacleBodies,');
    s = replaceOnce(s, 'bodyTuning, contactBodies, this.headingY);', `bodyTuning,
        this.dynamicWorld?.crashObstacleBodies?.({ x: this.ragdoll.positions[RD_PELVIS * 3], z: this.ragdoll.positions[RD_PELVIS * 3 + 2] }) ?? contactBodies,
        this.headingY);`);
    s = replaceOnce(s, 'private dynamicImpactSpeed = 0;', `private dynamicImpactSpeed = 0;
  private vehicleImpact = false;
  private crashVelocityX = 0;
  private crashVelocityZ = 0;
  private recoveryRetrySeconds = 0;`);
    s = s.replaceAll('this.dynamicImpactSpeed = 0;', 'this.dynamicImpactSpeed = 0; this.vehicleImpact = false;');
    s = replaceOnce(s, 'this.dynamicImpactSpeed = result.closingSpeedMetresPerSecond;', `this.dynamicImpactSpeed = result.closingSpeedMetresPerSecond;
        this.vehicleImpact = result.vehicleImpact === true && Number.isFinite(result.crashVelocityX) && Number.isFinite(result.crashVelocityZ);
        this.crashVelocityX = this.vehicleImpact ? result.crashVelocityX! : 0;
        this.crashVelocityZ = this.vehicleImpact ? result.crashVelocityZ! : 0;`);
    s = replaceOnce(s, 'intoSolid: cause === \'obstacle\' && motion === undefined,', `intoSolid: cause === 'obstacle' && motion === undefined,
        velocityX: vehicleLaunch ? this.crashVelocityX : undefined,
        velocityZ: vehicleLaunch ? this.crashVelocityZ : undefined,`);
    s = replaceOnce(s, 'const setback = highFall ? t.crashHighFallSetbackMetres : 0;', `const setback = highFall ? t.crashHighFallSetbackMetres : 0;
      const vehicleLaunch = cause === 'obstacle' && motion === undefined && this.vehicleImpact
        && this.dynamicImpactSpeed >= this.collisionImpact && !highFall;`);
    s = replaceOnce(s, 'const contactBodies = this.dynamicWorld?.ragObstacleBodies?.() ?? this.dynamicWorld?.ragObstacles ?? [];',
      `const contactBodies = this.dynamicWorld?.ragObstacleBodies?.(this.ragdolling
      ? { x: this.ragdoll.positions[RD_PELVIS * 3], z: this.ragdoll.positions[RD_PELVIS * 3 + 2] } : undefined)
      ?? this.dynamicWorld?.ragObstacles ?? [];`);
    s = replaceOnce(s, 'private respawn(): boolean {', `/** Manual get-up uses the same timing and placement admission as automatic recovery. */
  recover(): boolean {
    if (!this.crashing || this.crashFalling || this.crashTime < this.tuning.crashRecoverEarliestSeconds) return false;
    return this.respawn();
  }

  private respawn(atRest = false): boolean {`);
    s = replaceOnce(s, 'const restored = this.crashSpeed * t.crashRecoverSpeedFactor;', `// NYC: use the fallen body's validated floor, not pelvis height, for its local speed policy.
    // Keep rejected-recovery retries bounded before doing support/footprint queries.
    if (this.sampler.findRecoveryTarget && this.recoveryRetrySeconds > 0) return false;
    let restored = atRest ? 0 : this.fallenRecoverySpeed(this.crashSpeed * t.crashRecoverSpeedFactor);`);
    // SF: water recovery must run inside controller ownership, including prepared
    // transactions. Host hardKnock is invulnerability-gated; host reset would
    // discard the safe-floor trail and duplicate the native retry/placement path.
    s = replaceOnce(s, 'step(dt: number, actions: ActionSnapshot): void {', `step(dt: number, actions: ActionSnapshot): void {
    if (dt > 0 && this.sampler.needsWaterRecovery?.(this.x, this.z, this.y)) {
      this.invalidatePreparedStep();
      this.dynamicPrevious = null;
      this.dynamicIntent = null;
      this.justTookOff = this.justTouchedDown = this.justHopped = this.justPadLaunched = false;
      this.collisionImpact = 0;
      this.recoveryRetrySeconds = Math.max(0, this.recoveryRetrySeconds - dt);
      // Checked dry support, full standing/departure clearance and live occupancy.
      // A refusal holds the current pose; throttle cannot propel an underwater rider.
      this.respawn(true);
      return;
    }`);
    s = replaceOnce(s, 'if (!target) return false;\n\n    this.y = target.y;', `if (!target) return false;
    restored = this.recoverySpeedAt(target.x, target.z, target.y, restored);

    this.y = target.y;`);
    s = replaceOnce(s, 'this.spinSwept = false;\n    this.crouch = 0;', 'this.spinSwept = false;\n    this.clearTransitionMotion();\n    this.crouch = 0;');
    s = replaceOnce(s, 'const canPlace = this.dynamicWorld?.canPlace;', `if (reason === 'recover') speed = this.recoverySpeedAt(x, z, referenceY, speed);
    const canPlace = this.dynamicWorld?.canPlace;`);
    s = replaceOnce(s, 'private recoveryTarget(restored: number):', `private recoverySpeedAt(x: number, z: number, referenceY: number, shipped: number): number {
    return this.sampler.restartsAtRest?.(x, z, referenceY) === true ? 0 : shipped;
  }

  private fallenRecoverySpeed(shipped: number): number {
    if (!this.sampler.restartsAtRest) return shipped;
    const p = this.ragdoll.positions;
    const x = this.ragdolling ? p[RD_PELVIS * 3] : this.x;
    const z = this.ragdolling ? p[RD_PELVIS * 3 + 2] : this.z;
    const referenceY = this.ragdolling ? p[RD_PELVIS * 3 + 1] : this.y;
    const ground = this.sampler.sampleGround(x, z, this.probe, referenceY);
    const floorY = ground.height;
    // Match checked recovery's settled-body height window. No upward snap to an overhead floor or mid-fall policy.
    if (!Number.isFinite(floorY) || floorY > referenceY + 0.03 || referenceY - floorY > 1.1
      || ground.offCourse || ground.surface === 'spill' || ground.traction === 'spill' || ground.normal.y < 0.9) return shipped;
    const speed = this.recoverySpeedAt(x, z, floorY, shipped);
    if (speed === shipped) return shipped;
    // NYC's existing admission owns dry footprint, actual bodies/ceilings and water. This static validation must
    // ignore moving occupancy: a refused park placement can legitimately fall back outside while retaining rest.
    if (this.sampler.findPlacementTarget) {
      const support = this.sampler.findPlacementTarget({ x, z, referenceY, headingY: this.headingY,
        maxStepUp: this.tuning.maxStepUp, hull: this.dynamicWorld?.hull });
      if (!support || Math.abs(support.y - floorY) > 1e-5) return shipped;
    }
    return speed;
  }

  private recoveryTarget(restored: number):`);
    s = replaceOnce(s, 'this.crashTime += dt;', 'this.crashTime += dt;\n    this.recoveryRetrySeconds = Math.max(0, this.recoveryRetrySeconds - dt);');
    s = s.replaceAll('this.crashTime = 0;', 'this.crashTime = 0; this.recoveryRetrySeconds = 0;');
    s = replaceOnce(s, 'private recoveryTarget(restored: number): { x: number; y: number; z: number; headingY: number } | null {',
      `private recoveryTarget(restored: number): { x: number; y: number; z: number; headingY: number } | null {
    if (this.sampler.findRecoveryTarget) {
      if (this.recoveryRetrySeconds > 0) return null;
      this.recoveryRetrySeconds = 0.2;
      const safePoints = [{ x: this.safeX, y: this.safeY, z: this.safeZ, headingY: this.safeHeading }];
      const size = POPULATION_CONTACT.recoveryRingPoints;
      for (let age = 0; age < this.safeRingCount; age++) {
        const slot = ((this.safeRingNext + size - 1 - age) % size) * 4;
        if (this.safeRing[slot] === this.safeX && this.safeRing[slot + 1] === this.safeZ && this.safeRing[slot + 3] === this.safeY) continue;
        safePoints.push({ x: this.safeRing[slot], y: this.safeRing[slot + 3], z: this.safeRing[slot + 1], headingY: this.safeRing[slot + 2] });
      }
      const p = this.ragdoll.positions;
      return this.sampler.findRecoveryTarget({
        fallen: this.ragdolling ? { x: p[RD_PELVIS * 3], y: p[RD_PELVIS * 3 + 1], z: p[RD_PELVIS * 3 + 2] } : { x: this.x, y: this.y, z: this.z },
        safePoints, headingY: this.headingY, maxStepUp: this.tuning.maxStepUp, hull: this.dynamicWorld?.hull,
      }, target => this.dynamicPlacementClear(target.x, target.z, target.headingY, restored, 'recover', target.y));
    }`);
    return s;
  },
  'simulation/ragdoll.ts': (src) => {
    const ys = ['py', 'py', 'pos[RD_PELVIS * 3 + 1]', 'pos[base + 1]',
      'this.positions[RD_PELVIS * 3 + 1]', 'o[1]', 'p[b + 1]'];
    let count = 0;
    let s = src.replace(/sampler\.sampleGround\(([^;\n]+)\);/g, (all, args) =>
      `sampler.sampleGround(${args}, ${ys[count++]});`);
    if (count !== ys.length) throw new Error(`ragdoll height query sites changed: ${count}`);
    // Vehicle-only planar launch, still subject to the stock total-speed cap and all native contact constraints.
    s = replaceOnce(s, 'launchSpeed = Math.max(launchSpeed, Math.sqrt((vForward) * (vForward) + (vUp) * (vUp) + (vSide) * (vSide)));', `
      if (input.velocityX !== undefined && input.velocityZ !== undefined) {
        const carry = upper ? 1 : 0.9;
        vForward = (forwardX * input.velocityX + forwardZ * input.velocityZ) * carry;
        vSide = (leftX * input.velocityX + leftZ * input.velocityZ) * carry;
      }
      launchSpeed = Math.max(launchSpeed, Math.sqrt((vForward) * (vForward) + (vUp) * (vUp) + (vSide) * (vSide)));`);
    s = replaceOnce(s, 'intoSolid: boolean;', 'intoSolid: boolean;\n  velocityX?: number;\n  velocityZ?: number;');
    const supportSite = 'const offset=nx*r[box+1]+ny*r[box+2]+nz*r[box+3]+Math.abs(c*nx-s*nz)*r[box+4]+Math.abs(ny)*r[box+5]+Math.abs(s*nx+c*nz)*r[box+6];';
    if (s.split(supportSite).length !== 3) throw new Error('SF prism trunk support sites changed');
    s = s.replaceAll(supportSite,
      'const offset=(r as any).sfContacts?.get(box)?.support(nx,ny,nz) ?? (nx*r[box+1]+ny*r[box+2]+nz*r[box+3]+Math.abs(c*nx-s*nz)*r[box+4]+Math.abs(ny)*r[box+5]+Math.abs(s*nx+c*nz)*r[box+6]);');
    return s;
  },
  'simulation/world.ts': (src) => {
    useDonor('simulation/world.ts', 'transitionAt and restartsAtRest capability contracts; NYC location/elevation arguments and checked fallen-support validation');
    return replaceOnce(replaceOnce(src, 'sampleGround(x: number, z: number, out: GroundSample): GroundSample;',
      'sampleGround(x: number, z: number, out: GroundSample, referenceY?: number): GroundSample;'),
    'export interface TerrainSampler {', `
type RecoveryPoint = { x: number; y: number; z: number; headingY: number };
export interface TerrainSampler {
  /** SF immersion policy: selected wet support AND actual foot below water. */
  needsWaterRecovery?(x: number, z: number, referenceY: number): boolean;
  /** Feature capability at the selected support elevation, never an XZ-only park toggle. */
  transitionAt?(x: number, z: number, referenceY: number): boolean;
  /** Local fallen/candidate restart policy. Absence/false retains native crash-speed restoration. */
  restartsAtRest?(x: number, z: number, referenceY: number): boolean;
  raycastWheelObstacle?: TerrainSampler['raycastObstacle'];
  /** Existing NYC static support/footprint/water validation, independent of moving occupancy. */
  findPlacementTarget?(request: {
    x: number; z: number; headingY: number; referenceY: number; maxStepUp: number;
    hull?: { halfWidthMetres: number; halfLengthMetres: number; heightMetres: number };
  }): RecoveryPoint | null;
  findRecoveryTarget?(request: {
    fallen: Vec3; safePoints: RecoveryPoint[]; headingY: number; maxStepUp: number;
    hull?: { halfWidthMetres: number; halfLengthMetres: number; heightMetres: number };
  }, canPlace: (point: RecoveryPoint) => boolean): RecoveryPoint | null;`);
  },
  'simulation/eucStepPrimitives.ts': (src) => {
    // Retain the base schema and its NYC additions; extract and verify the donor's exact new field/copy closure.
    const donor = useDonor('simulation/eucStepPrimitives.ts', { fields: TRANSITION_FIELDS, nycFields: ['dynamicComeBackApplied'] });
    for (const field of TRANSITION_FIELDS) {
      if (!donor.includes(`'${field}'`) || !donor.includes(`to.${field} = from.${field};`)) throw new Error(`Missing donor primitive: ${field}`);
    }
    let s = replaceOnce(src, "'spinSwept', 'flights',", `'spinSwept', 'flights', ${TRANSITION_FIELDS.map(f => `'${f}'`).join(', ')},`);
    s = replaceOnce(s, 'to.flights = from.flights;', 'to.flights = from.flights;\n  ' + TRANSITION_FIELDS.map(f => `to.${f} = from.${f};`).join('\n  '));
    s = replaceOnce(s, "'dynamicSpinApplied'", "'dynamicSpinApplied', 'dynamicComeBackApplied'");
    s = replaceOnce(s, 'to.dynamicSpinApplied = from.dynamicSpinApplied;', 'to.dynamicSpinApplied = from.dynamicSpinApplied;\n  to.dynamicComeBackApplied = from.dynamicComeBackApplied;');
    s = replaceOnce(s, "'safeX', 'safeZ'", "'safeX', 'safeY', 'safeZ'");
    s = replaceOnce(s, 'to.safeX = from.safeX;', 'to.safeX = from.safeX;\n  to.safeY = from.safeY;');
    s = replaceOnce(s, "'dynamicImpactSpeed'", "'vehicleImpact', 'crashVelocityX', 'crashVelocityZ', 'recoveryRetrySeconds', 'dynamicImpactSpeed'");
    return replaceOnce(s, 'to.dynamicImpactSpeed = from.dynamicImpactSpeed;', 'to.vehicleImpact = from.vehicleImpact;\n  to.crashVelocityX = from.crashVelocityX;\n  to.crashVelocityZ = from.crashVelocityZ;\n  to.recoveryRetrySeconds = from.recoveryRetrySeconds;\n  to.dynamicImpactSpeed = from.dynamicImpactSpeed;');
  },
  'render/riderLook.ts': (src) => {
    return `${sliceDeclarations(src, ['COP_LOOK', 'MOTION_STILL'])}
import { preparedRiderLook } from './appearanceRegistry.ts';
export function riderLook(id: string) { return id === 'cop' ? COP_LOOK : preparedRiderLook(id); }
`;
  },
  'render/machineLook.ts': (src) => {
    return `${sliceDeclarations(src, ['STANDARD_MACHINE_LOOK', 'TROLLINA_MACHINE_LOOK'])}
import { preparedMachineLook } from './appearanceRegistry.ts';
export function machineLook(id: string) {
  if (id === 'standard') return STANDARD_MACHINE_LOOK;
  if (id === 'trollina') return TROLLINA_MACHINE_LOOK;
  return preparedMachineLook(id);
}
`;
  },
  'render/rider.ts': src => replaceOnce(replaceOnce(src, '  COOL_RIDER_LOOK,', '  riderLook,'),
    'look: RiderLook = COOL_RIDER_LOOK', "look: RiderLook = riderLook('cool-rider')"),
  'render/ridingRig.ts': () => {
    // The complete diff of this one rig file is the reviewed near-solid channel only. Preserve NYC's lazy look seam.
    let source = useDonor('render/ridingRig.ts', 'near-solid presentation channel; NYC cached selected-geometry visual tyre radius, flight/crash exclusions and constraint-safe release easing; no appearance/resource graph migration');
    source = replaceOnce(replaceOnce(source, 'import { COOL_RIDER_LOOK, MOTION_STILL,',
      'import { riderLook, MOTION_STILL,'), 'look: RiderLook = COOL_RIDER_LOOK', "look: RiderLook = riderLook('cool-rider')");
    source = replaceOnce(source, '  readonly nearPush: readonly [number, number];', `  readonly nearPush: readonly [number, number];
  /** Once-built radial XZ envelope of this selected euc-tyre, before its static Z rotation. Presentation only. */
  readonly visualTyreRadius: number;`);
    source = replaceOnce(source, '  const paddle = createPaddle();', `  // Consolidation retains the independently spinning tyre mesh. Its local cylinder axis is Y; rotation.z
  // places that axle on X later. Read geometry exactly once, including the selected machine's merged lugs/rim.
  const tyrePositions = euc.tyre.geometry.getAttribute('position');
  let visualTyreRadius = WHEEL.tyreDiameter / 2;
  for (let index = 0; index < tyrePositions.count; index += 1) {
    const radius = Math.hypot(tyrePositions.getX(index), tyrePositions.getZ(index));
    if (!Number.isFinite(radius) || radius > WHEEL.tyreDiameter) throw new RangeError('Invalid selected visual tyre geometry');
    visualTyreRadius = Math.max(visualTyreRadius, radius);
  }
  const paddle = createPaddle();`);
    source = replaceOnce(source, '    get nearPush(): readonly [number, number] {', `    get visualTyreRadius(): number { return visualTyreRadius; },

    get nearPush(): readonly [number, number] {`);
    // Be robust to a retained channel at crash/air entry, not just to the host remembering to clear it.
    source = replaceOnce(source, 'const along = crashing ? 0 : solidAlong;', `const excluded = crashing || pose.airHeight > 1e-4;
      const lift = excluded ? 0 : solidLift;
      const along = excluded ? 0 : solidAlong;`);
    source = replaceOnce(source, 'pose.y + solidLift,', 'pose.y + lift,');
    source = replaceOnce(source, '-pose.suspensionOffset - solidLift;', '-pose.suspensionOffset - lift;');
    source = replaceOnce(source, 'if (crashing) {\n        push[0]', 'if (excluded) {\n        push[0]');
    source = replaceOnce(source, 'push[1] = targetZ + (push[1] - targetZ) * keep;', `push[1] = targetZ + (push[1] - targetZ) * keep;
      // NYC: magnitude alone cannot decide whether easing is safe. A smaller push at a different face
      // is still an arrival at that face: do not blend through it while releasing the previous wall.
      if (solidAny) {
        const easedX = push[0] * cos - push[1] * sin;
        const easedZ = push[0] * sin + push[1] * cos;
        for (let entry = 0; entry < solidFaces.length; entry += 1) {
          if (!(solidFaces[entry] < Number.POSITIVE_INFINITY) || nearest[entry] === Number.POSITIVE_INFINITY) continue;
          const reach = nearest[entry] + easedX * solidNormals[2 * entry] + easedZ * solidNormals[2 * entry + 1];
          if (reach < offsets[entry] + NEAR_SOLID.faceGap - 1e-9) {
            push[0] = targetX;
            push[1] = targetZ;
            break;
          }
        }
      }`);
    // Only the NPC carries a paddle. Keep player rigs free of paddle geometry; the
    // upstream aiming/stance channel stays available for the one cop rig and owns its disposal.
    source = replaceOnce(source, 'const paddle = createPaddle();', "const paddle = look.id === 'cop' ? createPaddle() : null;");
    source = replaceOnce(source, 'rider.grip.add(paddle.group);', 'if (paddle) rider.grip.add(paddle.group);');
    source = replaceOnce(source, 'paddle.aim(swingHead, swingBlend, pose.y - pose.suspensionOffset);',
      'paddle?.aim(swingHead, swingBlend, pose.y - pose.suspensionOffset);');
    source = replaceOnce(source, 'paddle.dispose();', 'paddle?.dispose();');
    return source;
  },
  'data/riders.ts': src => {
    let source = replaceOnce(src, namedDeclaration(src, 'COP_CHARACTER'), '');
    source = replaceOnce(source, 'Object.freeze([...CHARACTERS, COP_CHARACTER])', 'CHARACTERS');
    return replaceOnce(source, '  cop: SOBER_STYLE,', '');
  },
  'data/tuning.ts': src => {
    const donor = useDonor('data/tuning.ts', { declarations: ['NEAR_SOLID', 'SKATE_TRANSITION'] });
    // Existing tuning exports/aliases/freeze ownership stay native; only seven exclusive cosmetic colours and
    // dead live-panel metadata are pruned. No new TUNING root entries or physical value changes.
    return pruneUnshippedColours(pruneLiveTuningMetadata(src)) + '\n' + ['NEAR_SOLID', 'SKATE_TRANSITION'].map(name => namedDeclaration(donor, name)).join('\n');
  },
};

const require = createRequire(path.join(SRC_ROOT, 'package.json'));
let ts;
try {
  ts = require('typescript');
} catch {
  console.error(`typescript not found under ${SRC_ROOT}/node_modules — run \`npm ci\` in the EUC Thrills clone first.`);
  process.exit(1);
}

const TRANSPILE_OPTIONS = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  verbatimModuleSyntax: true, removeComments: true, allowImportingTsExtensions: true };

// Slice the actual emitted declarations, not hand-copied art or brittle character-section offsets. Type-only
// references disappear first. Follow identifier dependencies transitively and retain only used import bindings.
function sliceDeclarations(source, roots) {
  const code = ts.transpileModule(source, { compilerOptions: TRANSPILE_OPTIONS }).outputText;
  const tree = ts.createSourceFile('appearance.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declarations = new Map(), imports = new Map();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, [statement, 'default']);
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text, [statement, '*']);
        else for (const binding of clause.namedBindings.elements) imports.set(binding.name.text, [statement, binding]);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) throw new Error('Appearance declaration destructuring needs review');
        declarations.set(d.name.text, statement);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) declarations.set(statement.name.text, statement);
  }
  const needed = new Set(), selected = new Set();
  const visit = name => {
    if (needed.has(name)) return;
    needed.add(name);
    const statement = declarations.get(name);
    if (!statement) {
      if (roots.includes(name) && !imports.has(name)) throw new Error(`Missing reviewed appearance: ${name}`);
      return;
    }
    selected.add(statement);
    const refs = node => {
      if (ts.isIdentifier(node)) visit(node.text);
      ts.forEachChild(node, refs);
    };
    refs(statement);
  };
  roots.forEach(visit);
  const lines = [];
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const bindings = [...imports].filter(([name, [s]]) => s === statement && needed.has(name));
      if (!bindings.length) continue;
      const defaults = bindings.filter(([, [, b]]) => b === 'default').map(([name]) => name);
      const namespace = bindings.find(([, [, b]]) => b === '*');
      const named = bindings.filter(([, [, b]]) => typeof b === 'object').map(([, [, b]]) => b.getText(tree));
      const parts = [...defaults, ...(namespace ? [`* as ${namespace[0]}`] : []), ...(named.length ? [`{ ${named.join(', ')} }`] : [])];
      lines.push(`import ${parts.join(', ')} from ${statement.moduleSpecifier.getText(tree)};`);
    } else if (selected.has(statement)) {
      const isRoot = roots.some(name => declarations.get(name) === statement);
      lines.push((isRoot ? 'export ' : '') + statement.getText(tree).replace(/^export /, ''));
    }
  }
  const importedRoots = roots.filter(name => imports.has(name));
  return `${lines.join('\n')}\n${importedRoots.length ? `export { ${importedRoots.join(', ')} };` : ''}\n`;
}

const AGENT_GUIDANCE = `// FOR CODING AGENTS — DOWNSTREAM FORKS\n// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.\n// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse\n// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.\n// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the\n// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.\n// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.\n`;

// Each cache reports its live arrays, allowing unique backing buffers to be counted without retaining the arrays
// in this registry. Release removes module ownership only; existing DataTextures retain their own pixel references.
function adaptAppearanceCaches(rel, source) {
  if (rel.startsWith('render/pixels/')) return source; // one-shot worker modules retain only their selected job
  const base = path.posix.basename(rel);
  const pixelCaches = ['maribelAtlas.ts', 'wimAtlas.ts', 'wimMachineAtlas.ts', 'drunkardAtlas.ts',
    'drunkardMachineAtlas.ts', 'sealAtlas.ts'];
  let release, arrays, snapshot, install;
  if (pixelCaches.includes(base)) {
    release = 'cachedPixels = null;'; arrays = '[cachedPixels]';
    snapshot = '{ pixels: cachedPixels }'; install = 'cachedPixels = bank.pixels;';
    if (/let cachedFor:/.test(source)) {
      release += ' cachedFor = null;'; install += ' cachedFor = null;';
      // Transferred pixels were painted from this exact selected source layout in the worker. Associate them
      // with the main realm's immutable layout on first use; never clone/compare function-bearing look objects.
      source = replaceOnce(source, 'if (cachedPixels !== null && cachedFor === layout) return cachedPixels;',
        'if (cachedPixels !== null && (cachedFor === layout || cachedFor === null)) { cachedFor = layout; return cachedPixels; }');
    }
    if (base === 'maribelAtlas.ts') {
      release += ' cachedMark = null;'; arrays = '[cachedPixels, cachedMark?.rgba]';
      snapshot = '{ pixels: cachedPixels, mark: cachedMark }'; install += ' cachedMark = bank.mark;';
    }
    if (base === 'wimAtlas.ts') {
      release += ' cachedMarks.upright = cachedMarks.turned = null;';
      arrays = '[cachedPixels, cachedMarks.upright?.rgba, cachedMarks.turned?.rgba]';
      snapshot = '{ pixels: cachedPixels, upright: cachedMarks.upright, turned: cachedMarks.turned }';
      install += ' cachedMarks.upright = bank.upright; cachedMarks.turned = bank.turned;';
    }
  } else if (['coolRiderAtlas.ts', 'wyldistAtlas.ts'].includes(base)) {
    source = source.replace(/new WeakMap<([^>]+)>\(\)/, 'new Map<$1>()');
    // Immutable source layouts are normally singleton; cap even accidental alternate-layout use to one buffer.
    source = replaceOnce(source, 'cached.set(layout, pixels);', 'cached.clear(); cached.set(layout, pixels);');
    source = replaceOnce(source, 'cached.get(layout)', `(cached.get(layout) ?? takePrepaintedPixels(layout))`);
    source += `\nlet prepaintedPixels = null;
function takePrepaintedPixels(layout) {
  if (prepaintedPixels === null) return undefined;
  const pixels = prepaintedPixels; prepaintedPixels = null;
  cached.clear(); cached.set(layout, pixels); return pixels;
}\n`;
    release = 'cached.clear(); prepaintedPixels = null;'; arrays = '[...cached.values(), prepaintedPixels]';
    snapshot = '{ pixels: cached.values().next().value ?? prepaintedPixels }';
    install = 'cached.clear(); prepaintedPixels = bank.pixels;';
  } else if (base === 'gnarwheelAtlas.ts') {
    release = 'cached = null;'; arrays = '[cached]'; snapshot = '{ pixels: cached }'; install = 'cached = bank.pixels;';
  }
  if (!release) return source;
  return `import { registerAppearanceCache } from './appearanceRegistry.ts';\n${source}\n`
    + `registerAppearanceCache('${base}', () => { ${release} }, () => ${arrays}, () => (${snapshot}), bank => { ${install} });\n`;
}

const synthetic = new Map();
const syntheticOrigins = new Map();
const syntheticLocalOrigins = new Map();
function addSynthetic(rel, source, origins = []) { synthetic.set(rel, source); syntheticOrigins.set(rel, origins); }

// Add a data-only companion to each original build closure. It captures the exact resolved layout used by the
// real texture builder, so the worker does not import appearances, machine arrays or any render construction code.
// AST property matching avoids touching comments/geometry build hooks; the complete known site count is checked.
const paintInputSites = new Map();
function addPaintInputMetadata(source) {
  const tree = ts.createSourceFile('appearance.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits = [];
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'build') {
      const value = node.initializer;
      const call = ts.isArrowFunction(value) && ts.isCallExpression(value.body) ? value.body : null;
      const name = call && ts.isIdentifier(call.expression) ? call.expression.text : ts.isIdentifier(value) ? value.text : '';
      const painter = PIXEL_PAINTERS.find(row => row[1] === name);
      if (painter) {
        const args = call ? call.arguments.map(arg => arg.getText(tree)).join(', ') : '';
        edits.push({ at: node.getStart(tree), text: `paintInput: () => ({ cache: '${painter[0]}.ts', args: [${args}] }),\n` });
        paintInputSites.set(name, (paintInputSites.get(name) ?? 0) + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const edit of edits.sort((a, b) => b.at - a.at)) source = source.slice(0, edit.at) + edit.text + source.slice(edit.at);
  return source;
}

function cpuPainterSource(source, roots) {
  let sliced = sliceDeclarations(source, roots);
  sliced = sliced.replace("import * as THREE from 'three';", "import { PaintVector3 } from './paintVector.ts';")
    .replaceAll('THREE.Vector3', 'PaintVector3');
  if (/\bTHREE\b/.test(sliced)) throw new Error('CPU painter gained an unreviewed Three dependency');
  return sliced.replaceAll("'./blockoutKit.ts'", "'./paintSurface.ts'")
    .replaceAll("'../data/tuning.ts'", "'./paintColours.ts'")
    .replaceAll("'./inkKit.ts'", "'../inkKit.ts'")
    .replaceAll("'./pngDecode.ts'", "'../pngDecode.ts'")
    .replace(/(['"])\.\.\/data\//g, '$1../../data/');
}
const vectorSource = fs.readFileSync(path.join(ROOT, PAINT_VECTOR_SOURCE), 'utf8');
if (crypto.createHash('sha256').update(vectorSource).digest('hex') !== PAINT_VECTOR_SHA256) {
  throw new Error('Pinned Three vector source changed; review CPU painter arithmetic before regeneration');
}
const vectorTree = ts.createSourceFile('three.core.js', vectorSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const vectorClass = vectorTree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'Vector3');
if (!vectorClass) throw new Error('Pinned Three Vector3 class missing');
const vectorMembers = PAINT_VECTOR_METHODS.map(name => {
  const member = vectorClass.members.find(node => name === 'constructor' ? ts.isConstructorDeclaration(node) : node.name?.getText(vectorTree) === name);
  if (!member) throw new Error(`Pinned vector method missing: ${name}`);
  return member.getText(vectorTree);
});
addSynthetic('render/pixels/paintVector.ts', `export class PaintVector3 {\n${vectorMembers.join('\n')}\n}`);
syntheticLocalOrigins.set('render/pixels/paintVector.ts', [{ source: PAINT_VECTOR_SOURCE,
  sourceSha256: PAINT_VECTOR_SHA256, methods: PAINT_VECTOR_METHODS, license: 'vendor/three/LICENSE' }]);
const surfaceSource = fs.readFileSync(path.join(SRC_ROOT, 'src/render/blockoutKit.ts'), 'utf8');
addSynthetic('render/pixels/paintSurface.ts', cpuPainterSource(surfaceSource, ['loftPoint', 'loftNormal', 'vAtHeight']), ['render/blockoutKit.ts']);
addSynthetic('render/pixels/paintColours.ts', sliceDeclarations(pruneUnshippedColours(fs.readFileSync(path.join(SRC_ROOT, 'src/data/tuning.ts'), 'utf8')),
  ['BLOCKOUT_COLOURS']), ['data/tuning.ts']);
for (const [module, , pixels, extra] of PIXEL_PAINTERS) {
  const origin = `render/${module}.ts`;
  const source = fs.readFileSync(path.join(SRC_ROOT, 'src', origin), 'utf8');
  const roots = [pixels, ...(module === 'drunkardAtlas' ? ['paintHop'] : []),
    ...(module === 'wimAtlas' ? ['MARK_ASPECT', 'markRaster', 'patchStretch'] : [])];
  addSynthetic(`render/pixels/${module}.ts`, `${cpuPainterSource(source, roots)}
${module === 'wimAtlas' ? 'export { markRaster as wimMarkRaster, patchStretch as wimPatchStretch };' : ''}
export function paintBank(...args) { const pixels = ${pixels}(...args); return { pixels${extra} }; }\n`, [origin]);
}
addSynthetic('render/appearancePixelImports.ts', `
const pixelCaches = Object.freeze(${JSON.stringify(PIXEL_CACHE_IDS)});
const painters = Object.freeze({
${PIXEL_PAINTERS.map(([module]) => `  '${module}.ts': () => import('./pixels/${module}.ts')`).join(',\n')}
});
export async function paintAppearancePixels(id, inputs) {
  if (!Object.hasOwn(pixelCaches, id)) throw new Error('Unknown playable appearance: ' + String(id));
  const expected = pixelCaches[id];
  if (!inputs || JSON.stringify(Object.keys(inputs).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error('Incomplete appearance painting inputs');
  }
  const caches = {};
  for (const cache of expected) {
    if (!Array.isArray(inputs[cache])) throw new Error('Invalid appearance painting layout');
    const { paintBank } = await painters[cache]();
    caches[cache] = paintBank(...inputs[cache]);
  }
  return caches;
}
`);
addSynthetic('render/appearanceRegistry.ts', `
const prepared = new Map();
const caches = new Map();
export function registerPreparedAppearance(id, appearance) {
  prepared.delete(id); prepared.set(id, appearance);
  while (prepared.size > 2) prepared.delete(prepared.keys().next().value);
  return appearance;
}
export function preparedRiderLook(id) {
  const value = prepared.get(id);
  if (!value) throw new Error('Appearance not prepared: ' + id);
  return value.look;
}
export function preparedMachineLook(id) {
  for (const value of prepared.values()) if (value.machine.machine === id) return value.machine;
  throw new Error('Machine appearance not prepared: ' + id);
}
export function registerAppearanceCache(id, release, arrays, snapshot, install) { caches.set(id, {release, arrays, snapshot, install}); }
export function releaseAppearanceCaches() { for (const cache of caches.values()) cache.release(); }
export function appearanceCacheSnapshot() {
  return Object.fromEntries([...caches].filter(([, cache]) => cache.arrays().some(Boolean))
    .map(([id, cache]) => [id, cache.snapshot()]));
}
export function appearanceCacheTransferBuffers(snapshot) {
  const buffers = new Set();
  const visit = value => {
    if (ArrayBuffer.isView(value)) { buffers.add(value.buffer); return; }
    if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
  };
  visit(snapshot); return [...buffers];
}
export function installAppearanceCachePixels(snapshot) {
  // Validate the entire bank before releasing anything. Only already-imported selected modules can receive data.
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Invalid appearance pixel bank');
  for (const [id, bank] of Object.entries(snapshot)) {
    if (!caches.has(id) || !(bank?.pixels instanceof Uint8Array) || bank.pixels.byteLength === 0) {
      throw new Error('Invalid appearance pixel cache: ' + id);
    }
  }
  const bytes = appearanceCacheTransferBuffers(snapshot).reduce((n, b) => n + b.byteLength, 0);
  if (bytes > 16 * 1024 * 1024) throw new Error('Appearance pixel bank exceeds selected-rider budget');
  releaseAppearanceCaches();
  for (const [id, bank] of Object.entries(snapshot)) caches.get(id).install(bank);
}
export function appearanceResourceStats() {
  const buffers = new Set();
  for (const cache of caches.values()) for (const array of cache.arrays()) if (array) buffers.add(array.buffer);
  return { cachedPixelBuffers: buffers.size, cachedPixelBytes: [...buffers].reduce((n, b) => n + b.byteLength, 0),
    registeredCaches: caches.size, preparedIds: [...prepared.keys()] };
}
`);
const originalRider = fs.readFileSync(path.join(SRC_ROOT, 'src/render/riderLook.ts'), 'utf8');
const originalMachine = fs.readFileSync(path.join(SRC_ROOT, 'src/render/machineLook.ts'), 'utf8');
const loaderRows = [];
for (const [id, machineId, look, machine] of REVIEWED_ROSTER) {
  const riderRel = `render/riderAppearance-${id}.ts`, machineRel = `render/machineAppearance-${id}.ts`;
  addSynthetic(riderRel, sliceDeclarations(originalRider, [look]), ['render/riderLook.ts']);
  addSynthetic(machineRel, sliceDeclarations(originalMachine, [machine]), ['render/machineLook.ts']);
  loaderRows.push(`  '${id}': async () => {\n    const [r, m] = await Promise.all([import('./${path.posix.basename(riderRel)}'), import('./${path.posix.basename(machineRel)}')]);\n    return { look: r.${look}, machine: m.${machine} };\n  }`);
}
addSynthetic('render/appearanceImports.ts', `
const pixelCaches = Object.freeze(${JSON.stringify(PIXEL_CACHE_IDS)});
const loaders = Object.freeze({
${loaderRows.join(',\n')}
});
export function isAppearanceId(id) { return Object.hasOwn(loaders, id); }
export function appearancePixelCacheIds(id) { return pixelCaches[id] ?? []; }
export async function importAppearance(id) {
  if (!Object.hasOwn(loaders, id)) throw new Error('Unknown playable appearance: ' + String(id));
  return loaders[id]();
}
`);
addSynthetic('render/appearanceLoader.ts', `
import { importAppearance, isAppearanceId, appearancePixelCacheIds } from './appearanceImports.ts';
import { registerPreparedAppearance, installAppearanceCachePixels, releaseAppearanceCaches, appearanceResourceStats as cacheStats } from './appearanceRegistry.ts';
export { releaseAppearanceCaches } from './appearanceRegistry.ts';
let activeJob = null;
export function appearanceResourceStats() {
  return { ...cacheStats(), activePreparation: activeJob?.id ?? null, workerActive: !!activeJob?.worker };
}
function abortError() { return new DOMException('Appearance preparation cancelled', 'AbortError'); }
// One selected job/worker. Canonical module imports cannot be aborted, but late imports never install pixels or
// register a prepared identity. The host still owns rig construction, compile admission and GPU disposal.
export function prepareAppearance(id, { signal, prepaint = true } = {}) {
  if (!isAppearanceId(id)) return Promise.reject(new Error('Unknown playable appearance: ' + String(id)));
  if (signal?.aborted) return Promise.reject(abortError());
  activeJob?.cancel();
  releaseAppearanceCaches();
  return new Promise((resolve, reject) => {
    const job = { id, worker: null, done: false, cancel: () => finish(abortError()) };
    const finish = (error, appearance) => {
      if (job.done) return;
      job.done = true;
      signal?.removeEventListener('abort', job.cancel);
      if (job.worker) {
        job.worker.onmessage = job.worker.onerror = job.worker.onmessageerror = null;
        job.worker.terminate(); job.worker = null;
      }
      if (activeJob === job) activeJob = null;
      if (error) reject(error); else resolve(registerPreparedAppearance(id, appearance));
    };
    activeJob = job;
    signal?.addEventListener('abort', job.cancel, { once: true });
    importAppearance(id).then(appearance => {
      if (job.done) return;
      if (!prepaint || typeof Worker === 'undefined' || (!appearance.look.atlas && !appearance.machine.atlas)) {
        finish(null, appearance); return;
      }
      try {
        const worker = job.worker = new Worker(new URL('./appearanceWorker.js', import.meta.url),
          { type: 'module', name: 'euc-appearance-pixels' });
        worker.onmessage = event => {
          if (job.done || activeJob !== job) return;
          try {
            if (event.data?.id !== id) throw new Error('Appearance worker returned the wrong rider');
            if (event.data.error) throw new Error(event.data.error);
            if (JSON.stringify(Object.keys(event.data.caches ?? {}).sort()) !== JSON.stringify([...appearancePixelCacheIds(id)].sort())) {
              throw new Error('Appearance worker returned an incomplete pixel bank');
            }
            installAppearanceCachePixels(event.data.caches);
            finish(null, appearance);
          } catch (error) { finish(error); }
        };
        worker.onerror = event => { event.preventDefault?.(); finish(new Error(event.message || 'Appearance worker failed')); };
        worker.onmessageerror = () => finish(new Error('Appearance worker pixel transfer failed'));
        const inputs = Object.fromEntries([appearance.look.atlas, appearance.machine.atlas].filter(Boolean).map(atlas => {
          if (typeof atlas.paintInput !== 'function') throw new Error('Appearance is missing its painting input');
          const { cache, args } = atlas.paintInput(); return [cache, args];
        }));
        worker.postMessage({ id, inputs });
      } catch (error) { finish(error); }
    }, cause => {
      if (job.done) return;
      if (cause?.name === 'AbortError') { finish(cause); return; }
      // Native ESM caches failed module loads in this realm: same-dialog retry cannot fetch this graph again.
      const error = new Error('Rider appearance module could not load. Reload NYC to retry this download.', { cause });
      error.reloadRequired = true;
      finish(error);
    });
  });
}
`);
addSynthetic('render/appearanceWorker.ts', `
import { paintAppearancePixels } from './appearancePixelImports.ts';
import { appearanceCacheTransferBuffers } from './appearanceRegistry.ts';
let accepted = false;
globalThis.onmessage = async event => {
  if (accepted) return;
  accepted = true;
  const id = event.data?.id;
  try {
    const start = performance.now();
    // Original pixels and decoded logos only. Layouts came from the main realm's real selected build closures.
    const caches = await paintAppearancePixels(id, event.data.inputs);
    const transfer = appearanceCacheTransferBuffers(caches);
    globalThis.postMessage({ id, caches, paintMs: performance.now() - start,
      pixelBytes: transfer.reduce((n, buffer) => n + buffer.byteLength, 0) }, transfer);
  } catch (error) {
    globalThis.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
`);

const SCOPE = readScope(SRC_ROOT);

// --audit <dir>: reviewed generated bytes/audio plus private-path rejection. Public notices may name participants.
if (AUDIT_DIR) {
  const root = path.resolve(AUDIT_DIR);
  const found = [];
  let files = 0;
  // Third-party files kept byte for byte (vendor/MANIFEST.json, tools/vendor-three.mjs: three.js, the fonts) are
  // skipped while their hash matches: three.js's own variable names (mv, MV, RR...) are not names of people. A changed
  // copy is scanned like any other file.
  const pristine = new Set();
  const manifestPath = path.join(root, 'vendor', 'MANIFEST.json');
  if (fs.existsSync(manifestPath)) {
    for (const [file, hash] of Object.entries(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files ?? {})) {
      const full = path.join(root, file);
      if (fs.existsSync(full) && crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') === hash) {
        pristine.add(path.normalize(file));
      }
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
       for (const h of hitsIn(rel, SCOPE)) found.push(`path ${rel}: "${h.text}"`);
       if (entry.isSymbolicLink()) { found.push(`symlink not allowed: ${rel}`); continue; }
       if (/(^|\/)(?:references|private|\.env(?:\..*)?)(?:\/|$)/i.test(rel)) found.push(`private path: ${rel}`);
      if (entry.isDirectory()) { walk(full); continue; }
      if (/\.(wav|png|jpe?g|gif|webp|ico|woff2?|ttf|bin)$/i.test(entry.name)) continue;
      if (pristine.has(path.normalize(rel))) continue;
      files++;
      fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
         for (const h of hitsIn(line, SCOPE)) found.push(`${rel}:${i + 1}: "${h.text}"`);
      });
    }
  };
  walk(root);
  const generated = path.join(root, 'js/euc');
  if (fs.existsSync(generated)) {
    const expected = JSON.parse(fs.readFileSync(path.join(OUT, 'MANIFEST.json'), 'utf8'));
    const actual = JSON.parse(fs.readFileSync(path.join(generated, 'MANIFEST.json'), 'utf8'));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) found.push('generated manifest differs from reviewed local inventory');
    const inspect = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name), rel = path.relative(generated, full);
        if (entry.isDirectory()) { inspect(full); continue; }
        if (rel === 'LICENSE' || rel === 'MANIFEST.json') continue;
        const record = expected.files[rel];
        if (!record || crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== record.outputSha256) {
          found.push(`unreviewed or changed generated module: ${rel}`);
        }
      }
    };
    inspect(generated);
    for (const rel of Object.keys(expected.files)) if (!fs.existsSync(path.join(generated, rel))) found.push(`missing generated module: ${rel}`);
    found.push(...auditAudioInventory(root, expected.audio));
  }
  if (found.length) {
    console.error(`Tree audit FAILED (${found.length}) in ${root}:`);
    for (const f of found.slice(0, 60)) console.error(`  ${f}`);
    process.exit(1);
  }
   console.log(`tree audit clean: ${files} text files, ${SCOPE.reviewed.length} reviewed roster ids checked`
    + (pristine.size ? ` (${pristine.size} unchanged third-party files in vendor/MANIFEST.json skipped)` : ''));
  process.exit(0);
}

const commit = execFileSync('git', ['-C', SRC_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', SRC_ROOT, 'status', '--porcelain', '--', 'src', 'assets/live/audio', 'LICENSE', 'NOTICE.md'], { encoding: 'utf8' }).trim();
if (commit !== EXPECTED_COMMIT) throw new Error(`EUC Thrills must be pinned to ${EXPECTED_COMMIT}, got ${commit}`);
if (dirty) {
  console.error('EUC Thrills source/assets/notices have local changes; vendor only from a clean upstream checkout.');
  process.exit(1);
}
const donorCommit = execFileSync('git', ['-C', DONOR_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (donorCommit !== DONOR_COMMIT) throw new Error(`EUC Thrills donor must be pinned to ${DONOR_COMMIT}, got ${donorCommit}`);
if (execFileSync('git', ['-C', DONOR_ROOT, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('EUC Thrills donor has local changes; use a clean reviewed checkout.');
}
for (const rel of Object.keys(DONOR_HASHES)) donorSource(rel);

// Static import/export-from statements (esbuild prints them at the start of a line), bare imports and import().
const SPEC = /(?:^(?:import|export)\b[^;'"]*?\bfrom\s*|^import\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\1/gm;
const outputs = new Map(); // rel -> { js, sha }
const removedColourKeys = Object.keys(UNSHIPPED_COLOURS);
const queue = [...ENTRIES, ...WORKER_ENTRIES];
while (queue.length) {
  const rel = queue.shift();
  if (outputs.has(rel)) continue;
  if (!synthetic.has(rel) && !REVIEWED_MODULES.has(rel)) throw new Error(`Unreviewed source dependency: ${rel}`);
  const file = path.join(SRC_ROOT, 'src', rel);
  const donorOnly = rel === 'app/nearSolids.ts';
  const raw = synthetic.get(rel) ?? (donorOnly ? donorSource(rel) : fs.readFileSync(file, 'utf8'));
  let adapted = OVERRIDES[rel] ? OVERRIDES[rel](raw, removedColourKeys) : raw;
  if (/^render\/(?:.*Look\.ts|(?:rider|machine)Appearance-)/.test(rel)) adapted = addPaintInputMetadata(adapted);
  const source = adaptAppearanceCaches(rel, adapted);
  const { outputText: code, diagnostics } = ts.transpileModule(source, {
    fileName: `src/${rel}`,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
      removeComments: true,
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: false,
    },
  });
  if (diagnostics?.length) throw new Error(`${rel}: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ')}`);
  let js = code;
  for (const match of code.matchAll(SPEC)) {
    const spec = match[2];
    if (!spec.startsWith('.')) {
      if (spec !== 'three') throw new Error(`${rel}: unexpected external import ${spec}`);
      continue;
    }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!target.endsWith('.ts')) throw new Error(`${rel}: import without .ts extension: ${spec}`);
    queue.push(target);
  }
  js = js.replace(SPEC, (all, q, spec) => {
    // Import maps do not apply in module workers. All reviewed EUC rendering modules use core classes only;
    // the pinned three.webgpu.js imports/re-exports these same core objects, preserving main-realm identity.
    if (spec === 'three') return all.replace(spec, path.posix.relative(path.posix.dirname(`js/euc/${rel}`), 'vendor/three/build/three.core.js'));
    return spec.startsWith('.') ? all.replace(spec, spec.replace(/\.ts$/, '.js')) : all;
  });
  const originCommit = donorOnly ? donorCommit : commit;
  const header = `// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@${originCommit.slice(0, 7)} ${synthetic.has(rel) ? 'generated boundary' : `src/${rel}`}` +
    `${donorOrigins.has(rel) && !donorOnly ? ` + reviewed ${DONOR_COMMIT.slice(0, 7)} declarations (MANIFEST.json)` : ''}` +
    `${OVERRIDES[rel] ? ' (sliced for euc-newyork: see the tool)' : ''}.\n// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.\n`;
  const guidance = /(?:data\/riders|riderLook|machineLook|appearanceLoader|[rm].*Appearance-|pixels\/.*Atlas)/.test(rel) ? AGENT_GUIDANCE : '';
  const vectorNotice = rel === 'render/pixels/paintVector.ts'
    ? '// Vector arithmetic extracted unchanged from pinned Three Vector3. MIT, Copyright 2010-2026 Three.js Authors.\n// See vendor/three/LICENSE; full source hash and method inventory are in js/euc/MANIFEST.json.\n' : '';
  outputs.set(rel, { js: header + vectorNotice + guidance + js, sha: synthetic.has(rel) ? null : crypto.createHash('sha256').update(raw).digest('hex') });
}
for (const [, factory] of PIXEL_PAINTERS) {
  const expected = factory === 'createMaribelAtlas' ? 2 : 1;
  if (paintInputSites.get(factory) !== expected) throw new Error(`Reviewed appearance painting input sites changed: ${factory}`);
}

// Static-only reachability defines preloads. Dynamic imports are inventoried above, but never modulepreloaded.
const STATIC_SPEC = /^(?:import|export)\b[^;'"\n]*?\bfrom\s*['"]([^'"]+)['"]/gm;
function staticClosure(entries, includeDynamic = false) {
  const result = new Set();
  function visit(rel) {
    if (result.has(rel)) return;
    result.add(rel);
    const specs = includeDynamic ? [...outputs.get(rel).js.matchAll(SPEC)].map(m => m[2])
      : [...outputs.get(rel).js.matchAll(STATIC_SPEC)].map(m => m[1]);
    for (const spec of specs) {
      if (spec.startsWith('.')) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        if (target === '../../vendor/three/build/three.core.js') continue;
        visit(target.replace(/\.js$/, '.ts'));
      }
    }
  }
  entries.forEach(visit);
  return result;
}
const eager = staticClosure(ENTRIES);
const workerModules = [...staticClosure(WORKER_ENTRIES, true)];
for (const rel of workerModules) {
  const code = outputs.get(rel).js;
  if (/three\.core\.js|three\.webgpu\.js|\bTHREE\b|\bDataTexture\b/.test(code)) {
    throw new Error(`Worker pixel graph acquired a renderer/Three dependency: ${rel}`);
  }
  if (!['render/appearanceWorker.ts', 'render/appearancePixelImports.ts', 'render/appearanceRegistry.ts',
    'render/inkKit.ts', 'render/pngDecode.ts', 'shared/letterPaths.ts',
    'data/mvLogoAsset.ts', 'data/wimLogoAsset.ts', 'data/gnarwheelLogoAsset.ts'].includes(rel)
    && !rel.startsWith('render/pixels/')) throw new Error(`Unreviewed pixel worker dependency: ${rel}`);
}

// -- Content audit ---------------------------------------------------------------------------------------------------
const problems = [];
for (const [rel, { js }] of outputs) {
  for (const h of hitsIn(rel, SCOPE)) problems.push(`excluded module in closure: ${rel} ("${h.text}")`);
  js.split('\n').forEach((line, i) => {
    const hits = hitsIn(line, SCOPE);
    if (!hits.length) return;
    problems.push(`${rel}:${i + 1}: "${hits[0].text}" in: ${line.trim().slice(0, 140)}`);
  });
  for (const key of removedColourKeys) {
    if (new RegExp(`\\b${key}\\b`).test(js)) problems.push(`${rel}: still references removed colour ${key}`);
  }
}
if (problems.length) {
  console.error(`Content audit FAILED (${problems.length}):`);
  for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
  process.exit(1);
}

// -- Write -----------------------------------------------------------------------------------------------------------
const manifest = {
  upstream: 'https://github.com/VibezZzCoder/EUC-thrills',
  commit,
  sources: { base: { commit }, donor: { commit: donorCommit, files: Object.keys(DONOR_HASHES).map(rel => ({
    source: `src/${rel}`, sourceSha256: DONOR_HASHES[rel], selection: donorOrigins.get(rel)?.selection,
  })) } },
  generatedBy: 'tools/vendor-euc.mjs',
  entries: ENTRIES,
  workers: { entries: WORKER_ENTRIES.map(p => p.replace(/\.ts$/, '.js')),
    sharedThree: null,
    vectorSource: { source: PAINT_VECTOR_SOURCE, sourceSha256: PAINT_VECTOR_SHA256, methods: PAINT_VECTOR_METHODS },
    pixelCaches: PIXEL_CACHE_IDS,
    appearances: Object.fromEntries(REVIEWED_ROSTER.map(([id]) => [id,
      [...staticClosure([...WORKER_ENTRIES, ...PIXEL_CACHE_IDS[id].map(cache => `render/pixels/${cache}`)])]
        .map(p => p.replace(/\.ts$/, '.js')).sort()])),
    modules: workerModules.map(p => p.replace(/\.ts$/, '.js')).sort() },
  // Explicit exclusive cosmetic fields, checked for remaining runtime references before any output is written.
  removedColourEntries: removedColourKeys.length,
  removedColourKeys,
  roster: REVIEWED_ROSTER.map(([id, machine, lookExport, machineExport, crash]) => ({ id, machine, lookExport, machineExport,
    crash, stumble: id === 'drunkard' ? 'stumble_drunkard.wav' : null, style: id === 'drunkard' ? 'DRUNK_STYLE' : 'SOBER_STYLE' })),
  eager: [...eager].map(p => p.replace(/\.ts$/, '.js')).sort(),
  deferred: [...outputs.keys()].filter(p => !eager.has(p)).map(p => p.replace(/\.ts$/, '.js')).sort(),
  appearances: Object.fromEntries(REVIEWED_ROSTER.map(([id]) => [id,
    [...staticClosure([`render/riderAppearance-${id}.ts`, `render/machineAppearance-${id}.ts`])]
      .map(p => p.replace(/\.ts$/, '.js')).sort()])),
  audio: [...new Set([...REVIEWED_ROSTER.map(row => row[4]), 'stumble_drunkard.wav', 'tyre_offroad_loop.wav',
    'tyre_solid_loop.wav', 'wind_howl_loop.wav', 'siren_far_loop.wav', 'siren_close_loop.wav', 'overspeed_beep.wav'])].map(name => {
      const source = `assets/live/audio/${name}`;
      const bytes = fs.readFileSync(path.join(SRC_ROOT, source));
       return { source, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
          shipped: !Object.hasOwn(UNSHIPPED_AUDIO, name),
          ...(Object.hasOwn(UNSHIPPED_AUDIO, name) ? { unshippedReason: UNSHIPPED_AUDIO[name] } : {}) };
     }),
  provenance: ['LICENSE', 'NOTICE.md', 'src/audio/samples.ts'].map(source => ({ source,
    sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(SRC_ROOT, source))).digest('hex') })),
  files: Object.fromEntries([...outputs].sort(([a], [b]) => a.localeCompare(b)).map(([rel, o]) => [rel.replace(/\.ts$/, '.js'), {
    source: o.sha ? `src/${rel}` : null, sourceSha256: o.sha,
    ...(o.sha ? { sourceCommit: rel === 'app/nearSolids.ts' ? donorCommit : commit } : {}),
    ...(donorOrigins.has(rel) ? { donor: donorOrigins.get(rel) } : {}),
    ...(synthetic.has(rel) ? { derivedFrom: [...syntheticOrigins.get(rel).map(origin => ({ source: `src/${origin}`,
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(SRC_ROOT, 'src', origin))).digest('hex') })),
      ...(syntheticLocalOrigins.get(rel) ?? [])] } : {}),
    outputSha256: crypto.createHash('sha256').update(o.js).digest('hex'),
    sliced: !!OVERRIDES[rel],
  }])),
};
manifest.shippedAudio = manifest.audio.filter(item => item.shipped).map(item => item.source);
manifest.counts = { modules: outputs.size, eager: eager.size, deferred: outputs.size - eager.size,
  reviewedAudio: manifest.audio.length, shippedAudio: manifest.shippedAudio.length };
const audioProblems = auditAudioInventory(ROOT, manifest.audio);
if (audioProblems.length) throw new Error(`EUC audio inventory failed:\n${audioProblems.join('\n')}`);
if (CHECK_ONLY) {
  let stale = 0;
  for (const [rel, { js }] of outputs) {
    const target = path.join(OUT, rel.replace(/\.ts$/, '.js'));
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== js) { console.error(`stale: ${rel}`); stale++; }
  }
  const expectedFiles = [...outputs.keys()].map(p => p.replace(/\.ts$/, '.js')).concat('LICENSE', 'MANIFEST.json').sort();
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? walk(path.join(dir, e.name)) : [path.relative(OUT, path.join(dir, e.name))]);
  if (JSON.stringify(walk(OUT).sort()) !== JSON.stringify(expectedFiles)) { console.error('stale: unexpected/missing generated files'); stale++; }
  if (fs.readFileSync(path.join(OUT, 'MANIFEST.json'), 'utf8') !== `${JSON.stringify(manifest, null, 2)}\n`) { console.error('stale: MANIFEST.json'); stale++; }
  if (fs.readFileSync(path.join(OUT, 'LICENSE'), 'utf8') !== fs.readFileSync(path.join(SRC_ROOT, 'LICENSE'), 'utf8')) { console.error('stale: LICENSE'); stale++; }
  if (SYNC_PRELOADS) {
    const block = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<!-- euc:preload:start \(tools\/vendor-euc\.mjs\) -->([^]*?)<!-- euc:preload:end -->/)?.[1];
    const preloads = [...(block ?? '').matchAll(/href="\.\/js\/euc\/([^"]+)"/g)].map(m => m[1]);
    if (JSON.stringify(preloads) !== JSON.stringify(manifest.eager)) { console.error('stale: eager preloads'); stale++; }
  } else console.log('Host preload synchronization delegated (--no-preloads); expected block is MANIFEST.json eager.');
  console.log(stale ? `${stale} stale file(s)` : `js/euc is up to date (${outputs.size} files, audit clean)`);
  process.exit(stale ? 1 : 0);
}
fs.rmSync(OUT, { recursive: true, force: true });
for (const [rel, { js }] of outputs) {
  const target = path.join(OUT, rel.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, js);
}
fs.copyFileSync(path.join(SRC_ROOT, 'LICENSE'), path.join(OUT, 'LICENSE'));
// Preload shared static essentials only; player appearances stay behind the fixed selected-ID import table.
if (SYNC_PRELOADS) {
  const INDEX = path.join(ROOT, 'index.html');
  const START = '<!-- euc:preload:start (tools/vendor-euc.mjs) -->', END = '<!-- euc:preload:end -->';
  const html = fs.readFileSync(INDEX, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('index.html: euc preload markers not found');
  const lines = manifest.eager.map((rel) => `  <link rel="modulepreload" href="./js/euc/${rel}" />`);
  fs.writeFileSync(INDEX, `${html.slice(0, a + START.length)}\n${lines.join('\n')}\n  ${html.slice(b)}`);
} else console.log('Host preload synchronization delegated (--no-preloads); expected block is MANIFEST.json eager.');
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const bytes = [...outputs.values()].reduce((n, o) => n + Buffer.byteLength(o.js), 0);
console.log(`wrote ${outputs.size} modules (${Math.round(bytes / 1024)} KiB) to js/euc from EUC-thrills@${commit.slice(0, 7)} + reviewed donor@${donorCommit.slice(0, 7)}; ` +
  `${eager.size} eager, ${outputs.size - eager.size} deferred; reviewed roster/content audit clean`);
