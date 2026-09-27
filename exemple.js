/* exemple.js — demo de live coding amb flocks.js
   Clica un cop per activar l'àudio ambient.
   Tecles: [a] +10 ocells petits · [s] -10 · [c] color aleatori */

let gegant, petits, boiros;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // gegant: molt cohesionat, batega amb els baixos
  gegant = flock(25)
    .col('#ff5c8a')
    .rad(4).spd(1.5)
    .per(140).coh(1.8).sep(2).wnd(0.15)
    .rg(3);

  // petits i ràpids: alineats en bandada, acceleren amb els aguts
  petits = flock(60)
    .col('#5cd6ff')
    .rad(2.5).spd(2.5)
    .per(50).ali(2).coh(0.7)
    .sg(4);

  // boira de fons: subtil però també floqueix
  boiros = flock(30)
    .col(color(200, 35))
    .rad(5).spd(0.8)
    .per(90).coh(0.8).ali(0.8).wnd(0.4)
    .rg(2);
}

function draw() {
  fade(); // fons amb estela (trail(a) per canviar-la)
  boiros.draw();
  gegant.draw();
  petits.draw();
  soundMeter(); // barres de so per testejar (treu-ho quan vulguis)

  if (!_au) { // pista mentre l'àudio no estigui actiu
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text('clic per activar el so', width / 2, height / 2);
  }
}

// modificació "on-the-fly"
function keyPressed() {
  if (key === 'a') petits.add(10);
  if (key === 's') petits.remove(10);
  if (key === 'c') petits.col(color(random(255), random(255), random(255)));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
