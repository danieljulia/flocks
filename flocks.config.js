/* flocks.config.js — random ranges for new flocks
   Every flock() rolls its starting values inside these ranges.
   Then you change whatever you want: flock(20).rad(1).col('red')
   [min, max] = a random number in between · a single number = fixed.
   Load this file BEFORE flocks.js (without it, built-in ranges are used). */
var FLOCKS_CONFIG = {
  rad:  [2, 8],      // radius (px)
  spd:  [2.5, 5],     // speed
  gap:  [12, 50],    // comfortable distance (px); 0 = no flocking
  sync: [0, 0.9],    // fly the same way (0..1)
  wild: [0.1, 0.6],  // improvisation (0..1)
  see:  [50, 120],   // how far they see (px)
  shape: ['drop', 'drop', 'dot', 'line'], // random pick (repeat one to make it likelier)
  tail:  [1.5, 5],   // tail length of 'drop'
  glow:  [0, 1],     // halo (0 = none)
  color: {           // random color, in HSB
    hue:   [0, 360],
    sat:   [35, 90],   // 0..100
    bri:   [75, 100],  // 0..100
    alpha: [170, 255], // 0..255
  },
  react: {           // random sound reactions of a new flock. Your first .r() replaces them
    count:   [1, 3], // how many (0 = none)
    lfo:     [2, 16],// beats of a random lfo
    signals: ['bass', 'mid', 'treble', 'beat', 'tick', 'lfo', 'tempo'], // repeat one to make it likelier
    props: {         // prop: multiplier range (hue: degrees of color travel)
      rad:  [1.5, 3],
      spd:  [1.3, 2.5],
      glow: [1.5, 3],
      tail: [1.5, 3],
      wild: [2, 5],
      hue:  [60, 240],
    },
  },
};
