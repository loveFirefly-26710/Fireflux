/* Display-synchronized animation: CPU capped at 60 FPS, GPU accepts every rAF. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FireflyFramePacer = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  return function createFramePacer(options) {
    const now = options.now || (() => performance.now());
    const raf = options.raf || ((fn) => requestAnimationFrame(fn));
    const cancelRaf = options.cancelRaf || ((id) => cancelAnimationFrame(id));
    const clampFps = (v) => Math.min(60, Math.max(1, Number(v) || 60));
    const epsilon = 0.05; // Compensate for display timestamp rounding without admitting an extra frame.
    let hardware = !!options.hardware;
    let fps = clampFps(options.fps);
    let active = false;
    let handle = null;
    let last = null;
    let nextDue = null;

    function cancel() {
      if (handle !== null) cancelRaf(handle);
      handle = null;
    }
    function schedule() {
      if (active && handle === null) handle = raf(frame);
    }
    function resetClock() {
      last = null;
      nextDue = hardware ? null : now() + 1000 / fps;
    }
    function frame(timestamp) {
      handle = null;
      if (!active) return;
      // All callbacks in one display frame use the same time, regardless of JS workload.
      const time = Number.isFinite(timestamp) ? timestamp : now();
      if (!hardware) {
        const interval = 1000 / fps;
        if (time + epsilon < nextDue) { schedule(); return; }
        // Carry fractional display intervals forward (e.g. 144 Hz -> 60 FPS, not 48).
        // Skip missed deadlines in one step; never replay frames after a stall.
        nextDue += (Math.floor(Math.max(0, time - nextDue + epsilon) / interval) + 1) * interval;
      }
      const dt = last === null ? 1000 / (hardware ? 60 : fps) : Math.min(100, Math.max(0, time - last));
      last = time;
      try {
        if (options.onFrame(dt, time) === false) { stop(); return; }
      } catch (error) {
        stop();
        throw error;
      }
      schedule();
    }
    function stop() {
      active = false;
      cancel();
      last = null;
      nextDue = null;
    }
    return {
      start() {
        if (active) return;
        active = true;
        resetClock();
        schedule();
      },
      stop,
      setMode(nextHardware, nextFps) {
        const next = clampFps(nextFps);
        if (hardware === !!nextHardware && fps === next) return;
        cancel();
        hardware = !!nextHardware;
        fps = next;
        resetClock();
        schedule();
      },
      get running() { return active; },
    };
  };
});
