// SF actor -> ambient source -> native synthetic voice contracts. No browser, decoder, rider bank or renderer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { CityAudioSources } from '../js/audio-sources.js';
import { CityAudioSystem } from '../js/audio-system.js';
import { createSynthResources, createMotorVoice } from '../js/audio-synthesis.js';
import { createEventResources } from '../js/audio-events.js';

const { loadTraffic } = createRequire(import.meta.url)('./helpers/traffic-harness.cjs');
const expected = { taxi: 'sedan', sedan: 'sedan', suv: 'suv', van: 'suv' };
const recognized = new Set(['sedan', 'suv', 'bus', 'siren']);
let NYC, traffic, highway, previousWindow;

test.before(() => {
  previousWindow = globalThis.window;
  ({ NYC, system: traffic } = loadTraffic({ seed: 9127 }));
  traffic.update(0.05, 0.05, { x: -330, y: 0, z: -560 });
  // Real highway construction/locate/update with drawing stubs. Sloped lane vertices need only distanceTo().
  const point = (x, y, z) => ({ x, y, z, distanceTo(p) { return Math.hypot(x - p.x, y - p.y, z - p.z); } });
  highway = NYC.createHighwayTraffic({ add() {} }, [{ pts: [point(5000, -4, 0), point(5000, 96, 1000)], speed: 9 }]);
  highway.update(0.05, null, null, 'euc');
  globalThis.window = { NYC };
});
test.after(() => { globalThis.window = previousWindow; });

function collectOne(actor, category) {
  const sources = new CityAudioSources(category === 'highway'
    ? { highwayTraffic: { cars: [actor] } }
    : { trafficSystem: { [category]: [actor] } });
  const snapshot = sources.collect({ x: actor.x, y: actor.y + 1, z: actor.z }, 1);
  assert.equal(snapshot.motors.length, 1, `${category}: logical actor should be audible`);
  const motor = snapshot.motors[0];
  assert.equal(motor.id, actor, 'voice identity is the original logical object');
  assert.equal(motor.y, actor.y + 0.7, 'source follows actual SF road elevation');
  for (const value of [...snapshot.motors, ...snapshot.sirens]) {
    assert.ok(recognized.has(value.kind));
    for (const field of ['x', 'y', 'z', 'speed', 'load', 'heading', 'seed', 'gain', 'range']) {
      assert.ok(Number.isFinite(value[field]), `${category}.${field} is not finite`);
    }
    assert.ok(value.speed >= 0 && value.load >= 0 && value.load <= 1 && value.range > 0);
  }
  return snapshot;
}

test('actual SF street/bus shapes without NYC engine metadata yield explicit recognized motor kinds', () => {
  const cars = traffic.cars.filter(car => car.edge);
  assert.ok(cars.length > 0);
  assert.deepEqual(new Set(traffic.cars.map(car => car.bodyType)), new Set(['taxi', 'sedan', 'suv', 'van']));
  for (const car of cars) {
    assert.equal(Object.hasOwn(car, 'engine'), false);
    const snapshot = collectOne(car, 'cars');
    assert.equal(snapshot.motors[0].kind, expected[car.bodyType]);
    assert.equal(snapshot.sirens.length, car.isNYPD ? 1 : 0);
    if (car.isNYPD) assert.equal(snapshot.sirens[0].kind, 'siren');
  }
  const buses = traffic.buses.filter(bus => bus.edge);
  assert.ok(buses.length > 0);
  for (const bus of buses) {
    assert.equal(bus.bus, true); assert.equal(bus.bodyType, undefined); assert.equal(bus.engine, undefined);
    assert.equal(collectOne(bus, 'buses').motors[0].kind, 'bus');
  }
});

test('actual SF highway kinds/IDs remain audible without a placed flag, including below-zero road poses', () => {
  assert.deepEqual(new Set(highway.cars.map(car => car.kind)), new Set(['taxi', 'sedan', 'suv']));
  assert.ok(highway.cars.some(car => car.y < 0), 'fixture includes a real negative-Y lane pose');
  for (const car of highway.cars) {
    assert.equal(Object.hasOwn(car, 'placed'), false);
    assert.equal(Object.hasOwn(car, 'engine'), false);
    assert.equal(collectOne(car, 'highway').motors[0].kind, expected[car.kind]);
  }
});

test('incomplete optional actor fields stay finite; invalid/unlocated/unknown/disabled ambient actors are excluded', () => {
  const car = { ...traffic.cars.find(car => car.edge), bodyType: 'van', acc: NaN, yawOffset: undefined, driver: undefined };
  assert.equal(collectOne(car, 'cars').motors[0].kind, 'suv');
  const ped = { placed: true, x: car.x, z: car.z, v: NaN, dynamicBody: { minY: car.y },
    rig: { seed: NaN, phase: Infinity, feet: [{ px: NaN, py: car.y, pz: car.z }, { px: car.x, py: Infinity, pz: car.z }] } };
  const collector = new CityAudioSources({ trafficSystem: { peds: [ped] }, highwayTraffic: { cars: [
    { kind: 'sedan' }, { ...highway.cars[0], kind: 'unsupported' }, { ...highway.cars[0], audioHidden: true },
    { ...highway.cars[0], placed: false }, { ...highway.cars[0], y: NaN }
  ] } });
  const snapshot = collector.collect({ x: car.x, y: car.y + 1, z: car.z }, 1);
  assert.equal(snapshot.motors.length, 0);
  assert.equal(snapshot.people.length, 1);
  for (const field of ['x', 'y', 'z', 'speed', 'seed', 'phase', 'bumped', 'leftX', 'leftY', 'leftZ', 'rightX', 'rightY', 'rightZ']) {
    assert.ok(Number.isFinite(snapshot.people[0][field]), `person.${field} is not finite`);
  }
  const streetCollector = new CityAudioSources({ trafficSystem: { cars: [{ ...car, disabled: true }, { ...car, bodyType: 'unsupported' }] } });
  assert.equal(streetCollector.collect({ x: car.x, y: car.y, z: car.z }, 1).motors.length, 0);
});

test('horn eligibility follows actual multigroup SF approaches and reuses bounded source storage', () => {
  const car = { ...traffic.cars.find(car => car.edge), speed: 0, wait: 5, gap: 2, leaderSpeed: 0,
    conn: null, yielding: false, disabled: false, isNYPD: false };
  const collector = new CityAudioSources({ trafficSystem: { cars: [car] } });
  const listener = { x: car.x, y: car.y + 1, z: car.z };
  const snapshot = collector.snapshot, items = snapshot.motors;
  const pool = collector.motors.pool, scores = collector.motors.scores, backing = scores.buffer;
  const record = collector.collect(listener, 0).motors[0];
  for (const nodeId of [74, 15]) {
    const node = traffic.network.nodes.find(n => n.id === nodeId);
    assert.ok(node?.signal && node.groupCount === 4);
    for (const edge of node.in) {
      car.edge = edge;
      for (const cycle of [-1, 0, 1]) for (let slot = 0; slot < node.groupCount; slot++)
        for (const inside of [0.001, 7, 25.999, 26.001, 29.999]) {
          const elapsed = (cycle * node.groupCount + slot) * 30 + inside - node.signalOffset;
          const result = collector.collect(listener, elapsed);
          assert.equal(result.motors[0].blocked, slot === edge.axisIndex && inside < 26,
            `node ${nodeId}, group ${edge.axisIndex}, slot ${slot}, time ${inside}`);
          assert.equal(result, snapshot); assert.equal(result.motors, items); assert.equal(items[0], record);
          assert.equal(collector.motors.pool, pool); assert.equal(collector.motors.scores, scores);
          assert.equal(scores.buffer, backing); assert.equal(pool.length, 10); assert.equal(scores.byteLength, 80);
        }
    }
  }
  car.edge = traffic.network.edges.find(e => e.id === 2562); // King St, node74/group2
  assert.equal(collector.collect(listener, 35 - car.edge.to.signalOffset).motors[0].blocked, false,
    'the old binary phase incorrectly allowed horns during another group’s green');
  assert.equal(collector.collect(listener, 65 - car.edge.to.signalOffset).motors[0].blocked, true,
    'own new green allows the original congestion/horn logic');
  // A green alone still cannot admit horns for an actor moving, yielding, crossing or without a blocked leader.
  for (const [key,value] of [['wait',2],['speed',0.5],['gap',8],['leaderSpeed',0.5],['yielding',true],['conn',{}]]) {
    const saved = car[key]; car[key] = value;
    assert.equal(collector.collect(listener, 65 - car.edge.to.signalOffset).motors[0].blocked, false, key);
    car[key] = saved;
  }
});

test('ordinary two-group and nonsignal horn eligibility preserve the legacy audio contract', () => {
  const car = { ...traffic.cars.find(car => car.edge), speed:0,wait:5,gap:2,leaderSpeed:0,
    conn:null,yielding:false,disabled:false,isNYPD:false };
  const collector = new CityAudioSources({trafficSystem:{cars:[car]}});
  const listener = {x:car.x,y:car.y+1,z:car.z};
  for (const group of [0,1]) {
    car.edge = traffic.network.edges.find(e => e.to.signal && e.to.groupCount === 2 && e.axisIndex === group);
    assert.ok(car.edge);
    for (const elapsed of [-120,-60,-30,-0.001,0,7,26,30,37,56,60,120]) {
      const local = elapsed + car.edge.to.signalOffset;
      assert.equal(collector.collect(listener, elapsed).motors[0].blocked, NYC.signalPhase(local,group===0)==='green');
    }
  }
  car.edge = traffic.network.edges.find(e => !e.to.signal);
  assert.ok(car.edge);
  for (const elapsed of [-1,0,35,65,95,NaN]) assert.equal(collector.collect(listener,elapsed).motors[0].blocked,true);
});

test('optional legacy signal beeps retain boolean WALK windows and reuse their pooled records', () => {
  // SF publishes no audioSignals sites. Preserve the optional legacy input schema;
  // isAvenue describes walking ALONG a road, unlike signalGroupWalk’s crossed-road group.
  const sites = [{x:0,y:1,z:0,isAvenue:true,signalOffset:13.25},
    {x:1,y:1,z:0,isAvenue:false,signalOffset:13.25}];
  const collector = new CityAudioSources({streetDetails:{audioSignals:sites}});
  const listener = {x:0,y:1,z:0}, pool=collector.signals.pool, scores=collector.signals.scores;
  for (const cycle of [-2,0,2]) for (const boundary of [0,7,26,30,37,56,60])
    for (const epsilon of [-0.001,0,0.001]) {
      const local=cycle*60+boundary+epsilon;
      const result=collector.collect(listener,local-13.25);
      assert.equal(result.signals.length,2);
      for (let i=0;i<2;i++) {
        const t=(((local-(i===0?0:30))%60)+60)%60;
        assert.equal(result.signals[i].walk,t<7);
        assert.equal(result.signals[i].id,sites[i]); assert.equal(result.signals[i],pool[i]);
      }
      assert.equal(collector.signals.pool,pool); assert.equal(collector.signals.scores,scores);
      assert.equal(pool.length,2); assert.equal(scores.byteLength,16);
    }
  assert.equal(new CityAudioSources({streetDetails:{}}).collect(listener,35).signals.length,0);
});

function fakeAudio() {
  const nodes = [], writes = [];
  const number = (value, label) => assert.ok(Number.isFinite(value), `${label}: ${String(value)}`);
  const param = name => {
    let value = 0;
    return { automationRate: 'a-rate', get value() { return value; }, set value(next) { number(next, name); value = next; },
      cancelScheduledValues(now) { number(now, `${name}.cancel time`); },
      setValueAtTime(next, now) { number(next, name); number(now, 'time'); value = next; writes.push([name, next]); },
      setTargetAtTime(next, now, time) { number(next, name); number(now, 'time'); number(time, 'time constant'); value = next; writes.push([name, next]); } };
  };
  const node = type => {
    const result = { disconnected: false, connect(target) { return target; }, disconnect() { this.disconnected = true; },
      setPeriodicWave() {}, start(...values) { values.forEach(value => number(value, `${type}.start`)); },
      stop(...values) { values.forEach(value => number(value, `${type}.stop`)); this.stopTime = values[0]; } };
    for (const name of ['gain', 'frequency', 'detune', 'Q', 'playbackRate', 'positionX', 'positionY', 'positionZ',
      'orientationX', 'orientationY', 'orientationZ']) result[name] = param(`${type}.${name}`);
    nodes.push(result); return result;
  };
  const context = { currentTime: 1, sampleRate: 8000, state: 'running', createPeriodicWave: () => ({}),
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / rate, getChannelData: channel => data[channel] };
    },
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createPanner: () => node('panner'),
    createBufferSource: () => node('buffer'), createOscillator: () => node('oscillator') };
  return { context, nodes, writes };
}

test('real collected SF ambient kinds run native synth/pool/event scheduling with finite params and existing teardown', () => {
  const { context, nodes, writes } = fakeAudio();
  const resources = createSynthResources(context), sample = context.createBuffer(1, 800, context.sampleRate);
  Object.assign(resources, { footsteps: [sample], horns: [sample], crashes: { body: [sample], metal: [sample], debris: [sample] } });
  const audio = Object.assign(Object.create(CityAudioSystem.prototype), {
    context, resources, mix: {}, reflections: {}, acoustics: { obstruction: () => 0 },
    listener: { x: 0, y: 0, z: 0 }, motors: new Map(), sirens: new Map(), events: [], states: new WeakMap(),
    motorParams: {}, limits: { events: 8 }
  });
  const actors = [
    ...['taxi', 'sedan', 'suv', 'van'].map(kind => traffic.cars.find(car => car.edge && car.bodyType === kind)),
    traffic.buses.find(bus => bus.edge), traffic.cars.find(car => car.edge && car.isNYPD), highway.cars[0]
  ];
  assert.ok(actors.every(Boolean), 'all actual ambient classes are represented');
  for (const actor of actors) {
    const snapshot = collectOne(actor, actor.lane?.pts ? 'highway' : actor.bus ? 'buses' : 'cars');
    Object.assign(audio.listener, { x: actor.x, y: actor.y + 1, z: actor.z });
    for (const dt of [0.1, 0, NaN]) {
      audio.updatePool(audio.motors, snapshot.motors, 8, context.currentTime, dt);
      audio.updatePool(audio.sirens, snapshot.sirens, 2, context.currentTime, dt, true);
      assert.ok(Number.isFinite(audio.motorParams.doppler));
    }
    const state = audio.state({ ...snapshot.motors[0], seed: NaN }, context.currentTime);
    assert.ok(Number.isFinite(state.horn)); assert.ok(Number.isFinite(state.signal));
    assert.equal(audio.emit('horn', { ...snapshot.motors[0], gain: NaN }), true);
    assert.equal(audio.emit('footstep', { x: actor.x, y: actor.y, z: actor.z, seed: NaN }, { speed: NaN }), true);
    const before = nodes.length;
    assert.equal(audio.emit('crash', { x: actor.x, y: NaN, z: actor.z }), false);
    assert.equal(nodes.length, before, 'invalid event is refused before audio-node allocation');
    audio.reset();
    assert.equal(audio.motors.size, 0); assert.equal(audio.sirens.size, 0); assert.equal(audio.events.length, 0);
    assert.ok(nodes.every(node => node.disconnected), 'reset releases every voice/emitter/event node');
  }
  assert.ok(writes.length > 0, 'real production AudioParam scheduling was exercised');
  assert.throws(() => createMotorVoice(context, resources, undefined, {}), /Unknown motor voice/,
    'native synthesis stays strict; no undefined-kind catch-all or rider fallback');
});

test('accepted bump metadata reaches native synthesized complaints once; pause/recycle never replay old impacts', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { hidden: false };
  const { context, nodes } = fakeAudio();
  context.listener = { setPosition() {}, setOrientation() {} };
  const base = traffic.peds.find(p => p.placed && !p.node);
  const p = { ...base, bumped: 0, reactionEpoch: 1, v: 0, conversation: null };
  const q = { ...p, x: p.x + 1, rig: { seed: 0.73, phase: 0 } };
  const people = [p];
  const sources = new CityAudioSources({ trafficSystem: { peds: people } });
  const resources = createEventResources(context, createSynthResources(context));
  const emitted = [];
  const audio = Object.assign(Object.create(CityAudioSystem.prototype), {
    context, resources, sources, mix: {}, reflections: context.createGain(), master: context.createGain(),
    reflectionFilter: context.createBiquadFilter(), acoustics: { update() {}, enclosure: 0, obstruction: () => 0 },
    listener: { x: 0, y: 0, z: 0 }, motors: new Map(), sirens: new Map(), events: [], states: new WeakMap(),
    conversations: new WeakMap(), motorParams: {}, windParams: {}, wind: { update() {} },
    limits: { events: 8, motors: 8, sirens: 2 }, accumulator: 0, intervalElapsed: 0, ready: true, enabled: true, paused: false,
    controllerManager: { getActiveEntity: () => null, getGroundHeight: () => p.dynamicBody.minY },
    unlock() {}, footPosition: {},
    emit(kind, source, options) {
      const result = CityAudioSystem.prototype.emit.call(this, kind, source, options);
      if (result) emitted.push({ kind, id: source.id, intensity: options.intensity });
      return result;
    }
  });
  const camera = { position: { x: p.x, y: p.dynamicBody.minY + 1, z: p.z }, updateMatrixWorld() {},
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  // A fading speech voice releases its nodes on Web Audio's ended callback, not at fade scheduling time.
  const dispatchEnded = () => { for (const node of nodes) if (node.stopTime <= context.currentTime) node.onended?.(); };
  const tick = () => { context.currentTime += 0.11; dispatchEnded(); audio.update(0.11, context.currentTime, camera); };
  const complaints = () => emitted.filter(e => e.kind === 'talk' && e.intensity === 1).length;
  try {
    tick(); assert.equal(complaints(), 0);
    p.bumpCooldown = 0;
    assert.ok(NYC.reactSfPedestrian.call({ source: p }, 4, 0, 1));
    tick(); assert.equal(complaints(), 1);
    assert.ok(audio.events.some(e => e.kind === 'talk' && e.voice.endTime > context.currentTime));
    tick(); assert.equal(complaints(), 1, 'one counter edge, no repeating complaint');
    audio.setPaused(true);
    assert.equal(audio.events.length, 0, 'pause retires existing speech');
    p.bumped++; tick(); assert.equal(complaints(), 1, 'paused audio admits no event');
    audio.setPaused(false); tick(); assert.equal(complaints(), 1, 'resume establishes a fresh baseline');
    p.bumped++; tick(); assert.equal(complaints(), 2);
    NYC.resetSfPedestrianReaction(p); tick(); assert.equal(complaints(), 2, 'recycle counter reset is silent');
    p.bumped++; tick(); assert.equal(complaints(), 3, 'a fresh post-recycle hit is audible');
    audio.reset();
    people.push(q);
    p.v = q.v = 0; p.pause = q.pause = p.bumpCooldown = q.bumpCooldown = 0;
    p.socialTime = q.socialTime = 0; p.t = q.t = 10; p.len = q.len = 30;
    const block = {}, social = NYC.createSfPedestrianSocial({ ground: () => p.dynamicBody.minY, clear: () => true,
      blockAt: () => block, random: () => 0 });
    social.update(people, 0.05, 10);
    const pair = p.conversation;
    assert.ok(pair && pair === q.conversation);
    tick();
    for (let i = 0; i < 2; i++) {
      context.currentTime = audio.conversations.get(pair).next + 0.01;
      tick();
    }
    const turns = emitted.filter(e => e.kind === 'talk' && e.intensity === 0.3);
    assert.equal(turns.length, 2); assert.equal(turns[0].id, pair.a); assert.equal(turns[1].id, pair.b);
    social.interrupt(p, 11); tick();
    assert.ok(audio.events.every(e => e.kind !== 'talk' || !e.follow), 'ended pair retires/fades its speech');
    assert.ok(audio.events.length <= audio.limits.events);
  } finally {
    audio.reset();
    context.currentTime += 0.1; dispatchEnded();
    // Shared mix/filter nodes belong to the full system, not event teardown.
    audio.reflections.disconnect(); audio.master.disconnect(); audio.reflectionFilter.disconnect();
    globalThis.document = originalDocument;
  }
  assert.ok(nodes.every(n => n.disconnected), 'all real synthetic event nodes released after reset');
});
