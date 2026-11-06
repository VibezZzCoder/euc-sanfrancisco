// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/app/oneFootPose.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { ONE_FOOT, RIDER_BLOCKOUT } from '../data/tuning.js';
import { clamp01 } from '../shared/maths.js';
export function createOneFootPose(side = RIDER_BLOCKOUT.oneFootReleaseSide) {
    return {
        oneFoot: 0,
        phase: 0,
        side: side >= 0 ? 1 : -1,
        state: 'idle',
        holdSeconds: 0,
        qualifiedFlight: -1,
    };
}
export function readableWindowSeconds(timing = ONE_FOOT) {
    return timing.enterSeconds
        + timing.readableSeconds
        + timing.returnSeconds
        + timing.touchdownMarginSeconds;
}
export function returnNeededSeconds(state, timing = ONE_FOOT) {
    return state.phase * timing.returnSeconds + timing.touchdownMarginSeconds;
}
export function oneFootQualifiedThisFlight(state, flightIndex) {
    return state.qualifiedFlight === flightIndex;
}
export function resetOneFoot(state) {
    state.oneFoot = 0;
    state.phase = 0;
    state.state = 'idle';
    state.holdSeconds = 0;
    state.qualifiedFlight = -1;
}
export function cancelOneFoot(state) {
    state.holdSeconds = 0;
    state.state = state.phase > 0 ? 'returning' : 'idle';
}
function smoothstep(phase) {
    const p = clamp01(phase);
    return p * p * (3 - 2 * p);
}
function advance(dt, seconds) {
    return seconds > 0 ? dt / seconds : 1;
}
export function stepOneFoot(state, facts, timing = ONE_FOOT) {
    const dt = facts.dt > 0 && Number.isFinite(facts.dt) ? facts.dt : 0;
    const eligible = facts.airborne
        && !facts.crashing
        && !facts.recovering
        && !facts.compressing
        && !facts.countdownFrozen;
    if (!eligible) {
        state.holdSeconds = 0;
        if (state.phase > 0) {
            state.phase = Math.max(0, state.phase - advance(dt, timing.abortSeconds));
            state.state = state.phase > 0 ? 'returning' : 'idle';
        }
        else {
            state.state = 'idle';
        }
        state.oneFoot = smoothstep(state.phase);
        return;
    }
    const qualified = state.qualifiedFlight === facts.flightIndex;
    if (state.phase > 0) {
        const keep = state.state === 'posing'
            && facts.held
            && facts.secondsToTouchdown > returnNeededSeconds(state, timing);
        if (keep) {
            state.phase = Math.min(1, state.phase + advance(dt, timing.enterSeconds));
            state.state = 'posing';
        }
        else {
            state.phase = Math.max(0, state.phase - advance(dt, timing.returnSeconds));
            if (state.phase > 0)
                state.state = 'returning';
            else
                state.state = facts.held && qualified ? 'spent' : 'idle';
        }
        state.holdSeconds = 0;
        state.oneFoot = smoothstep(state.phase);
        return;
    }
    state.oneFoot = 0;
    if (!facts.held) {
        state.holdSeconds = 0;
        state.state = 'idle';
        return;
    }
    if (qualified) {
        state.holdSeconds = 0;
        state.state = 'spent';
        return;
    }
    state.holdSeconds += dt;
    if (state.holdSeconds < timing.holdQualifySeconds - 1e-9) {
        state.state = 'qualifying';
        return;
    }
    if (facts.secondsToTouchdown < readableWindowSeconds(timing)) {
        state.state = 'refused';
        return;
    }
    state.qualifiedFlight = facts.flightIndex;
    state.holdSeconds = 0;
    state.state = 'posing';
    state.phase = Math.min(1, advance(dt, timing.enterSeconds));
    state.oneFoot = smoothstep(state.phase);
}
const scratch = {
    dt: 0,
    held: false,
    airborne: false,
    compressing: false,
    crashing: false,
    recovering: false,
    countdownFrozen: false,
    groundClearance: 0,
    verticalRate: 0,
    secondsToTouchdown: 0,
    flightIndex: 0,
};
export function stepOneFootFromController(state, euc, recoverBlend, dt, held, countdownFrozen, timing = ONE_FOOT) {
    const crashing = euc.crashed;
    const clearance = euc.groundClearance;
    const airborne = clearance > 0 && !crashing;
    scratch.dt = dt;
    scratch.held = held;
    scratch.airborne = airborne;
    scratch.compressing = !airborne && !crashing && !euc.canAcceptHop;
    scratch.crashing = crashing;
    scratch.recovering = recoverBlend < 1;
    scratch.countdownFrozen = countdownFrozen;
    scratch.groundClearance = clearance;
    scratch.verticalRate = euc.verticalRate;
    scratch.secondsToTouchdown = euc.secondsToTouchdown;
    scratch.flightIndex = euc.flightIndex;
    stepOneFoot(state, scratch, timing);
}
