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
     f.r('rad', bass, 2, 20)     // radius: 2 in silence → 20 at full bass
     f.r('hue', mid, 180, 300)   // color reacts too (hue, sat, bri, alpha)
     f.r('spd', beat, 3)         // beat(): a pulse on every bass hit
     f.r('rad', bass.smooth(0.9), 3) // smoothed signal, no jitter
     f.dir(0, 0.2)               // main heading (angle, variability)
     f.line()                    // continuous strokes instead of circles
     f.calm()                    // remove ALL sound reactions
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

const bass   = sig(() => _band('bass'));
const mid    = sig(() => _band('mid'));
const treble = sig(() => _band('treble'));
const amp    = sig(() => (_au ? _norm('amp', _au.mic.getLevel()) : 0));
const beat   = bass.beat(); // pulse on every bass hit

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
  }

  // v: this frame's flock values (after sound reactions)
  update(f, others, v) {
    const sp = v.spd;
    this.pp.x = this.p.x; this.pp.y = this.p.y;
    const maxF = Math.max(0.05, sp * 0.15);
    let ax = 0, ay = 0;

    if (v.ali || v.coh || v.sep) { // skip the neighbor loop if no rules are on
      const perR2 = v.per * v.per;
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
        if (v.ali) {
          const [sx, sy] = _steer(aliX, aliY, this.v.x, this.v.y, sp, maxF);
          ax += sx * v.ali; ay += sy * v.ali;
        }
        if (v.coh) {
          const [sx, sy] = _steer(cohX, cohY, this.v.x, this.v.y, sp, maxF);
          ax += sx * v.coh; ay += sy * v.coh;
        }
      }
      if (ns > 0 && v.sep) {
        const [sx, sy] = _steer(sepX, sepY, this.v.x, this.v.y, sp, maxF);
        ax += sx * v.sep; ay += sy * v.sep;
      }
    }
    if (v.wnd) { // noise drift (organic wandering)
      const a = noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) * TAU * f._swl;
      ax += Math.cos(a) * v.wnd;
      ay += Math.sin(a) * v.wnd;
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

// ---------- FLOCK ----------
let _lastFlock = null; // most recently created flock (keyboard shortcuts act on it)

// props r() can move. Numbers are multiplied; colors use HSB ranges
const _NUM_PROPS = ['rad', 'spd', 'wnd', 'per', 'coh', 'ali', 'sep'];
const _COL_PROPS = ['hue', 'sat', 'bri', 'alpha'];

class Flock {
  constructor(n = 20, o = {}) {
    this.birds = [];
    this._t = random(1000);
    this._reset(o);
    this.add(n);
    _lastFlock = this;
  }

  // every setting back to its default (used by the constructor and
  // when a re-run reuses this flock, so deleted calls stop applying)
  _reset(o = {}) {
    this.col(o.col ?? 255);        // color
    this._rad = o.rad ?? 6;        // radius
    this._spd = o.spd ?? 2;        // base (and max) speed
    this._nsc = o.nsc ?? 0.005;    // noise scale (drift)
    this._swl = o.swl ?? 2;        // turns of the noise field
    this._dt  = o.dt  ?? 0.004;    // noise time speed
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
    this._rx  = [];                // sound reactions: {prop, fn, a, b}
                                   // empty: NO reactions by default;
                                   // add them with r()
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
  // fn: bass / mid / treble / amp / beat / () => ... (0..1)
  // r(prop, fn, x)         multiplier: ×1 when fn = 0 → ×x when fn = 1
  // r(prop, fn, min, max)  range: min when fn = 0 → max when fn = 1
  // prop: 'rad' 'spd' 'wnd' 'per' 'coh' 'ali' 'sep'
  //       'hue' (0..360) 'sat' 'bri' (0..100) 'alpha' (0..255)
  r(prop, fn, a = 2, b) {
    if (!_NUM_PROPS.includes(prop) && !_COL_PROPS.includes(prop)) {
      console.warn(`[flocks] r(): unknown prop '${prop}', use one of: ` +
        [..._NUM_PROPS, ..._COL_PROPS].join(', '));
      return this;
    }
    this._rx.push({ prop, fn, a, b });
    return this;
  }

  _vals() {
    const [hue, sat, bri] = this._hsb;
    const v = {
      rad: this._rad, spd: this._spd, wnd: this._wnd, per: this._per,
      coh: this._wC, ali: this._wA, sep: this._wS,
      hue, sat, bri, alpha: this._alpha,
    };
    for (const { prop, fn, a, b } of this._rx) {
      const s = fn();
      v[prop] = b === undefined ? v[prop] * (1 + s * (a - 1)) : a + s * (b - a);
    }
    for (const p of _NUM_PROPS) v[p] = Math.max(0, v[p]);
    v.per = Math.max(1, v.per);
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
    const cell = b => [Math.min(cols - 1, Math.floor(b.p.x / cw)),
                       Math.min(rows - 1, Math.floor(b.p.y / ch))];
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
    const near = this._neighbors(v.per);
    for (const b of this.birds) b.update(this, near(b), v);
    return this;
  }

  draw() {
    this.update();
    const v = this._v;
    const c = this._rx.some(x => _COL_PROPS.includes(x.prop))
      ? color(..._hsb2rgb(v.hue, v.sat, v.bri), v.alpha)
      : this._col;
    if (this._line) { stroke(c); strokeWeight(v.rad * 2); noFill(); }
    else { noStroke(); fill(c); }
    for (const b of this.birds) b.draw(v.rad, this._line);
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
