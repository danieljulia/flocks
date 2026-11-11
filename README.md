# flocks.js

A small live coding library for flocks (boids) that react to sound and follow the tempo of the music, built on
[p5.js](https://p5js.org) + p5.sound. It is designed for live sessions in
[p5live](https://teddavis.org/p5live/) or in the bundled mini editor: you type a little,
press Ctrl/Cmd+Enter and the flocks change right away without a restart.

**Try it live: <https://danieljulia.github.io/flocks/>** (click once to turn on the mic)

```js
function init() {
  f = flock(30)
    .col('#5cd6ff')
    .gap(25).sync(0.8)   // birds stick together
    .r('rad', bass, 4)   // they grow with the bass
}

function live() {
  trail(0.1)
  f.draw()
}
```

## Running it

Everything is in the repo, including p5.js and p5.sound in `lib/`, so it **works offline**.

Serve the folder locally and open it in the browser:

```bash
python3 -m http.server 8000
```

Then go to <http://localhost:8000>. Click once on the page to turn on the microphone
(browsers only allow audio after a user gesture). Opening `index.html` directly as a
file also works in most browsers, but some of them block the microphone on `file://`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Entry point: loads p5, p5.sound, the library and the editor |
| `flocks.js` | The library: flocks, birds, audio analysis, signals |
| `presets.js` | The examples of the editor menu (add yours) |
| `flocks.config.js` | Ranges for the random starting values of every new flock (load it before `flocks.js`) |
| `editor.js` | Mini live coding editor over the canvas |
| `help.html` | Full guide with examples (the **guide** button in the editor) |
| `example.js` | The same ideas as a plain p5 sketch, without the editor |
| `lib/` | p5.js 1.11.3 and p5.sound, bundled for offline use |

## The editor

A top bar has the title, **run** / **code** / **help** / **guide** / **github** buttons, an
**examples** menu (8 ready-made pieces to load and change), the detected tempo
(`♩ 128`, with `● auto` when it has locked on the music) and a sound meter. The code is
colored like in [Strudel](https://strudel.cc/): keywords, library words, methods, numbers,
strings and comments each have their own color.

Your code has two functions:

- `init()` runs once every time you run the code. Create and change flocks here.
- `live()` runs every frame. Draw here.

| Key | Action |
| --- | --- |
| Ctrl/Cmd+Enter | run the code |
| Ctrl/Cmd+E | hide/show the code |
| h | hide/show the quick reference |
| t | tap tempo (or click the ♩ button on every beat) |
| a / s / c | +10 birds / −10 birds / random color on the last flock |

Use plain globals (`f = flock()`), not `let`/`const`, so the code can run again.

Running again keeps the birds where they are: each `flock()` call reuses the flock it
created in the previous run (matched by order, or by name with `flock('river', 40)`),
resets its settings and applies the new code.

## API

### Flocks

| Call | Effect |
| --- | --- |
| `flock(n)` | new flock of `n` birds (default 20). Look and behavior start **random**, inside the ranges of `flocks.config.js` |
| `flock('name', n)` | named flock, reused across runs wherever it is in the code |
| `.col(c) .rad(r) .spd(s)` | color, radius, speed |
| `.line()` | shortcut for `.shape('line')`: continuous strokes |
| `.gap(px)` | comfortable distance: closer they push away, farther they pull (0 = off) |
| `.sync(x)` | fly the same way as neighbors, 0..1 |
| `.shape(s)` `.tail(x)` `.glow(x)` | `'dot'`, `'drop'` (oriented, with a tail) or `'line'`; tail length; halo 0..1 |
| `.glide(g)` | changes of any parameter arrive smoothly (default 0.92, 0 = jump) |
| `.see(px)` | how far each bird sees its neighbors |
| `.chase(g, w)` `.flee(g, w)` | go for / run away from the nearest bird of another flock `g`. `w` = strength, can be a signal |
| `.follow(g, w, r)` | orbit the center of flock `g` at `r` px. `w` and `r` can be signals |
| `.wild(x) .nsc(s)` | improvisation (0..1) and its noise scale |
| `.dir(angle, variability) .dirOff()` | main heading following a noise field |
| `.add(n) .remove(n)` | birds on the fly |
| `.draw()` | update and draw (call it in `live()`) |

Everything is chainable.

### Sound

The library listens to the microphone and gives normalized signals (0..1) with an
adaptive noise gate: `bass()`, `mid()`, `treble()`, `amp()` and `beat()` (a pulse on
every bass hit).

| Call | Effect |
| --- | --- |
| `.r(prop, signal, x)` | multiply: ×1 in silence → ×x at full signal |
| `.r(prop, signal, min, max)` | range: `min` in silence → `max` at full signal |
| `.calm()` | remove all reactions. A new flock starts with 1–3 **random** reactions (ranges in `flocks.config.js`); the first `.r()` you write replaces them |
| `bass.smooth(0.9)` | smoothed signal |
| `mid.beat(0.5)` | pulse when the signal goes over 0.5 |
| `sig(fn)` | turn any function into a signal (e.g. `sig(() => mouseX / width)`) |
| `bpm(n)` · `bpm('auto')` · `tap()` | the tempo is **detected from the music**; `bpm(128)` fixes it by hand, `bpm('auto')` listens again, `tap()` is tap tempo (the ♩ button) |
| `phase` `bar` `tick` `lfo(n)` | tempo signals: ramp per beat, ramp per 4 beats, pulse on the beat, wave over `n` beats |
| `tempo` | the speed of the music as a signal: 60 bpm = 0 … 180 bpm = 1 (e.g. `.r('spd', tempo, 2)`) |
| `soundMeter()` | sound bars on screen to calibrate |

Props for `r()`: `rad spd wild see gap sync glow tail` and the color props `hue` (0–360),
`sat`, `bri` (0–100), `alpha` (0–255).

### Screen

| Call | Effect |
| --- | --- |
| `trail(a)` | trail length: 0 = endless, 1 = none |
| `fade()` | paint the background with the current trail (the editor does it) |

## How it works

- Each bird follows two boid rules (a spring toward a comfortable `gap`, and `sync` with neighbors) plus a Perlin
  noise drift. The world wraps around like a torus.
- Neighbors are found through a spatial grid, so large flocks stay fast.
- Each bird has its own speed and rhythm, and turns gently, so flocks move in wide arcs
  instead of snapping.
- Birds are drawn as dots, oriented drops with a tail, or strokes. Dots and drops are batched
  in one canvas path per layer (halo first), so glow stays cheap.
- Parameters glide toward new values (`glide()`), so changing the code never makes a flock jump.
- Tempo detection: onset strength (positive spectral flux) → autocorrelation of the last
  8 seconds → bpm, then the clock phase is nudged onto the strongest onsets. It needs a few
  seconds of rhythmic music to lock; `○ auto` means it is still listening.
- Audio bands use the loudest 20% of FFT bins in each range (bass 20–800 Hz, mid
  800–2600 Hz, treble 2.6–14 kHz) and an adaptive floor/peak normalization, so the
  signals use the whole 0..1 range in quiet and loud rooms. The FFT is computed once
  per frame and every signal is cached per frame.

## License

No license yet.
