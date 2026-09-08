// A background-friendly clock for Emberhold's main-thread simulation.
// The main thread uses Date.now() as the source of truth; this worker only
// provides steadier wake-ups than a window timer when the tab is hidden.
'use strict';

let timerId = null;
let running = false;
let interval = 250;
let targetAt = 0;

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'stop') {
    running = false;
    clearTimeout(timerId);
    timerId = null;
    return;
  }
  if (data.type === 'start') {
    running = true;
    interval = Math.max(50, Number(data.interval) || 250);
    targetAt = performance.now() + interval;
    clearTimeout(timerId);
    timerId = setTimeout(pulse, interval);
  }
});

function pulse() {
  if (!running) return;
  const now = performance.now();
  // Keep the target timeline rather than repeatedly scheduling from a late
  // callback, the same low-drift principle used by Evolve's worker clock.
  targetAt += interval;
  if (now - targetAt > interval) targetAt = now + interval;
  self.postMessage({ type: 'pulse' });
  timerId = setTimeout(pulse, Math.max(0, targetAt - performance.now()));
}
