/* ============================================================
   flocks.js — flocking live coding library for p5live
   Requires: p5.js + p5.sound
   Quick start:
     f = flock()                 // 20 birds with RANDOM look and
                                 // behavior (ranges: flocks.config.js)
     f.draw()                    // inside draw()
   Then change whatever you want (everything is chainable):
     f.col('red').rad(8).spd(3)  // color, radius, speed
     f.gap(25)                   // comfortable distance between birds (px)
     f.sync(0.8)                 // fly the same way as neighbors (0..1)
     f.wild(0.3)                 // improvisation (0..1)
     f.see(100)                  // how far each bird sees (px)
     f.chase(g)                  // go for the nearest bird of flock g
     f.follow(g, 1, 150)         // orbit the center of g (strength, radius)
     f.flee(g, bass)             // run away from g (strength can be a signal)
     f.r('rad', bass, 2)         // radius: ×1 in silence → ×2 at full bass
     f.r('rad', bass, 2, 20)     // radius: 2 in silence → 20 at full bass
     f.r('hue', mid, 180, 300)   // color reacts too (hue, sat, bri, alpha)
     f.r('spd', beat, 3)         // beat(): a pulse on every bass hit
     f.r('rad', bass.smooth(0.9), 3) // smoothed signal, no jitter
     f.dir(0, 0.2)               // main heading (angle, variability)
     f.shape('drop')             // 'dot' · 'drop' (tail, points where it goes) · 'line'
     f.tail(4).glow(0.8)         // tail length, halo
     f.glide(0.95)               // changes arrive smoothly (0 = jump)
     // tempo is detected from the music: signals phase bar tick lfo(n) tempo
     bpm(128)                    // ...or fix it by hand (bpm('auto') to listen again)
     f.calm()                    // remove ALL sound reactions (a new flock starts with
                                 // 1-3 random ones; your first r() replaces them)
   Audio: bass() mid() treble() amp() beat()  (0..1)
   Audio starts on the first click/tap/key (browser policy).
   You can also call audioStart() by hand.
   ============================================================ */

// ---------- AMBIENT AUDIO (built-in) ----------
let _au = null;

function audioStart() {
  if (_au) return _au;
  try {
    if (typeof userStartAudio === 'function') userStartAudio();
    const mic = new p5.AudioIn();
    mic.start(
      () => console.log('[flocks] mic on'),
      err => console.warn('[flocks] mic failed:', err)
    );
    const fft = new p5.FFT(0.8, 1024);
    fft.setInput(mic);
    _au = { mic, fft };
  } catch (e) {
    console.error('[flocks] could not start audio:', e);
  }
  return _au;
}

// starts on the first user gesture without overriding the sketch's
// own handlers (native listeners always fire)
window.addEventListener('mousedown', audioStart);
window.addEventListener('touchstart', audioStart);
window.addEventListener('keydown', audioStart);

// adaptive normalization with a noise gate:
// - base: room noise floor. Rises VERY slowly (so sustained music
//   isn't eaten) and falls fast → ~0 in silence
// - peak: recent maximum (decays slowly) → quiet music still
//   uses the whole 0..1 range
const _np = {};
for (const e of ['bass', 'mid', 'treble', 'amp']) _np[e] = { base: 0, peak: 0.05 };

function _norm(e, raw) {
  const p = _np[e];
  p.base += (raw - p.base) * (raw < p.base ? 0.02 : 0.0002);
  const gate = p.base * 1.2;
  p.peak = Math.max(p.peak * 0.999, raw, gate + 0.02);
  const g = Math.max(0, raw - gate);                         // noise gate
  return Math.min(1, g / Math.max(p.peak - gate, 0.0001));   // 0..1
}

// frequency ranges (Hz). p5's 'bass' is only 20-140, too narrow
// for small speakers/mics → bass goes from 20 to 800 (covers the
// fundamentals and harmonics of kicks and bass lines)
const _RANGES = { bass: [20, 800], mid: [800, 2600], treble: [2600, 14000] };

// one FFT per frame, however many signals read it
let _specFrame = -1, _spec = null;
function _spectrum() {
  if (frameCount !== _specFrame) { _specFrame = frameCount; _spec = _au.fft.analyze(); }
  return _spec;
}

// band energy = mean of the loudest 20% of bins in the range.
// (getEnergy averages the WHOLE range, so narrow peaks like a kick
// fundamental get diluted among empty bins)
function _bandEnergy(lo, hi) {
  const s = _spectrum();
  const nyq = getAudioContext().sampleRate / 2;
  const i0 = Math.max(0, Math.floor((lo / nyq) * s.length));
  const i1 = Math.min(s.length - 1, Math.ceil((hi / nyq) * s.length));
  const slice = Array.from(s.slice(i0, i1 + 1)).sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(slice.length * 0.2));
  let sum = 0;
  for (let i = 0; i < k; i++) sum += slice[i];
  return sum / k / 255;
}

function _band(e) {
  if (!_au) return 0;
  const [lo, hi] = _RANGES[e];
  return _norm(e, _bandEnergy(lo, hi));
}

// ---------- SIGNALS ----------
// sig(fn) turns any function into a signal: computed once per frame
// (so calling it from many flocks doesn't change the result) and with
// two helpers that return new signals:
//   .smooth(k)        exponential smoothing, k 0..1 (higher = smoother)
//   .beat(thr, decay) 1 when the signal jumps over thr, then fades out
function sig(fn) {
  let fr = -1, v = 0;
  const s = () => {
    if (frameCount !== fr) { fr = frameCount; v = fn(); }
    return v;
  };
  s.smooth = (k = 0.8) => {
    let a = 0;
    return sig(() => (a += (s() - a) * (1 - k)));
  };
  s.beat = (thr = 0.6, decay = 0.85) => {
    let p = 0, armed = true;
    return sig(() => {
      const x = s();
      p *= decay;
      if (armed && x > thr) { p = 1; armed = false; }
      else if (x < thr * 0.7) armed = true; // re-arm once it drops
      return p;
    });
  };
  return s;
}

// ---------- CLOCK (BPM) ----------
// The clock FOLLOWS THE MUSIC by itself (tempo detection, see below).
// bpm(128) fixes the tempo by hand, bpm('auto') goes back to listening.
// tap() = tap tempo: call it on every beat and the clock locks to your taps.
// Signals (0..1):
//   phase    ramp that grows 0 → 1 on every beat
//   bar      ramp 0 → 1 every 4 beats
//   tick     pulse: 1 on the beat, fading to 0 before the next
//   lfo(n)   smooth wave 0 → 1 → 0 over n beats (default 4)
//   tempo    the speed of the music: 60 bpm = 0 … 180 bpm = 1
let _bpm = 120, _beat0 = 0, _beatBase = 0, _taps = [];
function _beats() { _tempoStep(); return _beatBase + ((millis() - _beat0) * _bpm) / 60000; }
function _setBpm(x) { _beatBase = _beats(); _beat0 = millis(); _bpm = x; } // phase keeps going
function bpm(x) {
  if (x === 'auto') { _tAuto = true; _tLock = false; _tCand = 0; return _bpm; }
  if (Number.isFinite(x) && x >= 20 && x <= 400) { _tAuto = false; _setBpm(x); }
  else _tempoStep();
  return _bpm;
}
function tap() {
  _tAuto = false;
  const now = millis();
  if (_taps.length && now - _taps[_taps.length - 1] > 2000) _taps = [];
  _taps.push(now);
  _taps = _taps.slice(-5);
  const b = Math.round(_beats()); // the tap is a downbeat
  if (_taps.length > 1) {
    const iv = (_taps[_taps.length - 1] - _taps[0]) / (_taps.length - 1);
    _bpm = Math.min(400, Math.max(20, 60000 / iv));
  }
  _beatBase = b; _beat0 = now;
  return _bpm;
}

// ---------- TEMPO DETECTION ----------
// 1. onset strength = positive spectral flux (how much new energy per frame),
//    kept in 10 ms slots for the last 8 seconds
// 2. every 0.5 s: autocorrelation of that curve → the repeating period → bpm
//    (tempos near 115 bpm are preferred, to avoid half/double mistakes)
// 3. the clock phase is nudged so its beats fall on the strongest onsets
const _TS = 10, _TN = 800, _TLAG = 50; // slot ms · slots · audio latency ms
let _tAuto = true, _tLock = false, _tConf = 0;
const _tBuf = new Float32Array(_TN);
let _tPrev = null, _tSlot = -1, _tFrame = -1, _tNext = 0, _tCand = 0, _tMax = 30, _tFilled = 0;

function _tempoStep() {
  if (frameCount === _tFrame) return;       // once per frame
  _tFrame = frameCount;
  if (!_au || !_tAuto) return;
  const sp = _spectrum();
  let f = 0;
  if (_tPrev) for (let i = 1; i < 150; i++) { const d = sp[i] - _tPrev[i]; if (d > 0) f += i < 40 ? d * 2 : d; }
  else _tPrev = new Float32Array(150);
  for (let i = 0; i < 150; i++) _tPrev[i] = sp[i];
  _tMax = Math.max(_tMax * 0.995, f, 30);   // quiet rooms don't get amplified
  const v = f / _tMax;
  const slot = Math.floor(millis() / _TS);
  if (_tSlot < 0 || slot - _tSlot > _TN) _tSlot = slot - 1;
  for (let k = _tSlot + 1; k <= slot; k++) { _tBuf[k % _TN] = v; _tFilled = Math.min(_TN, _tFilled + 1); }
  _tSlot = slot;
  if (millis() >= _tNext) { _tNext = millis() + 500; _tEstimate(slot); }
}

function _tEstimate(slot) {
  if (_tFilled < 300) return;               // need at least 3 s of music
  const n = _TN, x = new Float32Array(n), xc = new Float32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) { x[i] = _tBuf[(((slot - n + 1 + i) % n) + n) % n]; m += x[i]; }
  m /= n;
  let r0 = 0;
  for (let i = 0; i < n; i++) { xc[i] = x[i] - m; r0 += xc[i] * xc[i]; }
  if (r0 < 1) { _tLock = false; _tConf = 0; return; }
  const rn = lag => { // normalized autocorrelation
    let r = 0;
    for (let i = lag; i < n; i++) r += xc[i] * xc[i - lag];
    return r / r0 / ((n - lag) / n);
  };
  let best = 0, bestScore = -1;
  for (let lag = 30; lag <= 100; lag++) {   // 200 … 60 bpm
    const b = 6000 / lag, r = rn(lag);
    const score = r * Math.exp(-0.5 * Math.pow(Math.log2(b / 115) / 0.55, 2));
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  const y0 = rn(best - 1), y1 = rn(best), y2 = rn(best + 1);
  const den = y0 - 2 * y1 + y2;
  const lagF = best + (den < 0 ? 0.5 * (y0 - y2) / den : 0); // parabolic peak
  _tConf = y1;
  if (_tConf < 0.1) { _tLock = false; return; }
  const est = 6000 / lagF;
  if (Math.abs(est / _bpm - 1) < 0.05) { _setBpm(_bpm + (est - _bpm) * 0.35); _tCand = 0; _tLock = true; }
  else if (_tCand && Math.abs(est / _tCand - 1) < 0.03) { _setBpm(est); _tCand = 0; _tLock = true; }
  else { _tCand = est; _tLock = false; return; }

  // phase: the comb of beats (period P slots) that catches the most onset energy
  const P = 6000 / _bpm;
  let bi = 0, bs = -1;
  for (let ph = 0; ph < P; ph++) {
    let sum = 0;
    for (let i = ph; i < n; i += P) sum += x[Math.round(i)] ?? 0;
    if (sum > bs) { bs = sum; bi = ph; }
  }
  let i0 = bi; while (i0 + P <= n - 1) i0 += P;       // last beat in the window
  const tb = (slot - (n - 1 - Math.round(i0))) * _TS - _TLAG; // when the beat really sounded
  const b = _beatBase + ((tb - _beat0) * _bpm) / 60000;
  const fr = b - Math.floor(b);
  _beatBase += (fr < 0.5 ? -fr : 1 - fr) * 0.3;        // gentle nudge, no jumps
}

const phase = sig(() => { const b = _beats(); return b - Math.floor(b); });
const bar   = sig(() => { const b = _beats() / 4; return b - Math.floor(b); });
const tick  = sig(() => Math.pow(1 - phase(), 3));
const lfo   = (n = 4) => sig(() => 0.5 - 0.5 * Math.cos((TAU * _beats()) / n));
const tempo = sig(() => { _tempoStep(); return Math.min(1, Math.max(0, (_bpm - 60) / 120)); });

const bass   = sig(() => _band('bass'));
const mid    = sig(() => _band('mid'));
const treble = sig(() => _band('treble'));
const amp    = sig(() => (_au ? _norm('amp', _au.mic.getLevel()) : 0));
const beat   = bass.beat(); // pulse on every bass hit

// any setting can be a number or a signal (bass, () => ...): signals are
// read now; NaN/garbage falls back to d so a typo can't break the birds
function _num(x, d = 0) {
  if (typeof x === 'function') x = x();
  return Number.isFinite(x) ? x : d;
}

// desired direction at magnitude sp, minus current velocity,
// clamped to maxF → steering force
function _steer(dx, dy, vx, vy, sp, maxF) {
  const m = Math.hypot(dx, dy);
  if (m < 0.0001) return [0, 0];
  let sx = (dx / m) * sp - vx, sy = (dy / m) * sp - vy;
  const sm = Math.hypot(sx, sy);
  if (sm > maxF) { sx = (sx / sm) * maxF; sy = (sy / sm) * maxF; }
  return [sx, sy];
}

// color helpers: RGB 0..255 ↔ HSB (h 0..360, s/b 0..100)
function _rgb2hsb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, mx ? (d / mx) * 100 : 0, mx * 100];
}
function _hsb2rgb(h, s, v) {
  s /= 100; v /= 100;
  const f = n => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

// ---------- BIRD ----------
class Bird {
  constructor() {
    this.p = createVector(random(width), random(height));
    this.pp = this.p.copy();     // previous position (for line mode)
    this.v = p5.Vector.random2D().mult(2);
    this.k = random(0.8, 1.2);   // personality: a bit faster or slower than the rest
    this.ph = random(1000);      // personal noise seed (own rhythm and drift)
  }

  // v: this frame's flock values (after sound reactions)
  update(f, others, v) {
    const sp = v.spd * this.k;
    // cruise speed breathes slowly: each bird speeds up and slows down
    const cruise = sp * (0.6 + 0.4 * noise(this.ph, f._t * 2.5));
    this.pp.x = this.p.x; this.pp.y = this.p.y;
    const maxF = Math.max(0.04, sp * 0.08); // gentle turns: wide arcs, no snapping
    let ax = 0, ay = 0;

    if (v.sync || v.gap) { // skip the neighbor loop if both rules are off
      const see = Math.max(v.see, v.gap * 1.5); // must see farther than the gap
      const see2 = see * see;
      let aliX = 0, aliY = 0, gx = 0, gy = 0, n = 0;

      for (const o of others) {
        if (o === this) continue;
        // toroidal distance (the world wraps around)
        let dx = o.p.x - this.p.x, dy = o.p.y - this.p.y;
        if (dx >  width / 2) dx -= width;  else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
        const d2 = dx * dx + dy * dy;
        if (d2 > see2 || d2 < 0.0001) continue;
        aliX += o.v.x; aliY += o.v.y; // sync: mean velocity
        n++;
        if (v.gap) { // gap: a spring toward the comfortable distance
          const d = Math.sqrt(d2);
          const k = d < v.gap ? 3 * (d - v.gap) / v.gap   // too close: push (stronger, -3..0)
                              : 0.3 * (d - v.gap) / Math.max(1, see - v.gap); // too far: pull (gentle, 0..0.3)
          gx += (dx / d) * k; gy += (dy / d) * k;
        }
      }

      if (n > 0) {
        if (v.sync) {
          const [sx, sy] = _steer(aliX, aliY, this.v.x, this.v.y, cruise, maxF);
          ax += sx * v.sync * 2; ay += sy * v.sync * 2;
        }
        if (v.gap && (gx || gy)) {
          const [sx, sy] = _steer(gx, gy, this.v.x, this.v.y, cruise, maxF);
          ax += sx * 2; ay += sy * 2;
        }
      }
    }
    // relations with other flocks: chase (go for the nearest) or flee (run away)
    for (const rel of v.rels) {
      if (!rel.w) continue;
      if (rel.kind === 'follow') { // orbit the center of the other flock (cheap: one center per frame)
        let dx = rel.cx - this.p.x, dy = rel.cy - this.p.y;
        if (dx >  width / 2) dx -= width;  else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
        const d = Math.hypot(dx, dy);
        if (d < 0.0001) continue;
        // radial: toward the ring at distance r (push out if inside, pull in if outside)
        const rad = constrain((d - rel.r) / rel.r, -1, 1);
        // tangential: go around the center
        const tx = -dy / d, ty = dx / d;
        const [sx, sy] = _steer((dx / d) * rad + tx * 0.9, (dy / d) * rad + ty * 0.9,
                                this.v.x, this.v.y, cruise, maxF * 1.5);
        ax += sx * rel.w * 2; ay += sy * rel.w * 2;
        continue;
      }
      let bx = 0, by = 0, bd2 = rel.range * rel.range, found = false;
      for (const o of rel.flock.birds) {
        if (o === this) continue;
        let dx = o.p.x - this.p.x, dy = o.p.y - this.p.y;
        if (dx >  width / 2) dx -= width;  else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd2 && d2 > 0.0001) { bd2 = d2; bx = dx; by = dy; found = true; }
      }
      if (!found) continue;
      // fleeing gets stronger the closer the danger is; chasing is steady
      const near = 1 - Math.sqrt(bd2) / rel.range;
      const sgn = rel.kind === 'flee' ? -1 : 1;
      const [sx, sy] = _steer(sgn * bx, sgn * by, this.v.x, this.v.y,
                              rel.kind === 'flee' ? sp * 1.1 : cruise, maxF * 2);
      const k = rel.w * 2 * (rel.kind === 'flee' ? 0.4 + near : 1);
      ax += sx * k; ay += sy * k;
    }
    if (v.wild) { // improvisation: a smooth heading that drifts by itself.
                  // Field noise (shared by neighbors, so groups curve together)
                  // + personal noise (each bird its own whim)
      const a = noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) * TAU * f._swl
              + (noise(this.ph + 50, f._t * 3) - 0.5) * 2;
      const [sx, sy] = _steer(Math.cos(a), Math.sin(a), this.v.x, this.v.y, cruise, maxF);
      ax += sx * v.wild * 2; ay += sy * v.wild * 2;
    }
    if (v.wD) { // main heading following a noise field:
                // dvr = 0 → almost straight, dvr = 1 → very variable
      const a = v.dir + (noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) - 0.5) * TAU * v.dvr;
      const [sx, sy] = _steer(Math.cos(a), Math.sin(a), this.v.x, this.v.y, cruise, maxF);
      ax += sx * v.wD; ay += sy * v.wD;
    }

    this.v.x += ax; this.v.y += ay;
    const vm = Math.hypot(this.v.x, this.v.y), top = sp * 1.15; // short bursts allowed
    if (vm > top) { this.v.x = (this.v.x / vm) * top; this.v.y = (this.v.y / vm) * top; }
    this.p.x = (this.p.x + this.v.x + width)  % width;  // torus/wrap
    this.p.y = (this.p.y + this.v.y + height) % height;
    // a bad value got through (NaN): respawn instead of staying broken
    if (!Number.isFinite(this.p.x + this.p.y + this.v.x + this.v.y)) this._respawn();
  }

  _respawn() {
    this.p.set(random(width), random(height));
    this.pp.set(this.p);
    this.v = p5.Vector.random2D().mult(2);
  }

  draw(r, lineMode) {
    if (lineMode) { // continuous stroke: weight = circle diameter
      // if the bird just wrapped, don't draw a stroke across the screen
      if (Math.abs(this.p.x - this.pp.x) < width / 2 &&
          Math.abs(this.p.y - this.pp.y) < height / 2) {
        line(this.pp.x, this.pp.y, this.p.x, this.p.y);
      }
    } else {
      circle(this.p.x, this.p.y, r * 2);
    }
  }
}

// ---------- RANDOM DEFAULTS ----------
// ranges come from flocks.config.js (FLOCKS_CONFIG); these are the fallback
const _CFG_DEFAULT = {
  rad: [2, 8], spd: [2.5, 5], gap: [12, 50], sync: [0, 0.9], wild: [0.1, 0.6],
  see: [50, 120], shape: ['drop', 'drop', 'dot', 'line'], tail: [1.5, 5], glow: [0, 1],
  color: { hue: [0, 360], sat: [35, 90], bri: [75, 100], alpha: [170, 255] },
  react: {
    count: [1, 3], lfo: [2, 16],
    signals: ['bass', 'mid', 'treble', 'beat', 'tick', 'lfo', 'tempo'],
    props: { rad: [1.5, 3], spd: [1.3, 2.5], glow: [1.5, 3], tail: [1.5, 3],
             wild: [2, 5], hue: [60, 240] },
  },
};
const _rr = (r, d) => { // [min, max] → random in between · number → itself
  r = r ?? d;
  return Array.isArray(r) ? random(r[0], r[1]) : r;
};
// random sound reactions: a few props, each moved by a random signal
// (flocks.config.js → react). The first r() you write replaces them.
function _rollReactions(c, d, hue0) {
  const n = Math.round(_rr(c.count, d.count));
  const props = c.props ?? d.props, names = Object.keys(props);
  const sigs = c.signals ?? d.signals;
  const sigOf = name => {
    if (name === 'lfo') return lfo(Math.max(1, Math.round(_rr(c.lfo, d.lfo))));
    return { bass, mid, treble, beat, tick, phase, bar, amp, tempo }[name];
  };
  const out = [];
  for (let i = names.length - 1; i > 0; i--) { // shuffle the props
    const j = Math.floor(random(i + 1)); [names[i], names[j]] = [names[j], names[i]];
  }
  for (const prop of names.slice(0, Math.max(0, n))) {
    const fn = sigOf(sigs[Math.floor(random(sigs.length))]);
    if (!fn) continue;
    const x = _rr(props[prop], 2);
    out.push(prop === 'hue'
      ? { prop, fn, a: hue0, b: hue0 + x }   // color moves x degrees with the signal
      : { prop, fn, a: x });                 // multiplier: ×1 in silence → ×x
  }
  return out;
}

// one roll of starting values for a new flock
function _rollDefaults() {
  const c = (typeof FLOCKS_CONFIG !== 'undefined' && FLOCKS_CONFIG) || {};
  const D = _CFG_DEFAULT, cc = c.color || {}, dc = D.color;
  const hue0 = _rr(cc.hue, dc.hue);
  const [r, g, b] = _hsb2rgb(hue0, _rr(cc.sat, dc.sat), _rr(cc.bri, dc.bri));
  return {
    rad: _rr(c.rad, D.rad), spd: _rr(c.spd, D.spd), gap: _rr(c.gap, D.gap),
    sync: _rr(c.sync, D.sync), wild: _rr(c.wild, D.wild), see: _rr(c.see, D.see),
    shape: (() => { const l = c.shape ?? D.shape; return Array.isArray(l) ? l[Math.floor(random(l.length))] : l; })(),
    tail: _rr(c.tail, D.tail), glow: _rr(c.glow, D.glow),
    col: [r, g, b, _rr(cc.alpha, dc.alpha)],
    rx: _rollReactions(c.react || {}, D.react, hue0),
  };
}

// ---------- FLOCK ----------
let _lastFlock = null; // most recently created flock (keyboard shortcuts act on it)

// props r() can move. Numbers are multiplied; colors use HSB ranges
const _NUM_PROPS = ['rad', 'spd', 'wild', 'see', 'gap', 'sync', 'glow', 'tail'];
const _COL_PROPS = ['hue', 'sat', 'bri', 'alpha'];

class Flock {
  constructor(n = 20, o = {}) {
    this.birds = [];
    this._t = random(1000);
    this._roll = _rollDefaults(); // random starting values, kept for re-runs
    this._reset(o);
    this.add(n);
    _lastFlock = this;
  }

  // every setting back to its default (used by the constructor and
  // when a re-run reuses this flock, so deleted calls stop applying)
  _reset(o = {}) {
    this.col(o.col ?? color(...this._roll.col)); // color
    this._rad = o.rad ?? this._roll.rad;        // radius
    this._spd = o.spd ?? this._roll.spd;        // base (and max) speed
    this._nsc = o.nsc ?? 0.005;    // noise scale (drift)
    this._swl = o.swl ?? 2;        // turns of the noise field
    this._dt  = o.dt  ?? 0.004;    // noise time speed
    // flocking rules. Starting values are random (flocks.config.js);
    // gap(0) and sync(0) turn the rules off
    this._gap  = o.gap  ?? this._roll.gap;      // comfortable distance in px (0 = off)
    this._sync = o.sync ?? this._roll.sync;      // fly like the neighbors, 0..1
    this._wild = o.wild ?? this._roll.wild;    // improvisation, 0..1
    this._see  = o.see  ?? this._roll.see;     // how far each bird sees, px
    this._dir = o.dir ?? 0;        // main heading (angle in radians)
    this._dvr = o.dvr ?? 0.5;      // field variability (0 = almost straight)
    this._wD  = o.wDir ?? 0;       // heading weight (0 = off)
    this._shape = o.shape ?? this._roll.shape; // 'dot' · 'drop' (oriented, with tail) · 'line'
    this._tail = o.tail ?? this._roll.tail;    // tail length (drop)
    this._glow = o.glow ?? this._roll.glow;    // halo, 0..1
    this._glide = o.glide ?? 0.92;             // how smoothly changes arrive (0 = jump)
    this._rel = [];                // relations with other flocks: {flock, w, kind}
    // sound reactions {prop, fn, a, b}: a few RANDOM ones at the start
    // (flocks.config.js → react). Your first r() replaces them; calm() removes them
    this._rx  = this._roll.rx.map(x => ({ ...x }));
    this._rxAuto = this._rx.length > 0;
    return this;
  }

  // --- dynamic ---
  add(n = 1)    { for (let i = 0; i < n; i++) this.birds.push(new Bird()); return this; }
  remove(n = 1) { this.birds.splice(Math.max(0, this.birds.length - n), n); return this; }
  count(n)      { const d = n - this.birds.length; return d > 0 ? this.add(d) : this.remove(-d); }

  // --- look (chainable) ---
  col(c) {
    this._col = c;
    const l = color(c).levels;     // any p5 color input → RGBA 0..255
    this._hsb = _rgb2hsb(l[0], l[1], l[2]);
    this._alpha = l[3];
    return this;
  }
  rad(r) { this._rad = r; return this; }
  spd(s) { this._spd = s; return this; }
  nsc(s) { this._nsc = s; return this; }
  swl(s) { this._swl = s; return this; }
  // --- flocking ---
  gap(px)  { this._gap  = px; return this; }  // comfortable distance (0 = off)
  sync(x)  { this._sync = x;  return this; }  // fly the same way (0..1)
  wild(x)  { this._wild = x;  return this; }  // improvisation (0..1)
  see(px)  { this._see  = px; return this; }  // how far they see
  // center of the flock (the world wraps, so average the angles on the circle)
  _center() {
    let sx = 0, cx = 0, sy = 0, cy = 0;
    for (const b of this.birds) {
      const ax = (b.p.x / width) * TAU, ay = (b.p.y / height) * TAU;
      sx += Math.sin(ax); cx += Math.cos(ax); sy += Math.sin(ay); cy += Math.cos(ay);
    }
    const w = (Math.atan2(sx, cx) + TAU) % TAU, h = (Math.atan2(sy, cy) + TAU) % TAU;
    return { cx: (w / TAU) * width, cy: (h / TAU) * height };
  }

  // --- relations with other flocks ---
  // w: strength (1 by default); it can be a signal: chase(a, bass)
  chase(other, w = 1) { if (other && other !== this) this._rel.push({ flock: other, w, kind: 'chase' }); return this; }
  flee(other, w = 1)  { if (other && other !== this) this._rel.push({ flock: other, w, kind: 'flee' });  return this; }
  // orbit around the center of another flock · w: strength · r: orbit radius in px
  // (both can be signals: follow(g, 1, () => 80 + bass() * 200))
  follow(other, w = 1, r = 120) { if (other && other !== this) this._rel.push({ flock: other, w, r, kind: 'follow' }); return this; }
  // --- main heading (noise field) ---
  // a: angle in radians · v: variability 0..1 (0 = almost a
  // straight line, 1 = very variable) · w: steering weight (1 by
  // default; 0 or dirOff() turns it off)
  dir(a, v, w = 1) {
    this._dir = a;
    if (v !== undefined) this._dvr = v;
    this._wD = w;
    return this;
  }
  dirOff() { this._wD = 0; return this; }
  // --- drawing ---
  line(on = true) { this._shape = on ? 'line' : 'dot'; return this; } // continuous strokes
  shape(s) { // 'dot' · 'drop' (points where it goes, with a tail) · 'line'
    if (!['dot', 'drop', 'line'].includes(s)) { console.warn(`[flocks] shape(): use 'dot', 'drop' or 'line'`); return this; }
    this._shape = s; return this;
  }
  tail(x) { this._tail = x; return this; }   // tail length of 'drop'
  glow(x) { this._glow = x; return this; }   // halo around each bird (0..1)
  // how smoothly changes arrive: 0 = jump, 0.92 = default, 0.98 = very slow
  glide(g) { this._glide = g; return this; }
  // --- sound reactions ---
  calm() { this._rx = []; this._rxAuto = false; return this; } // remove ALL sound reactions
  // set* aliases
  setColor(c)  { return this.col(c); }
  setRadius(r) { return this.rad(r); }
  setSpeed(s)  { return this.spd(s); }
  setNoise(s)  { return this.nsc(s); }

  // --- react to audio (or any function) ---
  // fn: bass / mid / treble / amp / beat / () => ... (0..1)
  // r(prop, fn, x)         multiplier: ×1 when fn = 0 → ×x when fn = 1
  // r(prop, fn, min, max)  range: min when fn = 0 → max when fn = 1
  // prop: 'rad' 'spd' 'wild' 'see' 'gap' 'sync'
  //       'hue' (0..360) 'sat' 'bri' (0..100) 'alpha' (0..255)
  r(prop, fn, a = 2, b) {
    if (!_NUM_PROPS.includes(prop) && !_COL_PROPS.includes(prop)) {
      console.warn(`[flocks] r(): unknown prop '${prop}', use one of: ` +
        [..._NUM_PROPS, ..._COL_PROPS].join(', '));
      return this;
    }
    if (this._rxAuto) { this._rx = []; this._rxAuto = false; } // your reactions replace the random ones
    this._rx.push({ prop, fn, a, b });
    return this;
  }

  _vals() {
    // targets (numbers or signals) → values that glide toward them
    const [hue, sat, bri] = this._hsb;
    const t = {
      rad: _num(this._rad, 6), spd: _num(this._spd, 2), wild: _num(this._wild),
      see: _num(this._see, 70), gap: _num(this._gap), sync: _num(this._sync),
      glow: _num(this._glow), tail: _num(this._tail),
      hue, sat, bri, alpha: this._alpha,
    };
    const c = this._cur || (this._cur = { ...t }); // first frame: no glide
    const k = 1 - constrain(this._glide, 0, 0.999);
    for (const p in t) {
      if (p === 'hue') { // shortest way around the color wheel
        const d = ((t.hue - c.hue + 540) % 360) - 180;
        c.hue = (c.hue + d * k + 360) % 360;
      } else {
        c[p] += (t[p] - c[p]) * k;
        if (Math.abs(t[p] - c[p]) < 0.001 * (1 + Math.abs(t[p]))) c[p] = t[p];
      }
    }
    const v = {
      ...c,
      rels: this._rel.map(r => ({
        flock: r.flock, kind: r.kind, w: Math.max(0, _num(r.w, 1)),
        range: Math.max(1, c.see * 2),
        r: Math.max(1, _num(r.r, 120)),
        ...(r.kind === 'follow' ? r.flock._center() : {}),
      })),
      dir: _num(this._dir), dvr: _num(this._dvr, 0.5), wD: _num(this._wD),
    };
    for (const { prop, fn, a, b } of this._rx) {
      const s = _num(fn);
      const x = b === undefined ? v[prop] * (1 + s * (a - 1)) : a + s * (b - a);
      if (Number.isFinite(x)) v[prop] = x;
    }
    for (const p of _NUM_PROPS) v[p] = Math.max(0, v[p]);
    v.see = Math.max(1, v.see);
    v.hue = ((v.hue % 360) + 360) % 360;
    v.sat = constrain(v.sat, 0, 100);
    v.bri = constrain(v.bri, 0, 100);
    v.alpha = constrain(v.alpha, 0, 255);
    return v;
  }

  // neighbor candidates through a spatial grid: each bird only looks at
  // the 3×3 cells around it (cells are at least `per` wide), so the cost
  // grows with the number of birds, not with its square
  _neighbors(per) {
    const cols = Math.floor(width / per), rows = Math.floor(height / per);
    if (cols < 3 || rows < 3) return () => this.birds; // big radius: check everyone
    const cw = width / cols, ch = height / rows;
    const grid = Array.from({ length: cols * rows }, () => []);
    const cell = b => [constrain(Math.floor(b.p.x / cw), 0, cols - 1) || 0,
                       constrain(Math.floor(b.p.y / ch), 0, rows - 1) || 0];
    for (const b of this.birds) {
      const [cx, cy] = cell(b);
      grid[cy * cols + cx].push(b);
    }
    const out = [];
    return b => {
      const [cx, cy] = cell(b);
      out.length = 0;
      for (let j = -1; j <= 1; j++) {
        const y = (cy + j + rows) % rows;
        for (let i = -1; i <= 1; i++) {
          const x = (cx + i + cols) % cols;
          for (const o of grid[y * cols + x]) out.push(o);
        }
      }
      return out;
    };
  }

  update() {
    this._t += this._dt;
    const v = this._v = this._vals();
    const near = this._neighbors(Math.max(v.see, v.gap * 1.5));
    for (const b of this.birds) b.update(this, near(b), v);
    return this;
  }

  draw() {
    this.update();
    const v = this._v;
    const [r, g, b] = _hsb2rgb(v.hue, v.sat, v.bri);
    if (this._shape === 'line') {
      stroke(color(r, g, b, v.alpha)); strokeWeight(v.rad * 2); noFill();
      for (const bd of this.birds) bd.draw(v.rad, true);
      return this;
    }
    // dot / drop: one path per layer for ALL birds (fast), halo first
    const ctx = drawingContext, a = v.alpha / 255;
    const tk = this._shape === 'drop' ? v.tail : 0;
    ctx.save();
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    if (v.glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [sc, al] of [[3.2, 0.06], [2.2, 0.1], [1.5, 0.16]]) {
        ctx.globalAlpha = Math.min(1, a * al * v.glow * 2);
        this._path(ctx, v.rad * sc, tk, sc);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = a;
    this._path(ctx, v.rad, tk, 1);
    ctx.fill();
    ctx.restore();
    return this;
  }

  // every bird as a dot or a drop (head + tail pointing back, along its velocity)
  _path(ctx, R, tk, sc) {
    ctx.beginPath();
    for (const b of this.birds) {
      const x = b.p.x, y = b.p.y;
      if (tk <= 0) { ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU); continue; }
      const ang = Math.atan2(b.v.y, b.v.x);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const L = R + Math.hypot(b.v.x, b.v.y) * tk * 2 * (1 + (sc - 1) * 0.3);
      ctx.moveTo(x + R * sa, y - R * ca);                   // side of the head
      ctx.arc(x, y, R, ang - Math.PI / 2, ang + Math.PI / 2); // front half
      ctx.lineTo(x - ca * L, y - sa * L);                   // tip of the tail
      ctx.closePath();
    }
  }
}

// ---------- TRAIL ----------
let _trail = 12; // background alpha per frame: less = longer trail

// a: 0..1 (fraction) or 0..255 (alpha). trail(0) = infinite trail.
function trail(a) { _trail = a <= 1 ? a * 255 : a; }
// paints the background with the current trail; call it in draw() instead of background()
// With very low alpha the 8-bit rounding leaves a gray ghost that never fades,
// so a long trail paints a stronger fade every few frames instead (same average
// speed, much cleaner black).
function fade(c = 0) {
  if (_trail <= 0) return;                      // trail(0): endless
  if (_trail >= 14) { background(c, _trail); return; }
  const k = Math.ceil(14 / _trail);
  if (frameCount % k === 0) background(c, Math.min(255, _trail * k));
}

// ---------- SOUND METER (for testing) ----------
// bass / mid / treble / amp / beat bars (already normalized and gated).
// Call it in draw(), e.g. soundMeter()
function soundMeter(x = 12, y = 12, w = 130, h = 60) {
  const bands = [
    ['bass',   bass(),   '#ff5c8a'],
    ['mid',    mid(),    '#ffd25c'],
    ['treble', treble(), '#5cd6ff'],
    ['amp',    amp(),    '#cccccc'],
    ['beat',   beat(),   '#ffffff'],
  ];
  push();
  noStroke();
  const bw = w / bands.length;
  for (let i = 0; i < bands.length; i++) {
    const [name, v, c] = bands[i];
    fill(255, 25);                                   // bar background
    rect(x + i * bw, y, bw - 4, h);
    fill(c);                                         // level
    rect(x + i * bw, y + h * (1 - v), bw - 4, h * v);
    fill(255, 180);
    textSize(9);
    textAlign(CENTER, TOP);
    text(name, x + i * bw + (bw - 4) / 2, y + h + 4);
  }
  pop();
}

// ---------- FACTORY ----------
// flocks created inside the editor's init() are matched by order
// (1st flock() call ↔ 1st flock of the previous run, ...) or by name,
// and reused: settings start from the defaults again but the birds
// keep their positions, so re-running doesn't make them jump.
//   flock(30)            reused by order
//   flock('river', 30)   reused by name (survives reordering the code)
// Outside the editor (no _newRun() calls) every flock() is a new one.
const _flocks = new Map();
let _slot = 0, _inRun = false;

function _newRun() { _slot = 0; _inRun = true; }

function flock(a, b, c) {
  const named = typeof a === 'string';
  const n = (named ? b : a) ?? 20;
  const o = (named ? c : b) ?? {};
  if (!_inRun) return new Flock(n, o);
  const key = named ? 'name:' + a : 'slot:' + _slot++;
  let f = _flocks.get(key);
  if (f) { f._reset(o).count(n); _lastFlock = f; }
  else { f = new Flock(n, o); _flocks.set(key, f); }
  return f;
}
