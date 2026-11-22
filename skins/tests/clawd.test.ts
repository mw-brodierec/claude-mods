import { expect, test } from 'claude-code/testing'

import { clawdScene, pickWait, WAIT_COUNT } from '../hooks/clawd-scene'

test('Clawd shoots hoops while working and welds or runs the lab while waiting', () => {
  expect(clawdScene(true, 0).source).toContain('@keyframes ball')
  expect(clawdScene(false, 0).source).toContain('@keyframes flash')
  expect(clawdScene(false, 1).source).toContain('@keyframes tilt')
  for (const scene of [clawdScene(true, 1), clawdScene(false, 0), clawdScene(false, 1)]) {
    expect(scene.height).toBe(30)
    expect(scene.source.length).toBeLessThan(131072)
    expect(scene.source).not.toMatch(/<script|\son\w+=/)
  }
})

test('every waiting scene is its own animated drawing, the same size as the band', () => {
  const sources = new Set<string>()
  expect(WAIT_COUNT).toBeGreaterThan(10)
  for (let wait = 0; wait < WAIT_COUNT; wait++) {
    const scene = clawdScene(false, wait)
    expect(scene.height).toBe(30)
    expect(scene.width).toBe(96)
    expect(scene.source).toContain('@keyframes')
    expect(scene.alt.length).toBeGreaterThan(5)
    expect(scene.source.length).toBeLessThan(131072)
    expect(scene.source).not.toMatch(/<script|\son\w+=/)
    sources.add(scene.source)
  }
  expect(sources.size).toBe(WAIT_COUNT)
})

test('a light theme never picks the dark-only burglar scene', () => {
  const burglar = Array.from({ length: WAIT_COUNT }, (_, i) => i).find(i => clawdScene(false, i).alt.includes('burglar')) ?? -1
  expect(burglar).toBeGreaterThan(-1)
  const picked = new Set(Array.from({ length: 500 }, (_, seed) => pickWait(seed, true)))
  expect(picked.has(burglar)).toBe(false)
  expect(new Set(Array.from({ length: 500 }, (_, seed) => pickWait(seed, false))).has(burglar)).toBe(true)
})
