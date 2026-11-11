/* example.js — standalone live coding demo with flocks.js
   (plain p5 sketch, without the editor)
   Click once to turn on the ambient audio.
   Keys: [a] +10 small birds · [s] -10 · [c] random color */

let giant, smalls, mist;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // giant: very cohesive, pulses with the bass
  giant = flock(25)
    .col('#ff5c8a')
    .rad(4).spd(1.5)
    .gap(40).see(140).wild(0.15)
    .r('rad', bass, 4);

  // small and fast: aligned swarm, speeds up with the treble
  smalls = flock(60)
    .col('#5cd6ff')
    .rad(2.5).spd(2.5)
    .gap(12).sync(0.9).see(50)
    .r('spd', treble, 5);

  // background mist: subtle but still flocks
  mist = flock(30)
    .col(color(200, 35))
    .rad(5).spd(0.8)
    .gap(30).sync(0.4).see(90).wild(0.4)
    .r('rad', bass, 2.5);
}

function draw() {
  fade(); // background with trail (change it with trail(a))
  mist.draw();
  giant.draw();
  smalls.draw();
  soundMeter(); // sound bars for testing (remove whenever you want)

  if (!_au) { // hint while audio is off
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text('click to turn on the sound', width / 2, height / 2);
  }
}

// on-the-fly changes
function keyPressed() {
  if (key === 'a') smalls.add(10);
  if (key === 's') smalls.remove(10);
  if (key === 'c') smalls.col(color(random(255), random(255), random(255)));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
