/* presets.js — examples you can load from the menu of the editor
   Each one is plain editor code (init + live). Add yours here. */
const PRESETS = [

{ name: 'Breathing swarm', code: `// Breathing swarm
// tempo (detected from the music): the gap opens and closes every 8 beats, the radius pulses on each beat
// music: bass = size · mids = color + glow · highs = speed + long tails

function init() {
  s = flock(120)
    .col('#5cd6ff').rad(3).spd(3)
    .shape('drop').tail(3).glow(0.7)
    .sync(0.6).wild(0.15).see(110)
    .r('gap', lfo(8), 14, 70)     // tight → open → tight
    .r('rad', tick, 1.4)          // heart beat
    .r('rad', bass, 2.8)          // bass: the birds swell
    .r('hue', mid, 190, 330)      // mids: blue → pink
    .r('glow', mid, 3)            // mids: brighter
    .r('spd', treble, 2.5)        // highs: dash
    .r('tail', treble, 3)         // highs: long tails
    .r('spd', tempo, 2)           // faster music → faster swarm
}

function live() {
  trail(0.12)
  s.draw()
}
` },

{ name: 'Ink river', code: `// Ink river
// strokes in an almost straight current.
// bass = thickness · mids = color · highs = speed
function init() {
  river = flock(70)
    .col('#5cd6ff').rad(2.5).spd(3)
    .line()
    .gap(22).sync(0.9).wild(0.1).see(80)
    .dir(0, 0.2)                  // to the right, almost straight
    .r('rad', bass, 3.5)          // bass: much thicker strokes
    .r('hue', mid, 190, 330)      // mids: color
    .r('spd', treble, 2.2)        // highs: the river accelerates
}

function live() {
  trail(0.02)                     // very long trail
  river.draw()
}
` },

{ name: 'Pulsar', code: `// Pulsar
// a small core wanders, a ring of birds orbits it and breathes with the tempo.
// bass = core size + wider orbit · mids = ring color · highs = ring speed + tails

function init() {
  breathe = lfo(4)
  core = flock(10)
    .col('#ff5c8a').rad(5).spd(1.2)
    .shape('dot').glow(1)
    .gap(14).sync(0).wild(0.4).see(140)
    .r('rad', bass, 4)                              // bass: the core swells
  ring = flock(90)
    .col('#5cd6ff').rad(2.5).spd(4)
    .shape('drop').tail(3).glow(0.6)
    .gap(10).sync(0.4).wild(0.05)
    .follow(core, 1, () => 80 + breathe() * 160 + bass() * 80) // orbit radius
    .r('rad', tick, 2)
    .r('hue', mid, 190, 300)                         // mids: blue → violet
    .r('spd', treble, 2.5)                           // highs: the ring spins faster
    .r('tail', treble, 3)                            // highs: longer tails
}

function live() {
  trail(0.1)
  core.draw()
  ring.draw()
}
` },

{ name: 'Hunt', code: `// Hunt
// 4 red hunters chase a school of fish. On every bass hit the school
// panics: it flees harder and the hunters get a burst of speed.
// bass = hunters swell · mids = the school changes color + glows · highs = it dashes
function init() {
  prey = flock(100)
    .col('#5cd6ff').rad(2.5).spd(3.2)
    .shape('drop').tail(2.5).glow(0.4)
    .gap(16).sync(0.8).wild(0.2).see(90)
    .r('hue', mid, 190, 290)
    .r('glow', mid, 3)
    .r('spd', treble, 1.8)
    .r('tail', treble, 3)
  hunter = flock(4)
    .col('#ff5c8a').rad(6).spd(3.6)
    .shape('drop').tail(5).glow(1)
    .gap(0).sync(0).wild(0.1)
    .chase(prey)
    .r('spd', beat, 1.4)
    .r('rad', bass, 2.5)
  prey.flee(hunter, () => 1 + beat() * 2)
}

function live() {
  trail(0.15)
  prey.draw()
  hunter.draw()
}
` },

{ name: 'Fireflies', code: `// Fireflies
// lots of tiny glowing dots that never agree on anything.
// They blink with the tempo and change from yellow to green over 32 beats.
// bass = they swell · mids = they glow a lot more · highs = they dash

function init() {
  fly = flock(220)
    .col('#ffe27a').rad(1.6).spd(1.2)
    .shape('dot').glow(1)
    .gap(0).sync(0).wild(0.8).see(60)
    .r('alpha', tick, 70, 255)        // blink
    .r('hue', lfo(32), 45, 120)       // yellow → green
    .r('rad', bass, 3.5)
    .r('glow', mid, 3)
    .r('spd', treble, 3.5)
    .r('spd', tempo, 1.8)             // faster music → faster fireflies
}

function live() {
  trail(0.07)
  fly.draw()
}
` },

{ name: 'Light ribbons', code: `// Light ribbons
// two flocks draw glowing ribbons that pile up on screen (additive light).
// bass = thickness · mids = color · highs = speed · tempo = how fast the colors travel
function init() {
  a = flock(55)
    .col('#33ccff').rad(1.2).spd(3)
    .line()
    .gap(28).sync(0.7).wild(0.35).see(110)
    .r('rad', bass, 3)                // bass: thicker ribbons
    .r('hue', mid, 180, 280)          // mids: cyan → violet
    .r('spd', treble, 2)              // highs: faster
  b = flock(55)
    .col('#ff4fa3').rad(1.2).spd(2.6)
    .line()
    .gap(28).sync(0.7).wild(0.35).see(110)
    .r('rad', bass, 3)
    .r('hue', mid, 300, 40)           // mids: magenta → orange
    .r('spd', treble, 2)
}

function live() {
  trail(0.012)                        // very long trail: the ribbons stay
  blendMode(ADD)                      // light adds up where lines cross
  a.draw()
  b.draw()
}
` },

{ name: 'Laser lines', code: `// Laser lines
// three flocks, each one flying dead straight in its own direction.
// Birds wrap around the screen, so the lines cross and weave a lattice.
// bass = thickness · mids = color · highs = speed
function init() {
  x = flock(26)
    .col('#33ccff').rad(1.4).spd(6)
    .line()
    .gap(0).sync(0).wild(0).dir(0, 0, 4)                  // →
    .r('rad', bass, 3).r('hue', mid, 180, 230).r('spd', treble, 1.8)
  y = flock(26)
    .col('#ff4fa3').rad(1.4).spd(6)
    .line()
    .gap(0).sync(0).wild(0).dir(TAU / 3, 0, 4)            // ↘
    .r('rad', bass, 3).r('hue', mid, 300, 350).r('spd', treble, 1.8)
  z = flock(26)
    .col('#ffe066').rad(1.4).spd(6)
    .line()
    .gap(0).sync(0).wild(0).dir(TAU * 2 / 3, 0, 4)        // ↙
    .r('rad', bass, 3).r('hue', mid, 40, 90).r('spd', treble, 1.8)
}

function live() {
  trail(0.03)
  blendMode(ADD)
  x.draw()
  y.draw()
  z.draw()
}
` },

{ name: 'Kick', code: `// Kick
// everything hangs on the beat: on every kick the swarm explodes outward,
// the birds swell and flash, the color jumps — then it gathers again.
// "hit" = the bass beat, or the tempo clock if the music is weak
function init() {
  hit = sig(() => Math.max(beat(), tick() * 0.7))
  k = flock(140)
    .col('#ff3d6e').rad(2.5).spd(2.2)
    .shape('drop').tail(3)
    .gap(14).sync(0.5).wild(0.15).see(120)
    .glide(0.97)
    .r('spd', hit, 5)               // burst of speed
    .r('gap', hit, 12, 110)         // the swarm explodes, then closes again
    .r('rad', hit, 3.2)             // the birds swell
    .r('glow', hit, 4)              // flash
    .r('hue', hit, 340, 200)        // pink → cyan on the hit
    .r('tail', hit, 2.5)
}

function live() {
  trail(0.3 - hit() * 0.14)        // the hit leaves a slightly longer trail
  k.draw()
  if (hit() > 0.6) {                // white flash on the hit
    noStroke(); fill(255, (hit() - 0.6) * 55)
    rect(0, 0, width, height)
  }
}
` },

];
