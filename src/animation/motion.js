/* Shared by the direct-open runtime and unit tests. Distances are diagram units. */
(function(root){
  'use strict';
  function transferDuration(baseDuration, lengths){
    const longest = Math.max(0,...lengths.filter(Number.isFinite));
    // Keep ordinary connections at the chosen speed, with bounded adjustments
    // for very short and long paths. A simultaneous group shares one duration.
    const shortFactor = Math.max(.75,Math.min(1,longest / 160));
    const longFactor = Math.max(1,Math.min(1.35,longest / 520));
    return Math.round(baseDuration * shortFactor * longFactor);
  }
  function travelProgress(progress){
    // Reserve the opening 8% for the departure cue, then ease into travel.
    const t = Math.max(0,Math.min(1,(progress - .08) / .92));
    return t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
  }
  root.MessageFlowMotion = Object.freeze({transferDuration,travelProgress});
})(globalThis);
