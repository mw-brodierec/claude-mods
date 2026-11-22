import { expect, test } from 'claude-code/testing'

import { clawdScene, WAIT_COUNT } from '../hooks/clawd-scene'

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
