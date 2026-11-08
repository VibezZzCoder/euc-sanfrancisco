// Adapted from euc-newyork@7cf4ce7 (© 2026 VibezZzCoder, MIT). What the player hears of Officer Dorkins: his siren, its sting when he ambushes, the hum of
// his hover-wheel, and his paddle (wind-up, swing, hit).
//
//   - The siren is EUC Thrills' chase siren (M18), reused as it was designed: a threat radar. Two CC0 loops (far wail,
//     close wail; audio/euc/PROVENANCE.md) crossfade by his range, the level follows his range on EUC Thrills' curve
//     (vendored AUDIO.siren*: silent beyond 60 m, full inside 8 m), and both loops lean a few percent sharp while he
//     closes. When the chase ends it fades out on the release constant, as there.
//   - Not annoying (owner, 2026-10-24): its full level sits well under a car passing at 8 m, and after the first
//     seconds of a chase it settles a further 4 dB. Only the sting (the close wail's opening, once, as he ambushes)
//     is heard whatever his range: it is the announcement. Measured on the mix bus (LUFS-like): siren at 6 m -37
//     (settled -41), at 25 m -43, at 45 m -54; the sting -35 momentary; the
//     hum at 3 m -46; the paddle's wind-up -42, swing -48 and hit -33 momentary (the siren ducks 4 dB under his
//     wind-up and swing). For scale: a car passing at 8 m -30, the rider's own wheel at 9 m/s -46, a crash -27.
//   - The hum is synthesized here (this fork's own code): a low electric drone that rises with his speed, quiet, and
//     only heard close by. Siren and hum share a gentle stereo pan toward where he is.
//   - The paddle as EUC Thrills sounds it (M14, vendored AUDIO.swing* and hit*: a whoosh, a thump, silence on a miss),
//     synthesized here, plus a rising whoosh over his wind-up so the swing is heard coming.
//   - Like js/euc-audio.js: created by CityAudioSystem once its context exists (after a gesture), samples load lazily,
//     a failed load leaves the chase silent, nothing throws into the frame loop.
import { AUDIO } from './euc/data/tuning.js';

export const COP_SAMPLE_FILES = Object.freeze({
  sirenFar: 'siren_far_loop.wav',
  sirenClose: 'siren_close_loop.wav',
});

export const COP_SIREN = Object.freeze({
  level: 0.2, // linear into the city mix at point-blank (EUC Thrills: AUDIO.sirenLevel 0.4, into its own mix)
  farMetres: AUDIO.sirenFarMetres, // 60: audible from here...
  nearMetres: AUDIO.sirenNearMetres, // 8: ...full from here
  curve: AUDIO.sirenDistanceCurve, // 1.5
  blendFarMetres: AUDIO.sirenBlendFarMetres, // 40: all far wail outside...
  blendNearMetres: AUDIO.sirenBlendNearMetres, // 12: ...all close wail inside
  blendSeconds: AUDIO.sirenBlendSeconds,
  responseSeconds: AUDIO.sirenResponseSeconds,
  releaseSeconds: AUDIO.sirenReleaseSeconds, // 1.6: the chase is over
  dopplerPerMs: AUDIO.sirenDopplerPerMs,
  dopplerMax: AUDIO.sirenDopplerMax,
  rateSeconds: AUDIO.sirenRateSeconds,
  settleAfter: 10, // s into a chase...
  settle: 0.63, // ...the loops ease down 4 dB
  settleSeconds: 3,
  stingLevel: 0.25,
  stingSeconds: 1.7,
  pan: 0.55, // at most, for him straight to one side
  swingDuck: 0.6, // -4.4 dB on the siren while he winds up and swings
});

export const COP_HUM = Object.freeze({
  level: 0.012, // at refMetres
  refMetres: 4,
  rangeMetres: 70, // silent beyond
  baseHz: 92,
  perSpeedHz: 2.4, // Hz per m/s of his speed
  cutoffHz: 420,
  cutoffPerSpeed: 40,
  airLevel: 0.6, // the thrusters' air, relative, at cruise
  response: 0.15,
});

export const COP_PADDLE = Object.freeze({
  windupLevel: 0.2, // the telegraph: band noise rising over the wind-up, to be heard over his siren
  windupFromHz: 450,
  windupToHz: 2200,
  windupQ: 1.4,
  swingLevel: 0.16, // EUC Thrills AUDIO.swingLevel 0.16 (into its own mix; here +6 dB on its siren balance: a threat)
  swingHz: AUDIO.swingNoiseHz, // 2400
  swingQ: AUDIO.swingNoiseQ,
  swingSeconds: AUDIO.swingNoiseSeconds, // 0.13
  hitLevel: 0.3, // EUC Thrills AUDIO.hitLevel 0.42
  hitFromHz: AUDIO.hitThumpFromHz, // 210
  hitToHz: AUDIO.hitThumpToHz, // 62
  hitSeconds: AUDIO.hitThumpSeconds, // 0.16
  hitNoiseHz: AUDIO.hitNoiseHz, // 1150
  hitNoiseSeconds: AUDIO.hitNoiseSeconds, // 0.10
});

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : Number.isFinite(v) ? v : lo);
const mapRange = (v, a, b) => clamp((v - a) / (b - a));

/** 1 at the start of a chase, easing down to COP_SIREN.settle after settleAfter s. */
export function settleFactor(chaseTime) {
  const t = clamp((chaseTime - COP_SIREN.settleAfter) / COP_SIREN.settleSeconds);
  return 1 - (1 - COP_SIREN.settle) * t * t * (3 - 2 * t);
}

/** The siren's range-driven targets, before smoothing: { gain, blend (0 far wail .. 1 close), rate }. */
export function sirenTargets(range, closing = 0, chaseTime = 0) {
  if (!Number.isFinite(range)) return { gain: 0, blend: null, rate: 1 };
  const proximity = mapRange(range, COP_SIREN.farMetres, COP_SIREN.nearMetres) ** COP_SIREN.curve;
  return {
    gain: COP_SIREN.level * proximity * settleFactor(chaseTime),
    blend: mapRange(range, COP_SIREN.blendFarMetres, COP_SIREN.blendNearMetres),
    rate: 1 + clamp(closing * COP_SIREN.dopplerPerMs, -COP_SIREN.dopplerMax, COP_SIREN.dopplerMax),
  };
}

/** The hum's targets: inverse distance from refMetres, faded out toward rangeMetres; pitch and brightness with speed. */
export function humTargets(distance, speed, present = true) {
  const d = Math.max(COP_HUM.refMetres, Number.isFinite(distance) ? distance : Infinity);
  const fade = present ? clamp((COP_HUM.rangeMetres - d) / (COP_HUM.rangeMetres * 0.4)) : 0;
  const s = Math.abs(Number.isFinite(speed) ? speed : 0);
  return {
    gain: COP_HUM.level * (COP_HUM.refMetres / d) * fade,
    hz: COP_HUM.baseHz + COP_HUM.perSpeedHz * Math.min(s, 25),
    cutoff: COP_HUM.cutoffHz + COP_HUM.cutoffPerSpeed * Math.min(s, 25),
    air: COP_HUM.airLevel * Math.min(1, s / 17),
  };
}

function decode(context, data) {
  return new Promise((resolve, reject) => {
    const pending = context.decodeAudioData(data, resolve, reject);
    if (pending && typeof pending.then === 'function') pending.then(resolve, reject);
  });
}

export class NemesisAudio {
  /**
   * @param {BaseAudioContext} context
   * @param {AudioNode} output  the city mix
   * @param {{ noise?: AudioBuffer, reflections?: AudioNode }} options
   */
  constructor(context, output, { noise = null, reflections = null } = {}) {
    this.context = context;
    this.disposed = false;
    this.loadController = new AbortController(); // Shared by this object's sample requests, not its mute/reset cycle.
    this.nodes = [];
    this.buffers = {};
    this.blend = 0;
    this.lastSting = -1;
    this.last = { windup: -1, swing: -1, hit: -1 };
    this.oneShots = new Set();
    this.noise = noise;
    this.targets = {};
    const own = (node) => (this.nodes.push(node), node);
    const gain = (value) => {
      const node = own(context.createGain());
      node.gain.value = value;
      return node;
    };
    this.gain = gain;
    this.out = context.createStereoPanner ? own(context.createStereoPanner()) : gain(1);
    this.out.connect(output);
    if (reflections) this.out.connect(gain(0.25)).connect(reflections);
    this.farGain = gain(0);
    this.closeGain = gain(0);
    this.farGain.connect(this.out);
    this.closeGain.connect(this.out);
    this.far = null;
    this.close = null;

    // The hum: a sawtooth drone and its detuned octave through a lowpass, plus thruster air (band noise)
    const now = context.currentTime;
    this.humHz = own(context.createConstantSource());
    this.humHz.offset.value = COP_HUM.baseHz;
    const drone = own(context.createOscillator());
    drone.type = 'sawtooth';
    drone.frequency.value = 0;
    this.humHz.connect(drone.frequency);
    const octave = own(context.createOscillator());
    octave.type = 'sine';
    octave.frequency.value = 0;
    octave.detune.value = 9;
    this.humHz.connect(gain(2)).connect(octave.frequency);
    this.humFilter = own(context.createBiquadFilter());
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = COP_HUM.cutoffHz;
    this.humFilter.Q.value = 0.9;
    this.humGain = gain(0);
    drone.connect(this.humFilter);
    octave.connect(gain(0.5)).connect(this.humFilter);
    this.humFilter.connect(this.humGain).connect(this.out);
    this.sources = [this.humHz, drone, octave];
    if (noise) {
      const air = own(context.createBufferSource());
      air.buffer = noise;
      air.loop = true;
      const band = own(context.createBiquadFilter());
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.8;
      this.airGain = gain(0);
      air.connect(band).connect(this.airGain).connect(this.humGain);
      this.sources.push(air);
    }
    for (const source of this.sources) source.start(now);

    for (const key of Object.keys(COP_SAMPLE_FILES)) this.load(key);
  }

  load(key) {
    if (this.disposed) return Promise.resolve(null);
    let url;
    try {
      url = new URL(`../audio/euc/${COP_SAMPLE_FILES[key]}`, import.meta.url);
    } catch {
      return Promise.resolve(null);
    }
    return fetch(url, { signal: this.loadController.signal })
      .then((response) => {
        if (this.disposed) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => this.disposed ? null : decode(this.context, data))
      .then((buffer) => {
        if (this.disposed) return null;
        this.buffers[key] = buffer;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(key === 'sirenFar' ? this.farGain : this.closeGain);
        source.start(this.context.currentTime);
        this[key === 'sirenFar' ? 'far' : 'close'] = source;
        return buffer;
      })
      .catch((error) => {
        if (this.disposed || error?.name === 'AbortError') return null;
        console.warn(`[audio] cop siren ${COP_SAMPLE_FILES[key]} unavailable`, error?.message ?? error);
        return null;
      });
  }

  /** Glide a parameter, skipping changes too small to hear (keeps per-frame automation cheap). */
  to(name, param, value, now, tc, epsilon = 0.0002) {
    const last = this.targets[name];
    if (last && Math.abs(last.value - value) < epsilon && last.tc === tc) return;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, tc);
    this.targets[name] = { value, tc };
  }

  /**
   * One rendered frame. view (js/nemesis.js audioView): { present, chasing, range, closing, speed, chaseTime, sting,
   * pan (-1 left .. 1 right) }.
   */
  update(view, now = this.context.currentTime) {
    if (this.disposed || !view) return;
    try {
      const S = COP_SIREN;
      const siren = sirenTargets(view.chasing ? view.range : Infinity, view.closing, view.chaseTime);
      if (view.swinging) siren.gain *= S.swingDuck; // his paddle is the thing to hear
      const tc = view.chasing ? S.responseSeconds : S.releaseSeconds;
      if (siren.blend !== null) this.blend = siren.blend; // the target; the gains' glide does the smoothing
      const angle = this.blend * Math.PI / 2;
      this.to('far', this.farGain.gain, siren.gain * Math.cos(angle), now, tc);
      this.to('close', this.closeGain.gain, siren.gain * Math.sin(angle), now, tc);
      for (const [name, source] of [['farRate', this.far], ['closeRate', this.close]]) {
        if (source) this.to(name, source.playbackRate, siren.rate, now, S.rateSeconds, 0.001);
      }
      if (view.sting !== this.lastSting) {
        if (this.lastSting >= 0) this.sting(now);
        this.lastSting = view.sting;
      }
      for (const kind of ['windup', 'swing', 'hit']) {
        const count = view[kind] ?? 0;
        if (count !== this.last[kind]) {
          if (this.last[kind] >= 0) this.paddle(kind, now);
          this.last[kind] = count;
        }
      }
      const hum = humTargets(view.range, view.speed, view.present);
      this.to('hum', this.humGain.gain, hum.gain, now, COP_HUM.response, 0.00005);
      this.to('humHz', this.humHz.offset, hum.hz, now, COP_HUM.response, 0.5);
      this.to('humCutoff', this.humFilter.frequency, hum.cutoff, now, COP_HUM.response, 5);
      if (this.airGain) this.to('air', this.airGain.gain, hum.air, now, COP_HUM.response, 0.01);
      if (this.out.pan) this.to('pan', this.out.pan, clamp(view.pan, -1, 1) * S.pan, now, 0.08, 0.02);
    } catch (error) {
      if (!this.warned) console.warn('[audio] cop audio update failed', error);
      this.warned = true;
    }
  }

  /** The ambush: the close wail's opening, once, at the sting level. */
  sting(now) {
    if (this.disposed) return;
    const buffer = this.buffers.sirenClose;
    if (!buffer) return;
    const S = COP_SIREN;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(S.stingLevel, now + 0.04);
    envelope.gain.setValueAtTime(S.stingLevel, now + S.stingSeconds - 0.6);
    envelope.gain.linearRampToValueAtTime(0, now + S.stingSeconds);
    source.connect(envelope).connect(this.out);
    this.trackShot(source, envelope);
    source.start(now, 0, S.stingSeconds + 0.05);
  }

  /** The paddle's one-shots: 'windup' (rising whoosh), 'swing' (whoosh), 'hit' (thump and slap). */
  paddle(kind, now) {
    const P = COP_PADDLE;
    if (kind === 'windup') this.burst(now, P.windupFromHz, P.windupToHz, P.windupQ, 0.7, P.windupLevel, 0.6);
    else if (kind === 'swing') this.burst(now, P.swingHz, P.swingHz * 0.7, P.swingQ, P.swingSeconds, P.swingLevel, 0.02);
    else {
      this.thump(now, P.hitFromHz, P.hitToHz, P.hitSeconds, P.hitLevel);
      this.burst(now, P.hitNoiseHz, P.hitNoiseHz * 0.8, 0.9, P.hitNoiseSeconds, P.hitLevel * 0.6, 0.004);
    }
  }

  /** Band noise from fromHz to toHz over `seconds`, peaking at `peakAt` s. */
  burst(at, fromHz, toHz, q, seconds, level, peakAt) {
    if (this.disposed || !this.noise) return;
    const c = this.context;
    const source = c.createBufferSource();
    source.buffer = this.noise;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(fromHz, at);
    band.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + peakAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(envelope).connect(this.out);
    this.trackShot(source, band, envelope);
    source.start(at, Math.random() * (this.noise.duration - seconds - 0.05));
    source.stop(at + seconds + 0.02);
  }

  /** A falling sine thump. */
  thump(at, fromHz, toHz, seconds, level) {
    if (this.disposed) return;
    const c = this.context;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(fromHz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(envelope).connect(this.out);
    this.trackShot(osc, envelope);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  trackShot(source, ...nodes) {
    this.oneShots.add(source);
    source.onended = () => {
      if (!this.oneShots.delete(source)) return;
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  /** Silence at once (tab hidden, sound muted). */
  reset(view = null) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    for (const source of this.oneShots) {
      try { source.stop(now); } catch { /* already ended */ }
      source.onended(); // Disconnect now, even if the context is suspended and cannot deliver ended yet.
    }
    this.lastSting = view?.sting ?? -1;
    for (const kind of ['windup', 'swing', 'hit']) this.last[kind] = view ? view[kind] ?? 0 : -1;
    for (const param of [this.farGain.gain, this.closeGain.gain, this.humGain.gain]) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(0, now);
    }
    this.targets = {};
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.loadController.abort();
    for (const source of [...this.sources, this.far, this.close]) {
      try {
        source?.stop();
      } catch { /* never started */ }
    }
    for (const node of this.nodes) node.disconnect();
    this.far?.disconnect();
    this.close?.disconnect();
  }
}
