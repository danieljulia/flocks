/* flocks.config.js — random ranges for new flocks
   Every flock() rolls its starting values inside these ranges.
   Then you change whatever you want: flock(20).rad(1).col('red')
   [min, max] = a random number in between · a single number = fixed.
   Load this file BEFORE flocks.js (without it, built-in ranges are used). */
var FLOCKS_CONFIG = {
  rad:  [2, 8],      // radius (px)
  spd:  [1, 3],      // speed
  gap:  [12, 50],    // comfortable distance (px); 0 = no flocking
  sync: [0, 0.9],    // fly the same way (0..1)
  wild: [0.1, 0.6],  // improvisation (0..1)
  see:  [50, 120],   // how far they see (px)
  line: 0.15,        // chance (0..1) of drawing strokes instead of circles
  color: {           // random color, in HSB
    hue:   [0, 360],
    sat:   [35, 90],   // 0..100
    bri:   [75, 100],  // 0..100
    alpha: [170, 255], // 0..255
  },
};
