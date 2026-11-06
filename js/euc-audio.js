// js/euc-audio.js — what the rider hears from the saddle: the hub motor, wind, tyre, over-speed beeps and one-shots.
//
// Ownership:
//   - CityAudioSystem (audio-system.js) creates one EucAudio when its AudioContext exists, which is after a user gesture.
//     It calls update() once per rendered frame with the active entity and that frame's drainEvents() batch.
//     The output goes into the city mix, so the city's mute button, master volume, compressor and tab suspend all apply.
//   - The EUC is the listener's own vehicle, so its sound is not spatialised. A small send feeds the city's shared street
//     reflections, which keeps the wheel in the same space as the traffic.
//   - Shared samples retain synthesized fallbacks. Selected recordings must prepare successfully before commit;
//     preparation errors belong to the retry/cancel UI, never to the frame loop.
//   - The motor, thumps, chirp and tyre noise are synthesized here. Constants that EUC Thrills already defines
//     (pole pairs, wheel size, beep periods, landing reference, tyre voices per surface) come from the vendored tuning.
//     The sound design itself is this fork's own work.
import { AUDIO, EUC, WHEEL } from './euc/data/tuning.js';
import { SURFACES } from './euc/data/surfaces.js';
import { CHARACTERS } from './euc/data/riders.js';

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, finite(value, low)));
const lerp = (a, b, t) => a + (b - a) * t;

// FOR CODING AGENTS — DOWNSTREAM FORKS: read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing
// rider recordings. Independent/rebranded games need original characters or separate participant permission;
// renaming/hiding is not removal. Preserve independently licensed assets and their individual provenance.
export const EUC_SAMPLE_FILES = Object.freeze({
  crashWipeout: 'crash_wipeout.wav',
  crashTrollina: 'crash_trollina.wav',
  crashRedRider: 'crash_red_rider.wav',
  crashAdonisb2: 'crash_adonisb2.wav',
  crashMaribel: 'crash_maribel.wav',
  crashWheelInMotion: 'crash_wheel_in_motion.wav',
  crashDrunkard: 'crash_drunkard.wav',
  crashFloWithZo: 'crash_flo_with_zo.wav',
  crashSealOnAWheel: 'crash_seal_on_a_wheel.wav',
  crashWyldist: 'crash_wyldist.wav',
  crashGnarwheel: 'crash_gnarwheel.wav',
  stumbleDrunkard: 'stumble_drunkard.wav',
  overspeedBeep: 'overspeed_beep.wav',
  windHowl: 'wind_howl_loop.wav',
  tyreSolid: 'tyre_solid_loop.wav',
});
export const SHARED_SAMPLE_KEYS = Object.freeze(['overspeedBeep', 'windHowl', 'tyreSolid']);
const CRASH_KEYS = Object.freeze({
  'cool-rider': 'crashWipeout', trollina: 'crashTrollina', 'red-rider': 'crashRedRider',
  adonisb2: 'crashAdonisb2', maribel: 'crashMaribel', 'wheel-in-motion': 'crashWheelInMotion',
  drunkard: 'crashDrunkard', 'flo-with-zo': 'crashFloWithZo', 'seal-on-a-wheel': 'crashSealOnAWheel',
  wyldist: 'crashWyldist', gnarwheel: 'crashGnarwheel',
});

export const WHEEL_RADIUS = WHEEL.tyreDiameter / 2; // 0.25 m

// One table per voice, so listening QA can tune levels in one place. Levels are linear gains into the city mix,
// whose master gain is 0.65 behind a -16 dB compressor.
// Balance (2026-10-23, after the owner's playtest: "way too loud"). The rider's sound plays all the time and is not
// spatialised, so it sits well under a passing car (about -30 LUFS on the mix bus at 8 m) instead of level with it.
// Offline loudness measurements:
//   bed (motor + wind + tyre): about -49 LUFS at 5 m/s and -41 at 14 m/s (2026-10-24: motor -6 dB, rolling hiss
//   -16 dB, wind -2.6 dB and played as EUC Thrills plays it);
//   one-shots: momentary peaks of about -33 (land) to -27 (crash) LUFS;
//   over-speed beeps: about 6 dB above the bed, so they still cut through.
export const MOTOR = Object.freeze({
  polePairs: AUDIO.motorPolePairs, // 15: the electrical frequency is wheel revolutions per second x pole pairs
  idleHz: 22, // floor: a stopped, balancing wheel still hums (heard through the upper partials)
  maxHz: 300, // ceiling: about 31 m/s, past the derived top speed
  speedReference: 25, // m/s where the speed-driven parts of the voice are fully open
  airSpin: AUDIO.airSpinFactor, // 1.28: airborne, the unloaded wheel spins up
  airLoad: AUDIO.airDriveFactor, // 0.45: and has almost nothing to push against
  partials: Object.freeze([[1, 0.34], [2, 0.24], [3, 0.24], [3, 0.24]]), // [harmonic, gain]; the 3rd is a detuned pair
  detuneCents: 7, // the second 3rd harmonic: a slow beat that keeps the tone from sounding like a test oscillator
  commutationHarmonic: 6, // six-step commutation: the tone that means "fast"
  idleLevel: 0.00225, // all three -18 dB from the first version (2026-10-24 playtest: "wheel too loud", a further -6 dB)
  speedLevel: 0.0055,
  loadLevel: 0.0095,
  cutoffAtRest: 240,
  cutoffPerSpeed: 1500,
  cutoffPerLoad: 1700,
  filterQ: 0.7,
  gritQ: 6, // narrow noise band on the commutation tone: magnetic grain under load
  gritPerLoad: 1.1,
  coilHz: 4100, // PWM/coil whine: fixed carrier, amplitude-modulated by the commutation tone
  coilLevel: 0.0004, // -6 dB with the rest of the motor
  coilDepth: 0.55,
  response: 0.06, // seconds, setTargetAtTime time constant
  spinUpResponse: 0.22,
  spinDownResponse: 0.7, // crashed: the wheel winds down and the controller cuts power
});

export const WIND = Object.freeze({
  onsetSpeed: 3, // silent below
  fullSpeed: 16, // strong from here
  level: 0.14, // -9.5 dB: the sense of speed, not a gale (-2.6 dB on 2026-10-24, to sit with the quieter motor)
  exponent: 1.5,
  beyond: 0.15, // a little more past fullSpeed, reaching it 12 m/s later
  airBoost: 1.25,
  // The howl recording played as EUC Thrills plays it (src/audio/sink.ts, AUDIO.wind*): at its own pitch, through a
  // wide band that opens with speed. The first version also bent its pitch with speed and used a narrower band, which
  // made it whine (2026-10-24 playtest).
  lowHz: AUDIO.windCutoffAtRest, // 240
  highHz: AUDIO.windCutoffAtSpeed, // 1200
  q: AUDIO.windQ, // 0.4
  noiseTrim: 0.32, // the fallback noise is about 3x as loud (RMS) as the howl loop
  response: 0.2,
});

export const TYRE = Object.freeze({
  referenceSpeed: AUDIO.tyreReferenceSpeed, // 9 m/s: the toko loop holds one tick per revolution at this speed
  level: 0.03, // -25 dB: barely there (2026-10-24 playtest: the rolling hiss was too present); the toko tick carries it
  maxRamp: 1.4,
  centreRise: AUDIO.tyreCutoffRise, // 1.25
  tokoLevel: 0.05,
  tokoFullSpeed: 4,
  response: 0.05,
  liftResponse: 0.03,
});

export const CUES = Object.freeze({
  beepLevel: 0.06,
  beepLookahead: 0.05, // schedule beeps on the audio clock, a frame or two ahead
  beepFallbackHz: AUDIO.overspeedFallbackHz, // 2565
  beepSeconds: AUDIO.overspeedBeepSeconds, // 0.075
  hop: { level: 0.1, fromHz: 150, toHz: 60, seconds: 0.14, noiseHz: 900, noiseQ: 1.1, noiseSeconds: 0.09 },
  land: { level: 0.2, minScale: 0.28, fromHz: 190, toHz: 55, seconds: 0.2, noiseSeconds: 0.16 },
  impact: { level: 0.3, reference: 6, fromHz: 260, toHz: 80, seconds: 0.12, noiseHz: 1800, noiseQ: 1.4, noiseSeconds: 0.07,
    retrigger: 0.14, harder: 1.5 },
  crash: { level: 0.48, rateSpread: 0, fromHz: 130, toHz: 38, seconds: 0.42, noiseHz: 1200, noiseQ: 0.5, noiseSeconds: 0.55 },
  // Native stumble/crash recording ratio (director.ts + sink.ts @ 5f45fff), scaled to the accepted city crash mix.
  // The native stumble is a 0.4 s can-clank/hic sample at rate 1, without crash trim or speed scaling.
  stumble: { level: 0.48 * AUDIO.stumbleLevel / (AUDIO.crashLevel * AUDIO.crashSampleTrim) },
  recover: { level: 0.02, lowHz: 660, highHz: 990, seconds: 0.2, gap: 0.11 },
  maxVoices: 16,
  send: 0.35, // into the city's street reflections
});

/** Resolve playable IDs through source metadata (not a silent Cool Rider fallback). */
export function crashSampleKey(riderId) {
  const rider = CHARACTERS.find(rider => rider.id === riderId);
  const key = rider && CRASH_KEYS[rider.crashVoice];
  if (!key) throw new Error(`Unknown rider audio: ${riderId}`);
  return key;
}

const aborted = () => new DOMException('Rider audio preparation cancelled', 'AbortError');
const sampleURL = key => new URL(`../audio/euc/${EUC_SAMPLE_FILES[key]}`, import.meta.url);
const decodedBytes = buffer => (buffer?.length ?? 0) * (buffer?.numberOfChannels ?? 1) * Float32Array.BYTES_PER_ELEMENT;

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? aborted());
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? aborted());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** One committed bank + one candidate, with a serial decoder shared by the wheel's shared samples.
 * No AudioContext is created here. Title prefetch keeps only the selected bytes; prepare requires a gesture-created
 * context. Handles retain a record whose buffers are cleared on retirement, so UI references cannot pin old banks.
 */
export class RiderAudioBanks {
  constructor({ onCommit = () => {} } = {}) {
    this.onCommit = onCommit;
    this.active = null;
    this.candidate = null;
    this.disposed = false;
    this.decodeQueue = [];
    this.decoding = false;
  }

  decode(context, getBytes, valid = () => !this.disposed, signal) {
    if (this.disposed || !valid() || signal?.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      const job = { context, getBytes, valid, resolve, reject, signal };
      job.abort = () => {
        const index = this.decodeQueue.indexOf(job);
        if (index >= 0) this.decodeQueue.splice(index, 1);
        signal?.removeEventListener('abort', job.abort);
        // A running decode cannot be stopped, but the caller rejects now and its late result is discarded.
        reject(aborted());
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      this.decodeQueue.push(job);
      this.pumpDecode();
    });
  }

  pumpDecode() {
    if (this.decoding || this.disposed) return;
    const job = this.decodeQueue.shift();
    if (!job) return;
    this.decoding = true;
    const run = async () => {
      try {
        if (!job.valid() || job.signal?.aborted) throw aborted();
        const buffer = await decode(job.context, job.getBytes());
        if (this.disposed || !job.valid() || job.signal?.aborted) throw aborted();
        job.resolve(buffer);
      } catch (error) {
        job.reject(error);
      } finally {
        job.signal?.removeEventListener('abort', job.abort);
        this.decoding = false;
        this.pumpDecode();
      }
    };
    run(); // Every rejection is delivered through the job, including callback-only Safari decoders.
  }

  /** Snapshot on demand, not per frame. Decoded bytes are float PCM, not compressed transfer sizes. */
  get stats() {
    const records = [this.active, this.candidate].filter(Boolean);
    const buffers = new Set(records.flatMap(record => Object.values(record.buffers)));
    return Object.freeze({ activeBanks: Number(!!this.active), candidateBanks: Number(!!this.candidate),
      decodedBuffers: buffers.size, decodedBytes: [...buffers].reduce((n, buffer) => n + decodedBytes(buffer), 0),
      prefetchedBytes: records.reduce((n, record) => n + Object.values(record.bytes).reduce((sum, bytes) => sum + bytes.byteLength, 0), 0),
      decoding: Number(this.decoding), queuedDecodes: this.decodeQueue.length });
  }

  cancel() {
    if (this.candidate) this.retire(this.candidate);
  }

  retire(record) {
    record.controller.abort(aborted());
    for (const remove of record.listeners) remove();
    record.listeners.length = 0;
    record.bytes = {};
    record.buffers = {};
    if (this.candidate === record) this.candidate = null;
    if (this.active === record) this.active = null;
  }

  watch(record, signal) {
    if (!signal) return;
    if (signal.aborted) { this.retire(record); throw signal.reason ?? aborted(); }
    const cancel = () => this.retire(record);
    signal.addEventListener('abort', cancel, { once: true });
    record.listeners.push(() => signal.removeEventListener('abort', cancel));
  }

  /** Fetch selected bytes only; no decoding, context creation, graph or preview playback. */
  async prefetchRider(id, { signal, silent = false } = {}) {
    if (silent) {
      crashSampleKey(id);
      if (this.disposed || signal?.aborted) throw aborted();
      return;
    }
    await this.requestRider(id, signal);
  }

  async requestRider(id, signal) {
    const crash = crashSampleKey(id);
    if (this.disposed) throw aborted();
    if (signal?.aborted) throw signal.reason ?? aborted();
    if (this.active?.id === id) {
      this.cancel();
      return this.active;
    }
    let record = this.candidate;
    if (!record || record.id !== id) {
      this.cancel();
      record = { id, controller: new AbortController(), listeners: [], bytes: {}, buffers: {}, ready: false };
      this.candidate = record;
      record.keys = [crash, ...(id === 'drunkard' ? ['stumbleDrunkard'] : [])];
      record.fetching = (async () => {
        for (const key of record.keys) {
          const response = await fetch(sampleURL(key), { signal: record.controller.signal });
          if (record.controller.signal.aborted) throw aborted();
          if (!response.ok) throw new Error(`Rider audio ${EUC_SAMPLE_FILES[key]}: HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (record.controller.signal.aborted) throw aborted();
          record.bytes[key] = bytes;
        }
      })();
      record.fetching.catch(() => {}); // an already-aborted caller can retire it before awaiting the fetch
    }
    this.watch(record, signal);
    try {
      await abortable(record.fetching, record.controller.signal);
      return record;
    } catch (error) {
      this.retire(record);
      throw error;
    }
  }

  async prepareRider(id, context, { signal } = {}) {
    crashSampleKey(id);
    if (!context || context.state === 'closed') throw new Error('Unlock audio from the confirmation or Ride gesture before preparing a rider');
    const record = await this.requestRider(id, signal);
    // Preparing the already active identity is a cheap transaction, still invalidated by a subsequent selection.
    if (!this.candidate && this.active === record) return this.handle(record, context, signal);
    if (this.candidate !== record) throw aborted();
    const valid = () => !this.disposed && this.candidate === record && !record.controller.signal.aborted;
    try {
      if (!record.preparing) record.preparing = (async () => {
        for (const key of record.keys) {
          const buffer = await this.decode(context, () => record.bytes[key], valid, record.controller.signal);
          if (!valid()) throw aborted();
          delete record.bytes[key]; // decode detaches bytes; do not retain a redundant raw cache
          record.buffers[key] = buffer;
        }
        record.ready = true;
      })();
      await abortable(record.preparing, record.controller.signal);
      if (!valid()) throw aborted();
      return this.handle(record, context, signal);
    } catch (error) {
      this.retire(record);
      throw error;
    }
  }

  /** Explicit unavailable-platform policy, called only when CityAudioSystem detects no Web Audio constructor.
   * A silent identity bank has the same transaction/validity rules and owns no bytes, decoded audio or graph nodes.
   */
  prepareSilentRider(id, { signal } = {}) {
    crashSampleKey(id);
    if (this.disposed || signal?.aborted) throw aborted();
    this.cancel();
    if (this.active?.id === id && this.active.silent) return this.handle(this.active, null, signal);
    const record = { id, silent: true, ready: true, controller: new AbortController(), listeners: [], bytes: {}, buffers: {} };
    this.candidate = record;
    this.watch(record, signal);
    return this.handle(record, null, signal);
  }

  handle(record, context, signal) {
    const existing = this.active === record;
    let finished = false;
    const valid = () => !finished && !this.disposed && !signal?.aborted && !record.controller.signal.aborted
      && context?.state !== 'closed' && (existing ? this.active === record && !this.candidate : this.candidate === record && record.ready);
    return Object.freeze({ id: record.id, silent: !!record.silent, get valid() { return !!valid(); }, commit: () => {
      if (!valid()) throw aborted();
      if (!existing) {
        this.onCommit(); // stop old voices before releasing their bank
        if (this.active) this.retire(this.active);
        this.active = record;
        this.candidate = null;
        for (const remove of record.listeners) remove();
        record.listeners.length = 0;
      }
      finished = true;
      return true;
    }, dispose: () => {
      // After commit the bank belongs to this owner; a caller's finally-dispose is harmless.
      if (finished) return;
      finished = true;
      if (!existing && this.candidate === record) this.retire(record);
    } });
  }

  buffer(id, key) {
    return this.active?.id === id ? this.active.buffers[key] : null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    for (const job of [...this.decodeQueue]) job.abort();
    if (this.active) this.retire(this.active);
    this.onCommit = () => {};
  }
}

/**
 * Over-speed beep period, seconds. Geometric from `slowest` (just over the threshold, factor 0) to `fastest` (at the
 * cutout, factor 1): each equal step of speed makes the beeps a fixed ratio faster, as in EUC Thrills (M20).
 */
export function overspeedBeepPeriod(factor, slowest = AUDIO.overspeedSlowestPeriodSeconds,
  fastest = AUDIO.overspeedFastestPeriodSeconds) {
  const t = clamp(factor);
  const slow = slowest > 0 ? slowest : 1;
  const fast = fastest > 0 ? fastest : slow;
  return slow * (fast / slow) ** t;
}

/**
 * Beeps due in (now, now + lookahead], on the audio clock. `next` is the time of the next beep; -Infinity means "not
 * beeping". Below the threshold (factor <= 0) the schedule is disarmed, so the first beep after crossing it is immediate.
 */
export function planBeeps(next, factor, now, lookahead = CUES.beepLookahead) {
  const times = [];
  if (!(finite(factor) > 0)) return { times, next: -Infinity };
  const period = overspeedBeepPeriod(factor);
  let at = Number.isFinite(next) && next >= now ? next : now;
  while (at <= now + lookahead && times.length < 8) {
    times.push(at);
    at += period;
  }
  return { times, next: at };
}

/** Wheel revolutions per second at a ground speed. */
export function wheelHz(speed) {
  return Math.abs(finite(speed)) / (TAU * WHEEL_RADIUS);
}

/** The motor's electrical fundamental: wheel rotation rate x pole pairs, floored and ceilinged; spins up when airborne. */
export function motorFundamentalHz(speed, airborne = false) {
  const hz = wheelHz(speed) * MOTOR.polePairs * (airborne ? MOTOR.airSpin : 1);
  return clamp(hz, MOTOR.idleHz, MOTOR.maxHz);
}

/**
 * How hard the motor is working, 0..1.2. The controller's power load (1.0 = tilt-back) is the main signal. The rider's
 * lean demand stands in for the throttle, which the entity does not expose. Braking regenerates, so it counts at half.
 * Without a lean value, acceleration (m/s^2, against EUC.leanToAccel) is the fallback.
 */
export function motorDrive({ powerLoad = 0, lean = NaN, accel = 0 } = {}) {
  const demand = Number.isFinite(lean)
    ? Math.max(lean, -lean * 0.5)
    : Math.max(finite(accel), -finite(accel) * 0.5) / EUC.leanToAccel;
  return clamp(Math.max(finite(powerLoad), demand * 0.9), 0, 1.2);
}

/** Targets for the motor voice. Pure, so it can be tested without WebAudio. */
export function motorTargets({ speed = 0, drive = 0, grounded = true, crashed = false, present = true } = {}) {
  if (!present) {
    return { hz: MOTOR.idleHz, level: 0, cutoff: MOTOR.cutoffAtRest, high: 0, grit: 0, coil: 0, response: MOTOR.response };
  }
  const airborne = !grounded && !crashed;
  const s = clamp(Math.abs(finite(speed)) / MOTOR.speedReference);
  const load = clamp(drive, 0, 1.2) * (airborne ? MOTOR.airLoad : 1);
  const loadShare = load / 1.2;
  const hz = crashed ? MOTOR.idleHz : motorFundamentalHz(speed, airborne);
  return {
    hz,
    level: crashed ? 0 : MOTOR.idleLevel + MOTOR.speedLevel * s ** 0.8 + MOTOR.loadLevel * loadShare,
    cutoff: Math.min(6000, MOTOR.cutoffAtRest + MOTOR.cutoffPerSpeed * s + MOTOR.cutoffPerLoad * Math.min(1, load)),
    high: 0.08 + 0.4 * s ** 1.5 + 0.1 * Math.min(1, load),
    grit: MOTOR.gritPerLoad * Math.min(1, load) * (0.3 + 0.7 * s),
    coil: crashed ? 0 : MOTOR.coilLevel * Math.min(1, load),
    response: crashed ? MOTOR.spinDownResponse : airborne ? MOTOR.spinUpResponse : MOTOR.response,
  };
}

/** Rider wind: silent when stopped, noticeable from about 6 m/s, strong from about 15 m/s. */
export function windTargets(speed, grounded = true) {
  const v = Math.abs(finite(speed));
  const ramp = clamp((v - WIND.onsetSpeed) / (WIND.fullSpeed - WIND.onsetSpeed));
  const beyond = clamp((v - WIND.fullSpeed) / 12) * WIND.beyond;
  return {
    gain: WIND.level * (ramp ** WIND.exponent + beyond) * (grounded ? 1 : WIND.airBoost),
    hz: WIND.lowHz + (WIND.highHz - WIND.lowHz) * ramp + 400 * beyond,
  };
}

/** The tyre voice EUC Thrills assigns to a surface (pavement: smooth; grass: grass). */
export function tyreVoice(surface) {
  return AUDIO.tyreVoices[SURFACES[surface]?.tyreAudio] ?? AUDIO.tyreVoices['tyre-smooth'];
}

/** Rolling tyre noise and the "toko" revolution tick. Both stop in the air and while crashed. */
export function tyreTargets(speed, surface = 'pavement', grounded = true, crashed = false) {
  const v = Math.abs(finite(speed));
  const voice = tyreVoice(surface);
  const rolling = grounded && !crashed ? 1 : 0;
  const ramp = Math.min(TYRE.maxRamp, v / TYRE.referenceSpeed);
  return {
    noise: rolling * TYRE.level * voice.level * ramp ** 1.2 * (1 - voice.toko * 0.5),
    centreHz: voice.centreHz * lerp(1, TYRE.centreRise, Math.min(1, ramp)),
    q: voice.q,
    toko: rolling * TYRE.tokoLevel * voice.toko * clamp(v / TYRE.tokoFullSpeed),
    tokoRate: clamp(v / TYRE.referenceSpeed, 0.05, 3.5),
  };
}

export const hopScale = (charge) => lerp(0.7, 1, clamp(charge));
export const landingScale = (impact) => lerp(CUES.land.minScale, 1, clamp(Math.abs(finite(impact)) / EUC.landingImpactReference));
export const impactScale = (speed) => clamp(Math.abs(finite(speed)) / CUES.impact.reference);
export const crashScale = (speed) => lerp(0.55, 1, clamp(Math.abs(finite(speed)) / AUDIO.speedReference));

function decode(context, data) {
  return new Promise((resolve, reject) => {
    const pending = context.decodeAudioData(data, resolve, reject); // callback form for older Safari
    if (pending && typeof pending.then === 'function') pending.then(resolve, reject);
  });
}

// setTargetAtTime only when the target or time constant changes meaningfully, so per-frame updates stay cheap.
class Glide {
  constructor(param, epsilon = 0.0001) {
    this.param = param;
    this.epsilon = epsilon;
    this.target = NaN;
    this.tc = NaN;
  }

  to(value, now, tc) {
    if (Math.abs(value - this.target) < this.epsilon && tc === this.tc) return;
    this.param.cancelScheduledValues(now);
    this.param.setTargetAtTime(value, now, tc);
    this.target = value;
    this.tc = tc;
  }

  snap(value, now) {
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(value, now);
    this.target = NaN;
    this.tc = NaN;
  }
}

export class EucAudio {
  /**
   * @param {AudioContext} context  the city's context (already created by a user gesture)
   * @param {AudioNode} output      the city mix
   * @param {{ noise?: AudioBuffer, reflections?: AudioNode, onWindHowl?: (buffer: AudioBuffer) => void, riderBanks?: RiderAudioBanks }} options
   *   shared noise loop, the street reflection bus, and who else wants the wind recording once it is decoded
   */
  constructor(context, output, { noise = null, reflections = null, onWindHowl = null, riderBanks = null } = {}) {
    this.context = context;
    this.onWindHowl = onWindHowl;
    this.disposed = false;
    this.loadController = new AbortController(); // Mute keeps samples cached; only disposal cancels loading.
    this.noise = noise || this.makeNoise();
    this.buffers = {};
    this.riderBanks = riderBanks ?? new RiderAudioBanks({ onCommit: () => this.reset() });
    this.ownsRiderBanks = !riderBanks;
    this.voices = new Set();
    this.loops = [];
    this.nodes = [];
    this.nextBeep = -Infinity;
    this.impactHold = -Infinity;
    this.lastImpactScale = 0;
    this.lastSpeed = 0;
    this.lastTime = NaN;
    this.crashVoice = null;
    this.warned = new Set();

    const now = context.currentTime;
    this.out = this.gain(1);
    this.out.connect(output);
    if (reflections) {
      this.send = this.gain(CUES.send);
      this.out.connect(this.send).connect(reflections);
    }
    this.bed = this.gain(1);
    this.bed.connect(this.out);
    this.sfx = this.gain(1);
    this.sfx.connect(this.out);

    // Motor: one control signal (the electrical fundamental, Hz) drives every partial, so they glide together.
    this.motorHz = this.own(context.createConstantSource());
    this.motorHz.offset.value = MOTOR.idleHz;
    const tone = this.gain(1);
    this.motorFilter = this.filter('lowpass', MOTOR.cutoffAtRest, MOTOR.filterQ);
    this.motorLevel = this.gain(0);
    tone.connect(this.motorFilter).connect(this.motorLevel).connect(this.bed);
    const partial = (harmonic, level, detune = 0) => {
      const osc = this.oscillator('sine', 0);
      osc.detune.value = detune;
      const multiply = this.gain(harmonic);
      this.motorHz.connect(multiply).connect(osc.frequency);
      const gain = this.gain(level);
      osc.connect(gain).connect(tone);
      return { osc, gain };
    };
    MOTOR.partials.forEach(([harmonic, level], i) => partial(harmonic, level, i === 3 ? MOTOR.detuneCents : 0));
    const commutation = partial(MOTOR.commutationHarmonic, 0);
    this.motorHigh = commutation.gain;
    // Magnetic grain: a narrow noise band that follows the commutation tone.
    const grit = this.loop(this.noise, 0.37);
    const gritBand = this.filter('bandpass', 0, MOTOR.gritQ);
    this.motorHz.connect(this.gain(MOTOR.commutationHarmonic)).connect(gritBand.frequency);
    this.motorGrit = this.gain(0);
    grit.connect(gritBand).connect(this.motorGrit).connect(tone);
    // PWM/coil whine: a quiet fixed carrier, amplitude-modulated by the commutation tone. It bypasses the lowpass.
    const coil = this.oscillator('sine', MOTOR.coilHz);
    const coilAm = this.gain(1);
    commutation.osc.connect(this.gain(MOTOR.coilDepth)).connect(coilAm.gain);
    const coilFilter = this.filter('lowpass', 6000, 0.5);
    this.coilLevel = this.gain(0);
    coil.connect(coilAm).connect(coilFilter).connect(this.coilLevel).connect(this.bed);

    // Wind: the howl loop (or noise) through a band that opens with speed.
    this.windBand = this.filter('bandpass', WIND.lowHz, WIND.q);
    this.windLevel = this.gain(0);
    this.windTrim = this.gain(1);
    this.windTrim.connect(this.windBand).connect(this.windLevel).connect(this.bed);
    this.windSource = null;

    // Tyre: rolling noise in the surface's band, plus the toko tick loop once loaded.
    const road = this.loop(this.noise, 0.71);
    this.tyreBand = this.filter('bandpass', 1750, 0.6);
    this.tyreLevel = this.gain(0);
    road.connect(this.tyreBand).connect(this.tyreLevel).connect(this.bed);
    this.tokoLevel = this.gain(0);
    this.tokoLevel.connect(this.bed);
    this.tokoSource = null;

    this.glides = {
      hz: new Glide(this.motorHz.offset, 0.05),
      level: new Glide(this.motorLevel.gain),
      cutoff: new Glide(this.motorFilter.frequency, 2),
      high: new Glide(this.motorHigh.gain, 0.002),
      grit: new Glide(this.motorGrit.gain, 0.002),
      coil: new Glide(this.coilLevel.gain, 0.00002),
      wind: new Glide(this.windLevel.gain),
      windHz: new Glide(this.windBand.frequency, 2),
      tyre: new Glide(this.tyreLevel.gain),
      tyreHz: new Glide(this.tyreBand.frequency, 2),
      tyreQ: new Glide(this.tyreBand.Q, 0.01),
      toko: new Glide(this.tokoLevel.gain),
    };
    this.tokoRate = null;

    this.motorHz.start(now);
    for (const source of this.loops) source.start(now, source.startOffset);

    // Lazy sample loading: this runs only once the city's context exists, i.e. after a user gesture.
    for (const key of SHARED_SAMPLE_KEYS) this.load(key);
  }

  own(node) {
    this.nodes.push(node);
    return node;
  }

  gain(value) {
    const node = this.own(this.context.createGain());
    node.gain.value = value;
    return node;
  }

  filter(type, frequency, q) {
    const node = this.own(this.context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  oscillator(type, frequency) {
    const node = this.own(this.context.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    node.startOffset = undefined;
    this.loops.push(node);
    return node;
  }

  loop(buffer, phase = 0) {
    const node = this.own(this.context.createBufferSource());
    node.buffer = buffer;
    node.loop = true;
    node.startOffset = phase * buffer.duration;
    this.loops.push(node);
    return node;
  }

  makeNoise() {
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.round(rate * 2), rate);
    const data = buffer.getChannelData(0);
    let seed = 0x45554331;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296 * 2 - 1) * 0.5;
    }
    return buffer;
  }

  load(key) {
    if (this.disposed) return Promise.resolve(null);
    if (!SHARED_SAMPLE_KEYS.includes(key)) return Promise.reject(new Error('Rider recordings require prepareRider()'));
    let url;
    try {
      url = new URL(`../audio/euc/${EUC_SAMPLE_FILES[key]}`, import.meta.url);
    } catch {
      return Promise.resolve(null);
    }
    return fetch(url, { signal: this.loadController.signal })
      .then((response) => {
        if (this.disposed) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => this.disposed ? null : this.riderBanks.decode(this.context, () => data, () => !this.disposed, this.loadController.signal))
      .then((buffer) => {
        if (this.disposed) return null;
        this.buffers[key] = buffer;
        this.attach(key, buffer);
        return buffer;
      })
      .catch((error) => {
        if (this.disposed || error?.name === 'AbortError') return null;
        this.buffers[key] = null;
        if (!this.warned.has(key)) {
          this.warned.add(key);
          console.warn(`[audio] EUC sample ${EUC_SAMPLE_FILES[key]} unavailable; using a synthesized fallback`, error?.message ?? error);
        }
        this.attach(key, null);
        return null;
      });
  }

  /** Start a looping sample once it arrives (or its fallback, if it did not). */
  attach(key, buffer) {
    try {
      const now = this.context.currentTime;
      if (key === 'windHowl' && !this.windSource) {
        const source = this.context.createBufferSource();
        source.buffer = buffer || this.noise;
        source.loop = true;
        this.windTrim.gain.value = buffer ? 1 : WIND.noiseTrim;
        source.connect(this.windTrim);
        source.start(now, 0);
        this.windSource = source;
        if (buffer) this.onWindHowl?.(buffer);
      } else if (key === 'tyreSolid' && buffer && !this.tokoSource) {
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.value = 0.05;
        source.connect(this.tokoLevel);
        source.start(now, 0);
        this.tokoSource = source;
        this.tokoRate = new Glide(source.playbackRate, 0.002);
      }
    } catch (error) {
      console.warn('[audio] EUC loop could not start', error);
    }
  }

  /**
   * One rendered frame.
   * @param {object|null} entity  the active entity; anything but type 'euc' fades the rider's sound out
   * @param {Array} events        this frame's entity.drainEvents()
   */
  update(entity, events = [], now = this.context.currentTime) {
    if (this.disposed) return;
    try {
      this.render(entity, events, Math.max(this.context.currentTime, finite(now, this.context.currentTime)));
    } catch (error) {
      if (!this.warned.has('update')) {
        this.warned.add('update');
        console.warn('[audio] EUC audio update failed', error);
      }
    }
  }

  render(entity, events, now) {
    const euc = entity?.type === 'euc' ? entity : null;
    const controller = euc?.controller;
    const speed = finite(euc?.speed);
    const grounded = controller ? controller.isGrounded !== false : true;
    const crashed = !!controller?.crashed;
    const dt = Number.isFinite(this.lastTime) ? clamp(now - this.lastTime, 1e-3, 0.25) : 1 / 60;
    const accel = (Math.abs(speed) - Math.abs(this.lastSpeed)) / dt;
    this.lastTime = now;
    this.lastSpeed = speed;

    for (const event of events) this.cue(event, now, controller);

    const lean = controller && Number.isFinite(controller.leanPitch) ? controller.leanPitch / EUC.maxLeanPitch : NaN;
    const drive = motorDrive({ powerLoad: finite(controller?.powerLoad), lean, accel });
    const motor = motorTargets({ speed, drive, grounded, crashed, present: !!euc });
    const g = this.glides;
    g.hz.to(motor.hz, now, motor.response);
    g.level.to(motor.level, now, crashed ? 0.25 : MOTOR.response);
    g.cutoff.to(motor.cutoff, now, 0.08);
    g.high.to(motor.high, now, 0.12);
    g.grit.to(motor.grit, now, 0.08);
    g.coil.to(motor.coil, now, 0.08);

    const wind = windTargets(euc ? speed : 0, grounded);
    g.wind.to(wind.gain, now, WIND.response);
    g.windHz.to(wind.hz, now, WIND.response);

    const tyre = tyreTargets(euc ? speed : 0, controller?.currentSurface, grounded, crashed);
    const lift = grounded && !crashed ? TYRE.response : TYRE.liftResponse;
    g.tyre.to(tyre.noise, now, lift);
    g.tyreHz.to(tyre.centreHz, now, 0.15);
    g.tyreQ.to(tyre.q, now, 0.15);
    g.toko.to(this.tokoSource ? tyre.toko : 0, now, lift);
    this.tokoRate?.to(tyre.tokoRate, now, 0.05);

    const factor = euc && !crashed ? finite(controller?.overspeed) : 0;
    const plan = planBeeps(this.nextBeep, factor, now);
    this.nextBeep = plan.next;
    for (const at of plan.times) this.beep(at);
  }

  cue(event, now, controller) {
    switch (event?.type) {
      case 'hop': {
        const c = CUES.hop;
        const level = c.level * hopScale(event.charge);
        this.thump(now, c.fromHz, c.toHz, c.seconds, level);
        this.burst(now, c.noiseHz, c.noiseQ, c.noiseSeconds, level * 0.6);
        break;
      }
      case 'land': {
        const c = CUES.land;
        const level = c.level * landingScale(event.impact);
        const voice = tyreVoice(event.surface);
        this.thump(now, c.fromHz, c.toHz, c.seconds, level);
        this.burst(now, voice.centreHz, voice.q, c.noiseSeconds, level * 0.7);
        break;
      }
      case 'impact': {
        // A wheel pressed against a kerb reports an impact every step. Retrigger only after the hold, or for a clearly
        // harder hit. A crash owns its moment, so a sliding rider is not a series of kerb strikes.
        const c = CUES.impact;
        const scale = impactScale(event.speed);
        if (scale <= 0.02 || controller?.crashed) break;
        if (now - this.impactHold < c.retrigger && scale < this.lastImpactScale * c.harder) break;
        this.impactHold = now;
        this.lastImpactScale = scale;
        this.thump(now, c.fromHz, c.toHz, c.seconds, c.level * scale);
        this.burst(now, c.noiseHz, c.noiseQ, c.noiseSeconds, c.level * scale * 0.6);
        break;
      }
      case 'crash':
        this.crash(now, event.rider, event.speed);
        break;
      case 'stumble': {
        const id = event.rider ?? this.riderBanks.active?.id;
        const buffer = this.riderBanks.buffer(id, 'stumbleDrunkard');
        if (id === 'drunkard' && buffer) this.sample(buffer, now, CUES.stumble.level, 1, 0.003);
        break;
      }
      case 'recover': {
        const c = CUES.recover;
        this.tone(now, c.lowHz, c.seconds, c.level);
        this.tone(now + c.gap, c.highHz, c.seconds, c.level);
        break;
      }
      default:
        break;
    }
  }

  /** Register a one-shot; its nodes are released when its last source ends. Returns false when over budget. */
  voice(sources, nodes, end) {
    if (this.voices.size >= CUES.maxVoices) {
      // Reclaim anything already past its end before refusing.
      const now = this.context.currentTime;
      for (const voice of this.voices) if (voice.end <= now) this.release(voice);
      if (this.voices.size >= CUES.maxVoices) {
        for (const source of sources) if ('buffer' in source) source.buffer = null;
        for (const node of nodes) node.disconnect();
        return null;
      }
    }
    const voice = { sources, nodes, end, remaining: sources.length };
    for (const source of sources) {
      source.onended = () => {
        if (--voice.remaining <= 0) this.release(voice);
      };
    }
    this.voices.add(voice);
    return voice;
  }

  /** On-demand ownership counts: fixed graph stays shared across every rider; one-shot nodes never enter nodes[]. */
  get stats() {
    const fixed = new Set([...this.nodes, this.windSource, this.tokoSource].filter(Boolean));
    const shared = new Set(Object.values(this.buffers).filter(Boolean));
    return Object.freeze({ disposed: this.disposed, fixedNodes: fixed.size, voices: this.voices.size,
      voiceNodes: [...this.voices].reduce((n, voice) => n + voice.nodes.length, 0),
      sharedBuffers: shared.size, sharedDecodedBytes: [...shared].reduce((n, buffer) => n + decodedBytes(buffer), 0),
      noiseBytes: decodedBytes(this.noise), riderBanks: this.riderBanks.stats });
  }

  release(voice) {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      if ('buffer' in source) source.buffer = null;
    }
    for (const node of voice.nodes) node.disconnect();
    if (this.crashVoice === voice) this.crashVoice = null;
  }

  stopVoice(voice, fade = 0.03) {
    const now = this.context.currentTime;
    const level = voice.nodes.find((node) => node.isLevel);
    if (level) {
      level.gain.cancelScheduledValues(now);
      level.gain.setTargetAtTime(0, now, fade / 3);
    }
    for (const source of voice.sources) {
      try { source.stop(now + fade); } catch { /* already stopped */ }
    }
  }

  /** A pitched body thump: a sine falling from `fromHz` to `toHz`, with a fast attack and exponential decay. */
  thump(at, fromHz, toHz, seconds, level) {
    if (!(level > 0.0005)) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(fromHz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(env).connect(this.sfx);
    if (!this.voice([osc], [osc, env], at + seconds + 0.02)) return;
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  /** A short band of noise: the scuff, crack or slap that sits on top of a thump. */
  burst(at, hz, q, seconds, level) {
    if (!(level > 0.0005)) return;
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = clamp(hz, 40, ctx.sampleRate * 0.45);
    band.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(env).connect(this.sfx);
    if (!this.voice([source], [source, band, env], at + seconds + 0.02)) return;
    source.start(at, Math.random() * (this.noise.duration - seconds - 0.05));
    source.stop(at + seconds + 0.02);
  }

  /** A soft sine tone (the recovery chirp's two notes). */
  tone(at, hz, seconds, level, harmonic = 0) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.009);
    env.gain.setTargetAtTime(0, at + Math.max(0.01, seconds - 0.04), 0.012);
    osc.connect(env).connect(this.sfx);
    const sources = [osc], nodes = [osc, env];
    if (harmonic > 0) {
      const second = ctx.createOscillator();
      second.frequency.value = hz * 2;
      const mix = ctx.createGain();
      mix.gain.value = harmonic;
      second.connect(mix).connect(env);
      sources.push(second);
      nodes.push(second, mix);
    }
    if (!this.voice(sources, nodes, at + seconds + 0.05)) return;
    for (const source of sources) {
      source.start(at);
      source.stop(at + seconds + 0.05);
    }
  }

  /** One over-speed warning beep: the sample, or a two-partial synthesized buzzer if it failed to load. */
  beep(at) {
    const buffer = this.buffers.overspeedBeep;
    if (buffer) {
      this.sample(buffer, at, CUES.beepLevel);
    } else if (buffer === null) {
      this.tone(at, CUES.beepFallbackHz, CUES.beepSeconds, CUES.beepLevel * 0.7, 0.135); // 2nd harmonic -17.4 dB
    }
    // undefined: still loading. Skip this beep rather than play a different sound for the first few.
  }

  sample(buffer, at, level, rate = 1, attack = 0) {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.value = level;
    if (attack > 0) {
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(level, at + attack);
    }
    env.isLevel = true;
    source.connect(env).connect(this.sfx);
    const voice = this.voice([source], [source, env], at + buffer.duration / rate);
    if (!voice) return null;
    source.start(at);
    return voice;
  }

  crash(now, riderId, speed) {
    if (!CHARACTERS.some(rider => rider.id === riderId)) return;
    const buffer = this.riderBanks.buffer(riderId, crashSampleKey(riderId));
    if (!buffer) return;
    const c = CUES.crash;
    const level = c.level * crashScale(speed);
    if (this.crashVoice) this.stopVoice(this.crashVoice);
    this.crashVoice = null;
    // Preserve the contributed speech, alarm and authored timing at native pitch; no per-play rate rotation.
    this.crashVoice = this.sample(buffer, now, level, 1, 0.008);
  }

  /** Mute/visibility/teleport: silence everything at once and forget scheduled beeps and retrigger windows. */
  reset() {
    if (this.disposed) return;
    const now = this.context.currentTime;
    for (const voice of [...this.voices]) {
      for (const source of voice.sources) {
        try { source.stop(); } catch { /* not started or already stopped */ }
      }
      this.release(voice);
    }
    const g = this.glides;
    for (const key of ['level', 'coil', 'wind', 'tyre', 'toko']) g[key].snap(0, now);
    this.nextBeep = -Infinity;
    this.impactHold = -Infinity;
    this.lastImpactScale = 0;
    this.lastTime = NaN;
    this.crashVoice = null;
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.loadController.abort();
    if (this.ownsRiderBanks) this.riderBanks.dispose();
    for (const source of [...this.loops, this.motorHz, this.windSource, this.tokoSource]) {
      try { source?.stop(); } catch { /* already stopped */ }
      if (source && 'buffer' in source) source.buffer = null;
    }
    for (const node of [...this.nodes, this.windSource, this.tokoSource]) node?.disconnect();
    this.buffers = {};
    this.noise = null;
    this.onWindHowl = null;
  }
}
