import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { classifyGpuStatus } from '../src/shared/rendering.ts'
const require = createRequire(import.meta.url)
const createPacer = require('../src/renderer/public/live2d/load/frame-pacer.js')

function clock(refreshHz = 60) {
  let time = 0, id = 0
  const pending = new Map()
  const queue = (kind, fn, wait) => { const key = ++id; pending.set(key, { kind, fn, at: time + wait }); return key }
  return {
    now: () => time,
    raf: (fn) => queue('raf', fn, 1000 / refreshHz),
    cancelRaf: (key) => pending.delete(key),
    delay: (fn, wait) => queue('timer', fn, wait),
    cancelDelay: (key) => pending.delete(key),
    pending,
    consume(ms) { time += ms },
    advance(ms) {
      const end = time + ms
      let safety = 10000
      while (pending.size) {
        const [key, item] = [...pending].sort((a, b) => a[1].at - b[1].at)[0]
        if (item.at > end) break
        assert.ok(--safety > 0, 'scheduler did not settle')
        pending.delete(key); time = item.at; item.fn(time)
      }
      time = end
    },
  }
}

test('CPU animation follows display frames capped at 60 FPS and leaves no idle callbacks', () => {
  const c = clock(); let count = 0
  const p = createPacer({ ...c, hardware: false, fps: 60, onFrame: () => ++count < 60 })
  p.start(); p.start()
  assert.equal(c.pending.size, 1, 'repeated wakeups must not duplicate the loop')
  assert.equal([...c.pending.values()][0].kind, 'raf')
  c.advance(1000)
  assert.equal(count, 60); assert.equal(p.running, false); assert.equal(c.pending.size, 0)
  c.advance(5000); assert.equal(count, 60)
})

test('slow CPU frames drop missed deadlines instead of entering a catch-up loop', () => {
  const c = clock(); let count = 0
  const p = createPacer({ ...c, hardware: false, fps: 60, onFrame: () => { c.consume(100); return ++count < 3 } })
  p.start(); c.advance(500)
  assert.equal(count, 3)
  assert.equal(c.pending.size, 0)
})

test('GPU animation accepts every display frame without a 60 FPS software gate', () => {
  const c = clock(120); let count = 0
  const p = createPacer({ ...c, hardware: true, fps: 60, onFrame: () => { count++ } })
  p.start(); assert.equal([...c.pending.values()][0].kind, 'raf')
  c.advance(1001); assert.equal(count, 120)
  p.stop(); assert.equal(c.pending.size, 0)
  c.advance(1000); assert.equal(count, 120)
})

test('switching to CPU mode keeps display sync while enforcing 60 FPS', () => {
  const c = clock(120); let count = 0
  const p = createPacer({ ...c, hardware: true, fps: 60, onFrame: () => { count++ } })
  p.start(); c.advance(34); p.setMode(false, 60)
  assert.equal(c.pending.size, 1)
  assert.equal([...c.pending.values()][0].kind, 'raf')
  const before = count; c.advance(1000)
  const cpuFrames = count - before
  assert.ok(cpuFrames >= 59 && cpuFrames <= 60, `CPU frame count must stay within the 60 FPS cap, got ${cpuFrames}`)
  p.stop(); p.setMode(true, 60)
  assert.equal(c.pending.size, 0, 'mode change must not restart a paused animation')
})

test('resume resets the model clock and can stop during the frame callback', () => {
  const c = clock(); const deltas = []; let p
  p = createPacer({ ...c, hardware: true, fps: 60, onFrame: (dt) => { deltas.push(dt); p.stop() } })
  p.start(); c.advance(1000)
  assert.equal(c.pending.size, 0)
  p.start(); c.advance(20)
  assert.equal(deltas.length, 2)
  assert.ok(deltas.every(dt => Math.abs(dt - 1000 / 60) < 0.01))
  assert.equal(c.pending.size, 0)
})

test('an enabled setting cannot misreport SwiftShader as hardware', () => {
  const s = classifyGpuStatus(true, { webgl: 'enabled', gpu_compositing: 'enabled' }, 'ANGLE (Google, Vulkan (SwiftShader Device), SwiftShader driver)')
  assert.equal(s.requestedHardware, true)
  assert.equal(s.webgl, 'software'); assert.equal(s.compositing, 'software')
})

test('actual WebGL and compositing capabilities are independent', () => {
  const s = classifyGpuStatus(true, { webgl: 'enabled', gpu_compositing: 'disabled_software' }, 'ANGLE (Intel, Direct3D11)')
  assert.equal(s.webgl, 'hardware'); assert.equal(s.compositing, 'software')
  assert.equal(classifyGpuStatus(true, { webgl: 'enabled' }, '').webgl, 'hardware')
  assert.equal(classifyGpuStatus(true, { webgl: 'disabled_off' }, '').webgl, 'unavailable')
  assert.equal(classifyGpuStatus(false, {}, '', true).webgl, 'software')
})
