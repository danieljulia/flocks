/* ============================================================
   flocks.js — flocking live coding library for p5live
   Requires: p5.js + p5.sound
   Quick start:
     f = flock()                 // 20 birds wandering on a noise
                                 // field. Simple on purpose: no
                                 // flocking rules, no sound reaction
     f.draw()                    // inside draw()
   Then change whatever you want (everything is chainable):
     f.col('red').rad(8).spd(3)  // color, radius, speed
     f.flocking()                // turn on the classic boid rules
     f.coh(2).ali(1).sep(3)      // ...or tune each rule on its own
     f.per(100)                  // how far each bird sees
     f.r('rad', bass, 2)         // radius: ×1 in silence → ×2 at full bass
     f.r('spd', treble, 3)       // r(prop, signal, max multiplier)
                                 //   prop: 'rad' | 'spd' | 'wnd'
     f.dir(0, 0.2)               // main heading (angle, variability)
     f.line()                    // continuous strokes instead of circles
     f.calm()                    // remove ALL sound reactions
   Audio: bass() mid() treble() amp()  (normalized 0..1)
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

// band energy = mean of the loudest 20% of bins in the range.
// (getEnergy averages the WHOLE range, so narrow peaks like a kick
// fundamental get diluted among empty bins)
function _bandEnergy(lo, hi) {
  const s = _au.fft.analyze();
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
const bass   = () => _band('bass');
const mid    = () => _band('mid');
const treble = () => _band('treble');
const amp    = () => (_au ? _norm('amp', _au.mic.getLevel()) : 0);

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

// ---------- BIRD ----------
class Bird {
  constructor(f) {
    this.f = f;
    this.p = createVector(random(width), random(height));
    this.pp = this.p.copy();     // previous position (for line mode)
    this.v = p5.Vector.random2D().mult(2);
  }

  update(others, sp, wnd = this.f._wnd) {
    const f = this.f;
    this.pp.x = this.p.x; this.pp.y = this.p.y;
    const maxF = Math.max(0.05, sp * 0.15);
    let ax = 0, ay = 0;

    if (f._wA || f._wC || f._wS) { // skip the neighbor loop if no rules are on
      const perR2 = f._per * f._per;
      const sepR2 = perR2 * 0.16; // separation = 40% of perception
      let aliX = 0, aliY = 0, cohX = 0, cohY = 0, sepX = 0, sepY = 0;
      let n = 0, ns = 0;

      for (const o of others) {
        if (o === this) continue;
        // toroidal distance (the world wraps around)
        let dx = o.p.x - this.p.x, dy = o.p.y - this.p.y;
        if (dx >  width / 2) dx -= width;  else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
        const d2 = dx * dx + dy * dy;
        if (d2 > perR2) continue;
        aliX += o.v.x; aliY += o.v.y; // alignment: mean velocity
        cohX += dx;    cohY += dy;    // cohesion: toward the group center
        n++;
        if (d2 < sepR2 && d2 > 0.0001) { // separation: push away
          const d = Math.sqrt(d2);
          sepX -= dx / (d * d); sepY -= dy / (d * d);
          ns++;
        }
      }

      if (n > 0) {
        if (f._wA) {
          const [sx, sy] = _steer(aliX, aliY, this.v.x, this.v.y, sp, maxF);
          ax += sx * f._wA; ay += sy * f._wA;
        }
        if (f._wC) {
          const [sx, sy] = _steer(cohX, cohY, this.v.x, this.v.y, sp, maxF);
          ax += sx * f._wC; ay += sy * f._wC;
        }
      }
      if (ns > 0 && f._wS) {
        const [sx, sy] = _steer(sepX, sepY, this.v.x, this.v.y, sp, maxF);
        ax += sx * f._wS; ay += sy * f._wS;
      }
    }
    if (wnd) { // noise drift (organic wandering)
      const a = noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) * TAU * f._swl;
      ax += Math.cos(a) * wnd;
      ay += Math.sin(a) * wnd;
    }
    if (f._wD) { // main heading following a noise field:
                 // _dvr = 0 → almost straight, _dvr = 1 → very variable
      const a = f._dir + (noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) - 0.5) * TAU * f._dvr;
      const [sx, sy] = _steer(Math.cos(a), Math.sin(a), this.v.x, this.v.y, sp, maxF);
      ax += sx * f._wD; ay += sy * f._wD;
    }

    this.v.x += ax; this.v.y += ay;
    const vm = Math.hypot(this.v.x, this.v.y);
    if (vm > sp) { this.v.x = (this.v.x / vm) * sp; this.v.y = (this.v.y / vm) * sp; }
    this.p.x = (this.p.x + this.v.x + width)  % width;  // torus/wrap
    this.p.y = (this.p.y + this.v.y + height) % height;
  }

  draw(r) {
    const f = this.f;
    if (f._line) { // continuous stroke: weight = circle diameter
      // if the bird just wrapped, don't draw a stroke across the screen
      if (Math.abs(this.p.x - this.pp.x) < width / 2 &&
          Math.abs(this.p.y - this.pp.y) < height / 2) {
        stroke(f._col);
        strokeWeight(r * 2);
        line(this.pp.x, this.pp.y, this.p.x, this.p.y);
      }
    } else {
      circle(this.p.x, this.p.y, r * 2);
    }
  }
}

// ---------- FLOCK ----------
let _lastFlock = null; // most recently created flock (keyboard shortcuts act on it)

class Flock {
  constructor(n = 20, o = {}) {
    this.birds = [];
    this._col = o.col ?? 255;      // color
    this._rad = o.rad ?? 6;        // radius
    this._spd = o.spd ?? 2;        // base (and max) speed
    this._nsc = o.nsc ?? 0.005;    // noise scale (drift)
    this._swl = o.swl ?? 2;        // turns of the noise field
    this._dt  = o.dt  ?? 0.004;    // noise time speed
    this._t   = random(1000);
    // flocking rules (Reynolds boids). All OFF by default:
    // a new flock just wanders. Turn them on with flocking()
    // or one by one with coh() / ali() / sep()
    this._per = o.per ?? 70;       // neighbor perception radius
    this._wC  = o.coh ?? 0;        // cohesion weight   (pull to the group)
    this._wA  = o.ali ?? 0;        // alignment weight  (follow neighbors)
    this._wS  = o.sep ?? 0;        // separation weight (avoid crowding)
    this._wnd = o.wnd ?? 0.3;      // noise drift weight (0 = pure boids)
    this._dir = o.dir ?? 0;        // main heading (angle in radians)
    this._dvr = o.dvr ?? 0.5;      // field variability (0 = almost straight)
    this._wD  = o.wDir ?? 0;       // heading weight (0 = off)
    this._line = o.line ?? false;  // continuous stroke instead of circles
    this._rx  = [];                // sound reactions: {prop, fn, amt}
                                   // empty: NO reactions by default;
                                   // add them with r()
    this.add(n);
    _lastFlock = this;
  }

  // --- dynamic ---
  add(n = 1)    { for (let i = 0; i < n; i++) this.birds.push(new Bird(this)); return this; }
  remove(n = 1) { this.birds.splice(Math.max(0, this.birds.length - n), n); return this; }

  // --- look (chainable) ---
  col(c) { this._col = c; return this; }
  rad(r) { this._rad = r; return this; }
  spd(s) { this._spd = s; return this; }
  nsc(s) { this._nsc = s; return this; }
  swl(s) { this._swl = s; return this; }
  // --- flocking rules ---
  per(r) { this._per = r; return this; }   // perception radius
  coh(w) { this._wC  = w; return this; }   // pull to the group
  ali(w) { this._wA  = w; return this; }   // align with neighbors
  sep(w) { this._wS  = w; return this; }   // keep distance
  wnd(w) { this._wnd = w; return this; }   // noise drift
  // classic boids in one call: flocking() on, flocking(0) off,
  // flocking(2) twice as strong
  flocking(w = 1) { return this.coh(w).ali(w).sep(w * 1.5); }
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
  line(on = true) { this._line = on; return this; } // continuous strokes
  // --- sound reactions ---
  calm() { this._rx = []; return this; } // remove ALL sound reactions
  // set* aliases
  setColor(c)  { return this.col(c); }
  setRadius(r) { return this.rad(r); }
  setSpeed(s)  { return this.spd(s); }
  setNoise(s)  { return this.nsc(s); }

  // --- react to audio (or any function) ---
  // prop: 'rad' | 'spd' | 'wnd'   fn: bass / mid / treble / amp / () => ...
  // amt = max multiplier: final = base × (1 + fn()·(amt-1))
  // r('rad', mid, 3) → radius goes from ×1 (silence) to ×3 (mid = 1)
  r(prop, fn, amt = 2) {
    if (!['rad', 'spd', 'wnd'].includes(prop)) {
      console.warn(`[flocks] r(): unknown prop '${prop}', use 'rad', 'spd' or 'wnd'`);
      return this;
    }
    this._rx.push({ prop, fn, amt });
    return this;
  }

  _vals() {
    const v = { rad: this._rad, spd: this._spd, wnd: this._wnd };
    for (const { prop, fn, amt } of this._rx) {
      v[prop] = Math.max(0, v[prop] * (1 + fn() * (amt - 1)));
    }
    return v;
  }

  update() {
    this._t += this._dt;
    const { spd, wnd } = this._vals();
    for (const b of this.birds) b.update(this.birds, spd, wnd);
    return this;
  }

  draw() {
    this.update();
    const { rad } = this._vals();
    noStroke();
    fill(this._col);
    for (const b of this.birds) b.draw(rad);
    return this;
  }
}

// ---------- TRAIL ----------
let _trail = 12; // background alpha per frame: less = longer trail

// a: 0..1 (fraction) or 0..255 (alpha). trail(0) = infinite trail.
function trail(a) { _trail = a <= 1 ? a * 255 : a; }
// paints the background with the current trail; call it in draw() instead of background()
function fade(c = 10) { background(c, _trail); }

// ---------- SOUND METER (for testing) ----------
// bass / mid / treble / amp bars (already normalized and gated).
// Call it in draw(), e.g. soundMeter()
function soundMeter(x = 12, y = 12, w = 110, h = 60) {
  const bands = [
    ['bass',   bass(),   '#ff5c8a'],
    ['mid',    mid(),    '#ffd25c'],
    ['treble', treble(), '#5cd6ff'],
    ['amp',    amp(),    '#cccccc'],
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
function flock(n = 20, o = {}) {
  return new Flock(n, o);
}
