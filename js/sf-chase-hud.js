// SF chase HUD; adapted from euc-newyork@7cf4ce7/js/nemesis-chase.js, © 2026 VibezZzCoder, MIT.
import { CHASE_TEXT } from './nemesis-chase.js';

export class SfChaseHud {
  constructor(doc) {
    this.nodes = Object.fromEntries(['banner', 'cue', 'text', 'meter', 'heat', 'heat-text'].map((name, i) =>
      [name, doc.getElementById(['hud-chase-banner', 'hud-chase', 'hud-chase-text', 'hud-chase-meter',
        'hud-chase-heat', 'hud-chase-heat-text'][i])]));
    this.last = {};
  }
  set(key, value, write) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(value);
  }
  update(view) {
    const n = this.nodes;
    this.set('banner', view.banner, value => { n.banner.hidden = !value; if (value) n.banner.dataset.kind = value; });
    if (view.banner) this.set('bannerText', view.bannerText, value => { n.banner.textContent = value; });
    this.set('cue', view.cue, value => { n.cue.hidden = !value; if (value) n.cue.dataset.state = value; });
    if (!view.cue) return;
    this.set('hot', view.hot, value => { n.cue.dataset.hot = String(value); });
    this.set('heat', view.heat, value => { n.heat.dataset.level = String(value); });
    this.set('heatText', view.heatText, value => { n['heat-text'].textContent = value; });
    const label = view.cue === 'seen' ? `${CHASE_TEXT.seen} · ${view.metres} m` : CHASE_TEXT[view.cue];
    this.set('text', label, value => { n.text.textContent = value; });
    this.set('meter', Math.round(view.losing * 20), value => { n.meter.style.width = `${value * 5}%`; });
  }
}
