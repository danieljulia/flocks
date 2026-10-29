/* ============================================================
   flocks.js — llibreria de live coding de flocs per a p5live
   Requereix: p5.js + p5.sound
   Ús ràpid:
     f = flock()                 // floc per defecte: ja es veu i
                                 // es comporta com un floc (cohesió,
                                 // alineació, separació); NO reacciona
                                 // al so si no ho demanes amb react()
     f.col('red').rad(8).spd(3)  // tot encadenable
     f.coh(2).sep(3).per(100)    // regles del floc
     f.react('r', bass, 2)       // radi: ×1 en silenci → ×2 amb bass màxim
     f.react('sp', treble, 3)    // react(prop, banda, multiplicador màxim):
                                 //   prop: 'r' | 'sp' | 'wnd'
     f.dir(0, 0.2)               // direcció principal (angle, variabilitat)
     f.linia(true)               // línia contínua en lloc de cercles
     f.calm()                    // treu TOTES les reaccions al so
     f.draw()                    // dins de draw()
   Àudio: bass() mid() treble() amp()  (normalitzats 0..1)
   L'àudio s'activa solet al primer clic/tap/tecla (política dels
   navegadors). També pots cridar audioStart() a mà.
   ============================================================ */

// ---------- ÀUDIO AMBIENT (built-in) ----------
let _au = null;

function audioStart() {
  if (_au) return _au;
  try {
    if (typeof userStartAudio === 'function') userStartAudio();
    const mic = new p5.AudioIn();
    mic.start(
      () => console.log('[flocks] micro actiu'),
      err => console.warn('[flocks] el micro ha fallat:', err)
    );
    const fft = new p5.FFT(0.8, 1024);
    fft.setInput(mic);
    _au = { mic, fft };
  } catch (e) {
    console.error('[flocks] no s\'ha pogut iniciar l\'àudio:', e);
  }
  return _au;
}

// s'inicialitza al primer gest de l'usuari sense trepitjar
// els handlers de l'esquetx (listeners natius: sempre salten)
window.addEventListener('mousedown', audioStart);
window.addEventListener('touchstart', audioStart);
window.addEventListener('keydown', audioStart);

// normalització adaptativa amb porta de soroll:
// - base: soroll de fons de la sala. Puja MOLT lentament (per no
//   menjar-se la música sostinguda) i baixa ràpid → en silenci ~0
// - peak: màxim recent (decau a poc a poc) → la música fluixa
//   també aprofita tot el rang 0..1
const _np = {};
for (const e of ['bass', 'mid', 'treble', 'amp']) _np[e] = { base: 0, peak: 0.05 };

function _norm(e, raw) {
  const p = _np[e];
  p.base += (raw - p.base) * (raw < p.base ? 0.02 : 0.0002);
  const gate = p.base * 1.2;
  p.peak = Math.max(p.peak * 0.999, raw, gate + 0.02);
  const g = Math.max(0, raw - gate);                         // porta de soroll
  return Math.min(1, g / Math.max(p.peak - gate, 0.0001));   // 0..1
}

// rangs de freqüència (Hz). p5 només dóna 20-140 a 'bass', massa
// estret per a altaveus/micros petits → els greus van de 20 a 800
// (hi entren fonamentals i harmònics de kicks i baixos)
const _RANGES = { bass: [20, 800], mid: [800, 2600], treble: [2600, 14000] };

// energia d'una banda = mitjana del 20% de bins més forts del rang.
// (getEnergy fa la mitjana de TOT el rang i els pics estrets, com el
// fonamental d'un bombo, queden diluïts entre bins buits)
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

// direcció desitjada a magnitud sp, menys la velocitat actual,
// limitada a maxF → força de gir
function _steer(dx, dy, vx, vy, sp, maxF) {
  const m = Math.hypot(dx, dy);
  if (m < 0.0001) return [0, 0];
  let sx = (dx / m) * sp - vx, sy = (dy / m) * sp - vy;
  const sm = Math.hypot(sx, sy);
  if (sm > maxF) { sx = (sx / sm) * maxF; sy = (sy / sm) * maxF; }
  return [sx, sy];
}

// ---------- OCELL ----------
class Bird {
  constructor(f) {
    this.f = f;
    this.p = createVector(random(width), random(height));
    this.pp = this.p.copy();     // posició prèvia (per al mode línia)
    this.v = p5.Vector.random2D().mult(2);
  }

  update(others, sp, wnd = this.f._wnd) {
    const f = this.f;
    this.pp.x = this.p.x; this.pp.y = this.p.y;
    const maxF = Math.max(0.05, sp * 0.15);
    const perR2 = f._per * f._per;
    const sepR2 = perR2 * 0.16; // separació = 40% de la percepció
    let aliX = 0, aliY = 0, cohX = 0, cohY = 0, sepX = 0, sepY = 0;
    let n = 0, ns = 0;

    for (const o of others) {
      if (o === this) continue;
      // distància toroidal (el món fa wrap-around)
      let dx = o.p.x - this.p.x, dy = o.p.y - this.p.y;
      if (dx >  width / 2) dx -= width;  else if (dx < -width / 2) dx += width;
      if (dy > height / 2) dy -= height; else if (dy < -height / 2) dy += height;
      const d2 = dx * dx + dy * dy;
      if (d2 > perR2) continue;
      aliX += o.v.x; aliY += o.v.y; // alineació: velocitat mitjana
      cohX += dx;    cohY += dy;    // cohesió: cap al centre del grup
      n++;
      if (d2 < sepR2 && d2 > 0.0001) { // separació: fora de dalt
        const d = Math.sqrt(d2);
        sepX -= dx / (d * d); sepY -= dy / (d * d);
        ns++;
      }
    }

    let ax = 0, ay = 0;
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
    if (wnd) { // deriva de soroll opcional (organicitat)
      const a = noise(this.p.x * f._nsc, this.p.y * f._nsc, f._t) * TAU * f._swl;
      ax += Math.cos(a) * wnd;
      ay += Math.sin(a) * wnd;
    }
    if (f._wD) { // direcció principal seguint un camp de soroll:
                 // _dvr = 0 → gairebé recta, _dvr = 1 → molt variable
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
    if (f._linia) { // línia contínua: gruix = diàmetre del cercle
      // si l'ocell ha fet wrap, no travessar la pantalla amb un traç
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

// ---------- FLOC ----------
class Flock {
  constructor(n = 20, o = {}) {
    this.birds = [];
    this._col = o.col ?? 255;      // color
    this._rad = o.rad ?? 6;        // radi
    this._spd = o.spd ?? 2;        // velocitat base (i màxima)
    this._nsc = o.nsc ?? 0.005;    // escala del soroll (deriva)
    this._swl = o.swl ?? 2;        // voltes del camp de soroll
    this._dt  = o.dt  ?? 0.004;    // velocitat del temps de soroll
    this._t   = random(1000);
    // regles del floc (boids de Reynolds)
    this._per = o.per ?? 70;       // radi de percepció dels veïns
    this._wC  = o.coh ?? 1;        // pes cohesió   (atracció al grup)
    this._wA  = o.ali ?? 1;        // pes alineació (seguir els veïns)
    this._wS  = o.sep ?? 1.5;      // pes separació (no xocar)
    this._wnd = o.wnd ?? 0.3;      // pes deriva de soroll (0 = boids purs)
    this._dir = o.dir ?? 0;        // direcció principal (angle en radians)
    this._dvr = o.dvr ?? 0.5;      // variabilitat del camp (0 = gairebé recta)
    this._wD  = o.wDir ?? 0;       // pes de la direcció (0 = desactivada)
    this._linia = o.linia ?? false; // línia contínua en lloc de cercles
    this._rx  = [];                // reactivitat al so: {prop, fn, amt}
                                   // buida: CAP reacció per defecte;
                                   // afegeix-les amb react()
    this.add(n);
  }

  // --- dinàmic ---
  add(n = 1)    { for (let i = 0; i < n; i++) this.birds.push(new Bird(this)); return this; }
  remove(n = 1) { this.birds.splice(Math.max(0, this.birds.length - n), n); return this; }

  // --- propietats (encadenables) ---
  col(c) { this._col = c; return this; }
  rad(r) { this._rad = r; return this; }
  spd(s) { this._spd = s; return this; }
  nsc(s) { this._nsc = s; return this; }
  swl(s) { this._swl = s; return this; }
  // --- regles del floc ---
  per(r) { this._per = r; return this; }   // radi de percepció
  coh(w) { this._wC  = w; return this; }   // atracció al grup
  ali(w) { this._wA  = w; return this; }   // alineació amb els veïns
  sep(w) { this._wS  = w; return this; }   // separació mínima
  wnd(w) { this._wnd = w; return this; }   // deriva de soroll
  // --- direcció principal (camp de soroll) ---
  // a: angle en radians · v: variabilitat 0..1 (0 = gairebé línia
  // recta, 1 = molt variable) · w: pes de l'ajust (1 per defecte;
  // 0 o dirOff() per desactivar-la)
  dir(a, v, w = 1) {
    this._dir = a;
    if (v !== undefined) this._dvr = v;
    this._wD = w;
    return this;
  }
  dirOff() { this._wD = 0; return this; }
  // --- dibuix ---
  linia(on = true) { this._linia = on; return this; } // línia contínua
  // --- reactivitat al so ---
  calm() { this._rx = []; return this; } // treu TOTES les reaccions al so
  // àlies estil set*
  setColor(c)  { return this.col(c); }
  setRadius(r) { return this.rad(r); }
  setSpeed(s)  { return this.spd(s); }
  setNoise(s)  { return this.nsc(s); }

  // --- reactivitat a l'àudio (o qualsevol funció) ---
  // prop: 'r' | 'sp' | 'wnd'   fn: bass / mid / treble / amp / () => ...
  // amt = multiplicador màxim: valor_final = base × (1 + fn()·(amt-1))
  // react('r', mid, 3) → r va de ×1 (silenci) a ×3 (mid = 1)
  react(prop, fn, amt = 1) { this._rx.push({ prop, fn, amt }); return this; }

  _vals() {
    const v = { r: this._rad, sp: this._spd, wnd: this._wnd };
    for (const { prop, fn, amt } of this._rx) {
      if (prop in v) v[prop] = Math.max(0, v[prop] * (1 + fn() * (amt - 1)));
    }
    return v;
  }

  update() {
    this._t += this._dt;
    const { sp, wnd } = this._vals();
    for (const b of this.birds) b.update(this.birds, sp, wnd);
    return this;
  }

  draw() {
    this.update();
    const { r } = this._vals();
    noStroke();
    fill(this._col);
    for (const b of this.birds) b.draw(r);
    return this;
  }
}

// ---------- ESTELA (rastre) ----------
let _trail = 12; // alfa del fons per frame: menys = més rastre

// a: 0..1 (fracció) o 0..255 (alfa). trail(0) = rastre infinit.
function trail(a) { _trail = a <= 1 ? a * 255 : a; }
// pinta el fons amb l'estela actual; crida'l al draw() en lloc de background()
function fade(c = 10) { background(c, _trail); }

// ---------- VISUALITZADOR DE SO (per testejar) ----------
// barres de bass / mid / treble / amp (valors ja normalitzats i amb
// porta de soroll aplicada). Crida'l al draw(), p. ex. soundMeter()
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
    fill(255, 25);                                   // fons de la barra
    rect(x + i * bw, y, bw - 4, h);
    fill(c);                                         // nivell
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
