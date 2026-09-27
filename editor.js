/* editor.js — mini entorn de live coding sobre flocks.js
   El codi d'usuari es mostra sobre el canvas i és editable:
     Ctrl/Cmd+Enter → executa els canvis (sense reiniciar)
     Ctrl+E         → amaga/mostra l'editor
   Convencions del codi d'usuari:
     init() → s'executa un cop a cada "run" (crea/modifica flocs)
     live() → s'executa a cada frame dins del draw()
   NO facis servir let/const al nivell superior: variables globals
   planes (gegant = flock(...)) perquè el re-run no peti. */

const DEMO_CODE = `// edita i prem Ctrl/Cmd+Enter per executar

function init() {
  // gegant: cohesionat, batega amb els baixos
  gegant = flock(25)
    .col('#ff5c8a')
    .rad(4).spd(1.5)
    .per(140).coh(1.8).sep(2).wnd(0.15)
    .rg(3)

  // petits i rapids: bandada alineada, acceleren amb els aguts
  petits = flock(60)
    .col('#5cd6ff')
    .rad(2.5).spd(2.5)
    .per(50).ali(2).coh(0.7)
    .sg(4)

  // boira de fons
  boiros = flock(30)
    .col(color(200, 35))
    .rad(5).spd(0.8)
    .per(90).coh(0.8).ali(0.8).wnd(0.4)
    .rg(2)
}

function live() {
  // rastre: trail(0) = infinit ... trail(1) = sense rastre
  trail(0.05 + bass() * 0.4) // el bombo "esborra" la pantalla

  boiros.draw()
  gegant.draw()
  petits.draw()
}
`;

const HELP_TEXT = `FLOCKS.JS — REFERÈNCIA
────────────────────────────────
Ctrl/Cmd+Enter  executa el codi
h / botons      mostra/amaga ajuda i codi
botó 'guia'     help.html: guia completa amb exemples

▸ CREAR
  flock(n)            floc de n ocells (def. 20)

▸ ESTIL (encadenable)
  .col('#ff5c8a')     color
  .rad(4)             radi dels cercles
  .spd(2.5)           velocitat màxima

▸ REGLES DEL FLOC
  .per(140)           radi de percepció
  .coh(1.8)           cohesió (atracció al grup)
  .ali(2)             alineació (seguir veïns)
  .sep(2)             separació (no xocar)
  .wnd(0.3)           deriva de soroll (0 = pur)

▸ DIRECCIÓ (camp de soroll)
  .dir(0, 0.2)        direcció principal:
                      angle en radians, variabilitat
                      (0 = gairebé recta, 1 = molt)
  .dirOff()           desactiva la direcció

▸ DIBUIX
  .linia(true)        línia contínua (gruix = diàmetre)
                      en lloc de cercles

▸ SO  (valors 0..1, auto-normalitzats)
  bass() mid() treble() amp()
  .rg(3)              radi ← baixos   (auto ON)
  .sg(4)              velocitat ← aguts
  .calm()             desactiva reacció auto
  .react('wnd', mid, 0.5)  reacció extra
                      ('r', 'sp' o 'wnd'; qualsevol fn)
  soundMeter()        barres de so en pantalla

▸ DINÀMIC
  .add(10)  .remove(10)

▸ PANTALLA
  trail(0.05)         rastre (0 = infinit, 1 = cap)
  fade()              fons amb estela (ja al draw)

▸ EXEMPLE
  function init() {
    f = flock(40).col('cyan').coh(2).rg(5)
  }
  function live() {
    trail(0.05 + bass() * 0.4)
    f.draw()
  }

▸ TECLES (fora de l'editor)
  a  +10 ocells a 'petits'
  s  -10 ocells
  c  color aleatori
`;

let _err = null;
let _ta = null;
let _help = null;

function runCode(code) {
  try {
    (0, eval)(code); // eval indirecte → àmbit global
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
    width: 'min(520px, 45vw)', height: '70vh',
    background: 'rgba(0,0,0,0.55)', color: '#eee',
    font: '13px/1.45 monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px', padding: '10px', outline: 'none',
    resize: 'both', whiteSpace: 'pre', tabSize: 2,
  });
  document.body.appendChild(_ta);

  _ta.addEventListener('keydown', (e) => {
    e.stopPropagation(); // p5 no ha de rebre les tecles mentre edites
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode(_ta.value);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleEditor();
    }
  });

  // capçalera informativa
  const hint = document.createElement('div');
  hint.textContent = 'Ctrl/Cmd+Enter: executa · Ctrl+E: amaga';
  Object.assign(hint.style, {
    position: 'fixed', left: '14px', top: 'calc(70vh + 16px)', zIndex: 10,
    color: 'rgba(255,255,255,0.6)', font: '11px monospace',
    pointerEvents: 'none',
  });
  hint.id = 'editorHint';
  document.body.appendChild(hint);

  // --- panell d'ajuda (referència ràpida) ---
  _help = document.createElement('pre');
  _help.textContent = HELP_TEXT;
  Object.assign(_help.style, {
    position: 'fixed', right: '12px', top: '12px', zIndex: 10,
    maxWidth: 'min(400px, 42vw)', maxHeight: '86vh', overflow: 'auto',
    margin: 0, background: 'rgba(0,0,0,0.55)', color: '#eee',
    font: '11px/1.5 monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px', padding: '10px', display: 'none',
  });
  document.body.appendChild(_help);

  // botons fixos per amagar/mostrar codi i ajuda (sempre visibles)
  const mkBtn = (txt, left, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    Object.assign(b.style, {
      position: 'fixed', left, bottom: '12px', zIndex: 11,
      background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.75)',
      font: '11px monospace', border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '4px', padding: '4px 10px', cursor: 'pointer',
    });
    b.onclick = fn;
    document.body.appendChild(b);
  };
  mkBtn('codi', '12px', toggleEditor);
  mkBtn('ajuda', '66px', toggleHelp);
  mkBtn('guia', '120px', () => window.open('help.html', '_blank'));

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
  fade(); // fons amb estela (trail(a) per canviar-la)

  if (typeof live === 'function') {
    try { live(); }
    catch (e) { _err = e.message; }
  }

  soundMeter(width - 130, 12, 110, 60); // barres de so a dalt a la dreta

  if (_err) {
    fill(255, 90, 90); noStroke();
    textAlign(LEFT, BOTTOM); textSize(13); textFont('monospace');
    text('error: ' + _err, 12, height - 12);
  }
  if (!_au) {
    fill(255); noStroke();
    textAlign(CENTER, CENTER); textSize(16);
    text('clic per activar el so', width / 2, height / 2);
  }
}

function keyPressed() {
  if (document.activeElement === _ta) return; // editant: no tocar res
  if (key === 'h' || key === 'H') toggleHelp();
  // modificació "on-the-fly" del floc 'petits' si existeix
  if (typeof petits !== 'undefined') {
    if (key === 'a') petits.add(10);
    if (key === 's') petits.remove(10);
    if (key === 'c') petits.col(color(random(255), random(255), random(255)));
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
