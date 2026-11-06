// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/input/actions.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { INPUT } from '../data/tuning.js';
export const GLOBAL_PRESSED_ACTIONS = new Set([
    'pause',
    'muteAudio',
]);
export const PRESSED_ACTIONS = [
    'hop',
    'swing',
    'reset',
    'cameraCycle',
    'pause',
    'muteAudio',
];
export const NEUTRAL_ACTIONS = Object.freeze({
    throttle: 0,
    steer: 0,
    crouch: false,
    hop: false,
    hopHeld: false,
    swing: false,
    reset: false,
    cameraCycle: false,
    pause: false,
    muteAudio: false,
});
function clampAxis(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(-1, value));
}
function strongerAxis(a, b) {
    return Math.abs(a) >= Math.abs(b) ? a : b;
}
export class ActionState {
    bufferSeconds;
    held = new Map();
    latched = new Map();
    axes = new Map();
    scriptedThrottle = null;
    scriptedSteer = null;
    scriptedCrouch = false;
    scriptedHopHeld = false;
    constructor(bufferSeconds = INPUT.actionBufferSeconds) {
        this.bufferSeconds = bufferSeconds;
    }
    setHeld(action, held, device = 'keyboard') {
        let devices = this.held.get(action);
        if (!devices) {
            if (!held)
                return;
            devices = new Set();
            this.held.set(action, devices);
        }
        if (held)
            devices.add(device);
        else
            devices.delete(device);
    }
    isHeld(action) {
        const devices = this.held.get(action);
        return devices !== undefined && devices.size > 0;
    }
    setAxes(device, throttle, steer) {
        let axes = this.axes.get(device);
        if (!axes) {
            axes = { throttle: 0, steer: 0 };
            this.axes.set(device, axes);
        }
        axes.throttle = clampAxis(throttle);
        axes.steer = clampAxis(steer);
    }
    clearDevice(device) {
        for (const devices of this.held.values())
            devices.delete(device);
        this.axes.delete(device);
    }
    press(action, nowSeconds) {
        this.latched.set(action, nowSeconds);
    }
    isPending(action, nowSeconds) {
        const pressedAt = this.latched.get(action);
        if (pressedAt === undefined)
            return false;
        if (nowSeconds - pressedAt > this.bufferSeconds) {
            this.latched.delete(action);
            return false;
        }
        return true;
    }
    consume(action, nowSeconds) {
        if (!this.isPending(action, nowSeconds))
            return false;
        this.latched.delete(action);
        return true;
    }
    setScripted(actions, nowSeconds) {
        if (actions.throttle !== undefined)
            this.scriptedThrottle = clampAxis(actions.throttle);
        if (actions.steer !== undefined)
            this.scriptedSteer = clampAxis(actions.steer);
        if (actions.crouch !== undefined)
            this.scriptedCrouch = actions.crouch;
        if (actions.hopHeld !== undefined)
            this.scriptedHopHeld = actions.hopHeld;
        for (const action of PRESSED_ACTIONS) {
            const value = actions[action];
            if (value === true)
                this.press(action, nowSeconds);
            else if (value === false)
                this.latched.delete(action);
        }
    }
    clearPending() {
        this.latched.clear();
    }
    clearDevices() {
        this.held.clear();
        this.latched.clear();
        this.axes.clear();
    }
    clearScripted() {
        this.scriptedThrottle = null;
        this.scriptedSteer = null;
        this.scriptedCrouch = false;
        this.scriptedHopHeld = false;
    }
    clearAll() {
        this.held.clear();
        this.latched.clear();
        this.axes.clear();
        this.clearScripted();
    }
    sample(nowSeconds) {
        let deviceThrottle = (this.isHeld('accelerate') ? 1 : 0) - (this.isHeld('brake') ? 1 : 0);
        let deviceSteer = (this.isHeld('steerRight') ? 1 : 0) - (this.isHeld('steerLeft') ? 1 : 0);
        for (const axes of this.axes.values()) {
            deviceThrottle = strongerAxis(deviceThrottle, axes.throttle);
            deviceSteer = strongerAxis(deviceSteer, axes.steer);
        }
        return {
            throttle: this.scriptedThrottle ?? deviceThrottle,
            steer: this.scriptedSteer ?? deviceSteer,
            crouch: this.isHeld('crouch') || this.scriptedCrouch,
            hop: this.isPending('hop', nowSeconds),
            hopHeld: this.isHeld('hopHeld') || this.scriptedHopHeld,
            swing: this.isPending('swing', nowSeconds),
            reset: this.isPending('reset', nowSeconds),
            cameraCycle: this.isPending('cameraCycle', nowSeconds),
            pause: this.isPending('pause', nowSeconds),
            muteAudio: this.isPending('muteAudio', nowSeconds),
        };
    }
}
