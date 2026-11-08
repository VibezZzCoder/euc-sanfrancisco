// Officer Dorkins' pursuit referee, adapted from euc-newyork@7cf4ce7/js/nemesis-chase.js
// (© 2026 VibezZzCoder, MIT). This module owns rules, not rider or city movement.

export const CHASE_RULES = Object.freeze({
  firstMin: 15, firstMax: 30, againMin: 45, againMax: 100,
  calmSeconds: 4, retrySeconds: 1, sightRange: 110,
  loseSeconds: 12, outrunDistance: 150, outrunSeconds: 6,
  acquireSeconds: 60, leaveSeconds: 8, recoverySeconds: 3,
  warningKnockdowns: 3, leaveMinSeconds: 1.5, bannerSeconds: 2.6,
});

export function createChaseDirector({ rules = CHASE_RULES, random = Math.random } = {}) {
  const r = rules;
  const between = (lo, hi) => lo + (hi - lo) * random();
  const state = {
    phase: 'waiting', wait: between(r.firstMin, r.firstMax), calm: 0,
    acquired: false, sees: false, knockdowns: 0, recovery: 0, chaseTime: 0,
    unseen: 0, far: 0, leaveTime: 0, lastEvent: null, eventAge: Infinity,
  };
  function fire(event) { state.lastEvent = event; state.eventAge = 0; return event; }
  function observePlayer({ crashed = false, recovered = false, displaced = false } = {}) {
    if (state.phase === 'captured') return;
    if (displaced) state.sees = false;
    if (!crashed && !recovered) return;
    if (state.phase === 'waiting') state.calm = r.calmSeconds;
    else if (state.phase === 'chasing') {
      state.recovery = r.recoverySeconds;
      state.unseen = state.far = 0;
    }
  }
  return {
    state,
    observePlayer,
    postpone(seconds = r.retrySeconds) {
      state.phase = 'waiting'; state.wait = seconds; state.lastEvent = null; state.eventAge = Infinity;
    },
    // Called only after the drawn paddle connects and controller.hardKnock accepts it.
    knockedDown() {
      if (state.phase !== 'chasing' || state.recovery > 0) return false;
      state.knockdowns++;
      state.recovery = r.recoverySeconds;
      state.unseen = state.far = 0;
      if (state.knockdowns > r.warningKnockdowns) { state.phase = 'captured'; fire('captured'); }
      else fire('warning');
      return true;
    },
    // Call only after the controller actually accepts a clear release placement.
    release() {
      if (state.phase !== 'captured') return false;
      state.phase = 'waiting'; state.wait = between(r.againMin, r.againMax);
      state.knockdowns = state.recovery = state.unseen = state.far = state.calm = 0;
      state.acquired = state.sees = false; fire('released');
      return true;
    },
    soon() { if (state.phase === 'waiting') { state.wait = 0; state.calm = 0; } },
    update(dt, { riding = false, crashed = false, recovered = false,
      distance = Infinity, sees = false, inView = false } = {}) {
      observePlayer({ crashed, recovered });
      if (!(dt > 0) || !riding || state.phase === 'captured') return null;
      state.eventAge += dt;
      if (state.phase === 'waiting') {
        state.calm = crashed ? r.calmSeconds : Math.max(0, state.calm - dt);
        state.wait -= dt;
        if (state.wait > 0 || state.calm > 0 || crashed) return null;
        state.phase = 'chasing'; state.acquired = state.sees = false;
        state.knockdowns = state.recovery = state.chaseTime = state.unseen = state.far = 0;
        return fire('ambush');
      }
      if (state.phase === 'chasing') {
        state.chaseTime += dt; state.sees = sees;
        if (sees) state.acquired = true;
        let escaped = !state.acquired && state.chaseTime >= r.acquireSeconds;
        if (crashed) state.recovery = r.recoverySeconds;
        else state.recovery = Math.max(0, state.recovery - dt);
        if (crashed || state.recovery > 0) state.unseen = state.far = 0;
        else if (state.acquired) {
          state.unseen = sees ? 0 : state.unseen + dt;
          state.far = !sees && distance > r.outrunDistance ? state.far + dt : 0;
          escaped = state.unseen >= r.loseSeconds && state.far >= r.outrunSeconds;
        }
        if (!escaped) return null;
        state.phase = 'leaving'; state.leaveTime = 0;
        return fire(state.acquired ? 'escaped' : 'missed');
      }
      state.leaveTime += dt;
      if (state.leaveTime < 0 || (state.leaveTime < r.leaveSeconds
        && (state.leaveTime < r.leaveMinSeconds || inView))) return null;
      state.phase = 'waiting'; state.wait = between(r.againMin, r.againMax); state.calm = 0;
      return 'gone';
    },
  };
}

export const CHASE_TEXT = Object.freeze({
  ambush: 'Officer Dorkins is after you!', escaped: 'You lost him',
  captured: 'Busted · off to County Jail', released: 'Released · back to riding',
  paddle: 'Paddle! Hop or swerve', seen: 'Officer Dorkins', incoming: 'Dorkins is closing in',
  recovering: 'Catch your breath · still pursued', unseen: 'Searching · get more distance',
  far: 'Stay hidden · losing him',
});

export function chaseHudView(state, distance, rules = CHASE_RULES, swingPhase = 'idle') {
  let banner = ['ambush', 'escaped', 'warning', 'captured', 'released'].includes(state.lastEvent)
    && state.eventAge < rules.bannerSeconds ? state.lastEvent : null;
  if (swingPhase === 'windup' && state.phase === 'chasing') banner = 'paddle';
  const knockdowns = state.knockdowns, heat = Math.min(rules.warningKnockdowns, knockdowns);
  const hot = knockdowns >= rules.warningKnockdowns;
  const heatText = hot ? `${heat}/${rules.warningKnockdowns} · arrest risk` : `Warnings ${knockdowns}/${rules.warningKnockdowns}`;
  const bannerText = banner === 'warning' ? (hot ? 'Final warning · arrest risk!' : `Warning ${knockdowns}/${rules.warningKnockdowns} · on your feet!`)
    : banner === 'paddle' && hot ? 'Arrest risk! Hop or swerve' : CHASE_TEXT[banner] || '';
  let cue = null, losing = 0;
  if (state.phase === 'chasing') {
    cue = !state.acquired ? 'incoming' : state.recovery > 0 ? 'recovering' : state.sees ? 'seen' : state.far > 0 ? 'far' : 'unseen';
    losing = Math.min(1, state.unseen / rules.loseSeconds, state.far / rules.outrunSeconds);
  }
  return { banner, bannerText, cue, metres: Math.round(Number.isFinite(distance) ? distance : 0),
    losing, knockdowns, heat, hot, heatText };
}
