// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/rigConsolidation.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
const DEFAULT_ON_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const DEFAULT_ON_AFTER_RENDER = THREE.Object3D.prototype.onAfterRender;
function isIdentity(object) {
    const { position: p, quaternion: q, scale: s } = object;
    return p.x === 0 && p.y === 0 && p.z === 0
        && q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1
        && s.x === 1 && s.y === 1 && s.z === 1;
}
function isPureTranslation(object) {
    const { quaternion: q, scale: s } = object;
    return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1
        && s.x === 1 && s.y === 1 && s.z === 1;
}
function attributeSignature(geometry) {
    const parts = [];
    for (const name of Object.keys(geometry.attributes).sort()) {
        const attribute = geometry.attributes[name];
        if (attribute.isInterleavedBufferAttribute === true)
            return null;
        const plain = attribute;
        if (plain.usage !== THREE.StaticDrawUsage)
            return null;
        parts.push(`${name}:${plain.itemSize}:${plain.normalized}:${plain.array.constructor.name}`);
    }
    return parts.join('|');
}
function eligible(mesh) {
    const material = mesh.material;
    const geometry = mesh.geometry;
    return mesh.isMesh === true
        && mesh.isInstancedMesh !== true
        && mesh.isSkinnedMesh !== true
        && !Array.isArray(material)
        && material.transparent === false
        && mesh.visible
        && mesh.children.length === 0
        && Object.keys(mesh.userData).length === 0
        && mesh.onBeforeRender === DEFAULT_ON_BEFORE_RENDER
        && mesh.onAfterRender === DEFAULT_ON_AFTER_RENDER
        && geometry.groups.length === 0
        && Object.keys(geometry.morphAttributes).length === 0
        && geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity
        && geometry.index !== null
        && attributeSignature(geometry) !== null;
}
function flagKey(mesh, withCast) {
    return [
        mesh.material.uuid,
        withCast ? mesh.castShadow : '*',
        mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled, mesh.layers.mask,
        attributeSignature(mesh.geometry),
    ].join('#');
}
function triangleCount(geometry) {
    return (geometry.index !== null ? geometry.index.count : geometry.attributes.position.count) / 3;
}
function concatenate(members, offsets) {
    const first = members[0].geometry;
    const merged = new THREE.BufferGeometry();
    let vertices = 0;
    for (const member of members)
        vertices += member.geometry.attributes.position.count;
    for (const name of Object.keys(first.attributes)) {
        const template = first.attributes[name];
        const ArrayType = template.array.constructor;
        const array = new ArrayType(vertices * template.itemSize);
        let at = 0;
        for (let index = 0; index < members.length; index += 1) {
            const source = members[index].geometry.attributes[name];
            const offset = offsets[index];
            if (name === 'position' && offset !== null) {
                const from = source.array;
                for (let i = 0; i < source.count; i += 1) {
                    array[at + i * 3] = Math.fround(from[i * 3] + offset.x);
                    array[at + i * 3 + 1] = Math.fround(from[i * 3 + 1] + offset.y);
                    array[at + i * 3 + 2] = Math.fround(from[i * 3 + 2] + offset.z);
                }
            }
            else {
                array.set(source.array.subarray(0, source.count * template.itemSize), at);
            }
            at += source.count * template.itemSize;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, template.itemSize, template.normalized));
    }
    let indices = 0;
    for (const member of members)
        indices += member.geometry.index.count;
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let at = 0;
    let base = 0;
    for (const member of members) {
        const source = member.geometry.index;
        for (let i = 0; i < source.count; i += 1)
            index[at + i] = source.getX(i) + base;
        at += source.count;
        base += member.geometry.attributes.position.count;
    }
    merged.setIndex(new THREE.BufferAttribute(index, 1));
    return merged;
}
export function consolidateRig(root, options = {}) {
    const absorbed = new Map();
    const owned = [];
    let savedColourCalls = 0;
    let savedShadowCalls = 0;
    let addedShadowTriangles = 0;
    const commit = (members, offsets) => {
        const keep = members.find((mesh) => mesh.castShadow) ?? members[0];
        const casters = members.filter((mesh) => mesh.castShadow).length;
        const merged = concatenate(members, offsets);
        owned.push(merged);
        if (casters > 0) {
            for (const mesh of members)
                if (!mesh.castShadow)
                    addedShadowTriangles += triangleCount(mesh.geometry);
        }
        keep.geometry = merged;
        if (offsets[members.indexOf(keep)] !== null) {
            keep.position.set(0, 0, 0);
            keep.updateMatrix();
        }
        const others = members.filter((mesh) => mesh !== keep);
        for (const other of others)
            other.removeFromParent();
        absorbed.set(keep, others);
        savedColourCalls += others.length;
        savedShadowCalls += Math.max(0, casters - 1);
    };
    const claimed = new Set();
    for (const names of options.bake ?? []) {
        const found = names.map((name) => root.getObjectByName(name));
        if (found.some((mesh) => mesh === undefined))
            continue;
        const meshes = found;
        const parent = meshes[0].parent;
        const key = flagKey(meshes[0], true);
        for (const mesh of meshes) {
            if (mesh.parent !== parent || !eligible(mesh) || !isPureTranslation(mesh) || flagKey(mesh, true) !== key) {
                throw new Error(`consolidateRig: ${names.join(' + ')} is no longer a bakeable static set (${mesh.name})`);
            }
        }
        const ordered = [...meshes].sort((a, b) => a.id - b.id);
        commit(ordered, ordered.map((mesh) => mesh.position.clone()));
        for (const mesh of ordered)
            claimed.add(mesh);
    }
    const parents = [];
    root.traverse((node) => { parents.push(node); });
    const withCast = options.castUnion !== true;
    for (const parent of parents) {
        const groups = new Map();
        for (const child of parent.children) {
            const mesh = child;
            if (mesh.isMesh !== true || claimed.has(mesh) || !eligible(mesh) || !isIdentity(mesh))
                continue;
            const key = flagKey(mesh, withCast);
            const list = groups.get(key);
            if (list === undefined)
                groups.set(key, [mesh]);
            else
                list.push(mesh);
        }
        for (const list of groups.values()) {
            if (list.length < 2)
                continue;
            list.sort((a, b) => a.id - b.id);
            commit(list, list.map(() => null));
        }
    }
    return {
        absorbed,
        savedColourCalls,
        savedShadowCalls,
        addedShadowTriangles,
        dispose() {
            for (const geometry of owned)
                geometry.dispose();
            owned.length = 0;
        },
    };
}
