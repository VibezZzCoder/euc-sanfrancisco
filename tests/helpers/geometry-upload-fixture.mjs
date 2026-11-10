// Actual vendored e27dfa9 attribute/geometry owners and GL/GPU upload code, with CPU-only native API ledgers.
// No renderer/device/context is created. Bounds and BufferAttributes are real Three CPU objects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../vendor/three/build/three.core.js';

const source = readFileSync(new URL('../../vendor/three/build/three.webgpu.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `pinned renderer section ${start}`); return source.slice(a, b);
};
const { DataMap, Attributes, Geometries, Info } = new Function('DynamicDrawUsage', 'Uint16BufferAttribute', 'Uint32BufferAttribute',
  section('class DataMap {', '/**\n * Abstract class for representing pipelines.') + '\nreturn {DataMap,Attributes,Geometries,Info};')(
  THREE.DynamicDrawUsage, THREE.Uint16BufferAttribute, THREE.Uint32BufferAttribute);
const GLUtils = new Function('IntType', 'DualAttributeData', 'let _id$1=0;\n' +
  section('class WebGLAttributeUtils {', '/**\n * A WebGL 2 backend utility module for managing vertex array objects') + '\nreturn WebGLAttributeUtils;')(THREE.IntType, class {});
const GPUInputStepMode = { Instance: 'instance', Vertex: 'vertex' };
const GPUBufferUsage = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, STORAGE: 128, INDIRECT: 256 };
const GPUUtils = new Function('GPUBufferUsage', 'GPUInputStepMode', '_bufferDescriptor$3', 'Float16BufferAttribute', 'error', 'isTypedArray',
  section('const typedArraysToVertexFormatPrefix =', 'const _bindGroupDescriptor =') + '\nreturn WebGPUAttributeUtils;')(
  GPUBufferUsage, GPUInputStepMode, { reset() { delete this.label; delete this.size; delete this.usage; delete this.mappedAtCreation; } },
  THREE.Float16BufferAttribute, message => { throw Error(message); }, ArrayBuffer.isView);
const raw = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

export function uploadFixture(kind) {
  const backend = new DataMap(), calls = [], buffers = new Set(); let bound, failNext = false;
  backend.set = (key, value) => backend.data.set(key, value);
  backend.getBufferAttribute = a => a.isInterleavedBufferAttribute ? a.data : a;
  backend.deleteVertexState = () => {};
  const create = (size, usage, data) => {
    if (failNext) { failNext = false; throw Error('controlled upload failure'); }
    assert.ok(size > 0, 'never create/upload an empty GPU buffer');
    const buffer = { size, usage, bytes: Buffer.alloc(size), destroyed: false,
      destroy() { this.destroyed = true; buffers.delete(this); calls.push({ op: 'delete', size }); } };
    if (data) raw(data).copy(buffer.bytes);
    buffers.add(buffer); calls.push({ op: 'create', size, usage }); return buffer;
  };
  if (kind === 'webgl2') {
    backend.isWebGLBackend = true;
    backend.state = { currentVAO: null };
    backend.gl = {
      ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, COPY_WRITE_BUFFER: 36663, STATIC_DRAW: 35044,
      FLOAT: 5126, HALF_FLOAT: 5131, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, INT: 5124,
      createBuffer() { return {}; }, bindBuffer(type, buffer) { bound = buffer; },
      bufferData(type, array, usage) {
        const b = create(array.byteLength, usage, array); Object.assign(bound, b); buffers.delete(b); buffers.add(bound);
      },
      bufferSubData(type, offset, array, start = 0, count = array.length) {
        assert.ok(array.byteLength > 0, 'never update from an empty CPU array');
        raw(array.subarray(start, start + count)).copy(bound.bytes, offset); calls.push({ op: 'update', size: count * array.BYTES_PER_ELEMENT });
      },
      deleteBuffer(buffer) { buffer.destroy(); }
    };
    const utils = new GLUtils(backend); backend.attributeUtils = utils;
    backend.createAttribute = a => utils.createAttribute(a, backend.gl.ARRAY_BUFFER);
    backend.createIndexAttribute = a => utils.createAttribute(a, backend.gl.ELEMENT_ARRAY_BUFFER);
  } else {
    backend.isWebGPUBackend = true;
    backend.device = {
      createBuffer(descriptor) {
        const b = create(descriptor.size, descriptor.usage);
        // Keep the exact mapped allocation written by the vendored createAttribute.
        const mapped = new ArrayBuffer(descriptor.size); b.getMappedRange = () => mapped;
        b.unmap = () => { Buffer.from(mapped).copy(b.bytes); }; return b;
      }, queue: { writeBuffer(buffer, offset, array, start = 0, count = array.length) {
        assert.ok(array.byteLength > 0, 'never update from an empty CPU array');
        raw(array.subarray(start, start + count)).copy(buffer.bytes, offset); calls.push({ op: 'update', size: count * array.BYTES_PER_ELEMENT });
      } }
    };
    const utils = new GPUUtils(backend); backend.attributeUtils = utils;
    backend.createAttribute = a => utils.createAttribute(a, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    backend.createIndexAttribute = a => utils.createAttribute(a, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  }
  backend.updateAttribute = a => backend.attributeUtils.updateAttribute(a);
  backend.destroyAttribute = a => backend.attributeUtils.destroyAttribute(a);
  const info = new Info(), attributes = new Attributes(backend, info), geometries = new Geometries(backend, attributes, info);
  const renderer = { backend, info, _attributes: attributes, _geometries: geometries };
  const object = (mesh, names = Object.keys(mesh.geometry.attributes), bindings = []) => ({ object: mesh, geometry: mesh.geometry,
    material: mesh.material, getAttributes: () => names.map(n => mesh.geometry.attributes[n]), getBindings: () => bindings });
  return { renderer, backend, calls, buffers, object,
    fail() { failNext = true; },
    submit(mesh, names, bindings) { info.render.calls++; const o = object(mesh, names, bindings); geometries.updateForRender(o); return o; },
    buffer(a) { const d = backend.get(a); return kind === 'webgl2' ? d.bufferGPU : d.buffer; },
    stop() { geometries.dispose(); attributes.dispose(); }
  };
}
