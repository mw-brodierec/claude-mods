import { expect, test } from 'claude-code/testing'

import { clawdScene } from '../hooks/clawd-scene'

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
