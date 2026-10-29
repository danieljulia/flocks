/* editor.js — tiny live coding environment on top of flocks.js
   The user code is shown over the canvas and is editable:
     Ctrl/Cmd+Enter → run the changes (no restart)
     Ctrl/Cmd+E     → hide/show the editor
   User code conventions:
     init() → runs once on every "run" (create/modify flocks)
     live() → runs every frame inside draw()
   Do NOT use let/const at the top level: use plain globals
   (f = flock(...)) so re-running doesn't throw. */

const DEMO_CODE = `// 1. press Ctrl/Cmd+Enter to run
// 2. remove the // in front of a line, run again, see what changes

function init() {
  f = flock(30)             // 30 birds wandering around
  // .col('#5cd6ff')        // color
  // .rad(3)                // smaller birds
  // .flocking()            // birds stick together
  // .dir(0, 0.2)           // everybody goes right
  // .line()                // draw strokes instead of circles
  // .r('rad', bass, 4)     // size grows up to x4 with the bass
}

function live() {
  trail(0.1)                // 0 = endless trail ... 1 = no trail
  f.draw()
}
`;

const HELP_TEXT = `FLOCKS.JS — QUICK REFERENCE
─────────────────────────────
Ctrl/Cmd+Enter   run the code
Ctrl/Cmd+E       hide/show the code
h                hide/show this help
'guide' button   full guide with examples

▸ YOUR CODE HAS TWO PARTS
  init()   runs once each time you run
           → create flocks here
  live()   runs every frame
           → draw flocks here

▸ START
  f = flock()          20 birds, just wandering
  f = flock(50)        50 birds
  f.draw()             inside live()

▸ LOOK  (chain them: f.col(..).rad(..))
  .col('red')          color
  .rad(4)              radius
  .spd(3)              speed
  .line()              strokes instead of circles

▸ BEHAVIOUR  (off by default)
  .flocking()          classic flock: all 3 rules
  .coh(2)              cohesion: stay together
  .ali(2)              alignment: fly the same way
  .sep(2)              separation: don't collide
  .per(100)            how far each bird sees
  .wnd(0.3)            random wandering (0 = none)
  .dir(0, 0.2)         main heading: angle,
                       variability (0 straight, 1 wild)
  .dirOff()            no main heading

▸ SOUND  (signals 0..1)
  bass() mid() treble() amp()
  .r('rad', bass, 3)   radius x1 in silence → x3 loud
  .r('spd', mid, 2)    speed up to x2
  .r('wnd', treble, 3) wandering up to x3
  .calm()              remove all reactions

▸ MORE
  .add(10) .remove(10) birds on the fly
  trail(0.05)          0 = endless trail, 1 = none
  soundMeter()         sound bars on screen

▸ KEYS (outside the editor, on the last flock)
  a  +10 birds    s  -10 birds    c  random color
`;

let _err = null;
let _ta = null;
let _help = null;

function runCode(code) {
  try {
    (0, eval)(code); // indirect eval → global scope
    _err = null;
    if (typeof init === 'function') init();
  } catch (e) {
    _err = e.message;
    console.error('[editor]', e);
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // --- editor overlay ---
  _ta = document.createElement('textarea');
  _ta.value = DEMO_CODE;
  _ta.spellcheck = false;
  Object.assign(_ta.style, {
    position: 'fixed', top: '12px', left: '12px', zIndex: 10,
    width: 'min(620px, 70vw)', height: '70vh',
    background: 'rgba(0,0,0,0.55)', color: '#eee',
    font: '18px/1.45 monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px', padding: '12px', outline: 'none',
    resize: 'both', whiteSpace: 'pre', tabSize: 2,
  });
  document.body.appendChild(_ta);

  _ta.addEventListener('keydown', (e) => {
    e.stopPropagation(); // p5 must not get keys while editing
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode(_ta.value);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleEditor();
    }
  });

  // hint under the editor
  const hint = document.createElement('div');
  hint.textContent = 'Ctrl/Cmd+Enter: run · Ctrl/Cmd+E: hide · h: help';
  Object.assign(hint.style, {
    position: 'fixed', left: '14px', top: 'calc(70vh + 20px)', zIndex: 10,
    color: 'rgba(255,255,255,0.6)', font: '14px monospace',
    pointerEvents: 'none',
  });
  hint.id = 'editorHint';
  document.body.appendChild(hint);

  // --- help panel (quick reference) ---
  _help = document.createElement('pre');
  _help.textContent = HELP_TEXT;
  Object.assign(_help.style, {
    position: 'fixed', right: '12px', top: '100px', zIndex: 10,
    maxWidth: 'min(460px, 42vw)', maxHeight: 'calc(100vh - 160px)', overflow: 'auto',
    margin: 0, background: 'rgba(0,0,0,0.7)', color: '#eee',
    font: '14px/1.5 monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px', padding: '12px', display: 'none',
  });
  document.body.appendChild(_help);

  // fixed buttons to hide/show code and help (always visible)
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: 11,
    display: 'flex', gap: '8px',
  });
  document.body.appendChild(bar);
  const mkBtn = (txt, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    Object.assign(b.style, {
      background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.75)',
      font: '14px monospace', border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
    });
    b.onclick = fn;
    bar.appendChild(b);
  };
  mkBtn('▶ run', () => runCode(_ta.value));
  mkBtn('code', toggleEditor);
  mkBtn('help', toggleHelp);
  mkBtn('guide', () => window.open('help.html', '_blank'));

  function toggleEditor() {
    const hidden = _ta.style.display === 'none';
    _ta.style.display = hidden ? 'block' : 'none';
    hint.style.display = hidden ? 'block' : 'none';
    if (!hidden) _ta.blur();
  }

  runCode(DEMO_CODE);
}

function toggleHelp() {
  if (!_help) return;
  _help.style.display = _help.style.display === 'none' ? 'block' : 'none';
}

function draw() {
  fade(); // background with trail (change it with trail(a))

  if (typeof live === 'function') {
    try { live(); }
    catch (e) { _err = e.message; }
  }

  soundMeter(width - 130, 12, 110, 60); // sound bars, top right

  if (_err) {
    fill(255, 90, 90); noStroke();
    textAlign(LEFT, BOTTOM); textSize(16); textFont('monospace');
    text('error: ' + _err, 12, height - 52); // above the bottom buttons
  }
  if (!_au) {
    fill(255); noStroke();
    textAlign(CENTER, CENTER); textSize(18);
    text('click to turn on the sound', width / 2, height / 2);
  }
}

function keyPressed() {
  if (document.activeElement === _ta) return; // editing: leave it alone
  if (key === 'h' || key === 'H') toggleHelp();
  // on-the-fly changes to the most recently created flock
  if (_lastFlock) {
    if (key === 'a') _lastFlock.add(10);
    if (key === 's') _lastFlock.remove(10);
    if (key === 'c') _lastFlock.col(color(random(255), random(255), random(255)));
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
