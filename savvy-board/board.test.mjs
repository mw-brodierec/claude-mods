// node --test (from savvy-board/). Invented sample data only: this repository is public.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FLEET_STALE_MS, fleetRows, mergeSessions, nowNext, pickBuild, render, scope, sessionCalls, view } from './board.mjs'

const AT = 1_800_000_000_000
const MIN = 60_000

const job = (id, status, extra = {}) => ({ id, title: `Title ${id}`, status, sessions: [], updated: AT - MIN, ...extra })
const BUILD = {
  id: 'garden',
  name: 'Garden build',
  project: '/tmp/garden',
  jobs: [job('j1', 'shipped', { prUrl: 'https://github.com/acme/garden/pull/7', pr: '7' }), job('j2', 'running', { sessions: ['local_side1'] }), job('j3', 'planned'), job('j4', 'planned')],
  createdAt: AT - 60 * MIN,
  updatedAt: AT - MIN,
  isFinished: false,
  orchestrators: ['cli-orch'],
}

const chat = (id, cli, extra = {}) => ({
  id, cli, name: '', title: `Chat ${id}`, link: `claude://claude.ai/epitaxy/${id}`, model: 'claude-opus-5-5', effort: 'high',
  running: false, state: '', createdAt: AT - 30 * MIN, lastAt: AT - 5 * MIN, activeMs: 10 * MIN, context: 1000, requests: 3,
  models: { 'claude-opus-5-5': [1_000_000, 0, 0, 0, 0] }, // $4 of input at the opus-5-5 price
  isOther: true, parentCli: '', ...extra,
})

const agent = (id, extra = {}) => ({
  id, type: 'savvy-flow:savvy-medium', description: `Task ${id}`, model: 'claude-opus-5-5', status: 'done',
  startedAt: AT - 20 * MIN, endedAt: AT - 10 * MIN, contextTokens: 1000, contextMax: 1_000_000, tokens: 100, costUsd: 1, steps: 1, round: 1, ...extra,
})

test('pickBuild: the newest unfinished build with jobs, however long it has waited', () => {
  const old = { ...BUILD, id: 'old', updatedAt: AT - 30 * 24 * 60 * MIN }
  const done = { ...BUILD, id: 'done', isFinished: true, updatedAt: AT }
  const empty = { ...BUILD, id: 'empty', jobs: [], updatedAt: AT }
  assert.equal(pickBuild([old, done, empty, BUILD, { junk: true }])?.id, 'garden')
  assert.equal(pickBuild([old, done])?.id, 'old')
  assert.equal(pickBuild([done, empty]), null)
})

test('fleetRows: a running row whose file stopped saving shows finished at its last save', () => {
  const rows = fleetRows(
    [
      { name: 'cli-a.json', data: { savedAt: AT - 10_000, runs: [agent('fresh', { status: 'running', endedAt: undefined })] } },
      { name: 'cli-b.json', data: { savedAt: AT - FLEET_STALE_MS - 1, runs: [agent('dead', { status: 'running', endedAt: undefined })] } },
      { name: 'cli-c.json', data: { savedAt: AT - 13 * 3600_000, runs: [agent('ancient')] } },
      { name: 'cli-d.json', data: 'not json shaped' },
    ],
    AT,
  )
  assert.deepEqual(rows.map(r => [r.id, r.status, r.fromSession]), [['fresh', 'running', 'cli-a'], ['dead', 'done', 'cli-b']])
  assert.equal(rows[1].endedAt, AT - FLEET_STALE_MS - 1)
})

test('sessionCalls and mergeSessions: one call with no parent, one per orchestrator, jobs\' sessions named', () => {
  assert.deepEqual(sessionCalls(BUILD), [['', '--live', 'local_side1'], ['cli-orch', '--live', 'local_side1']])
  const merged = mergeSessions([[chat('local_x', 'cli-x')], [chat('local_x', 'cli-x', { isOther: false }), chat('local_y', 'cli-y')]])
  assert.deepEqual(merged.map(s => [s.id, s.isOther]), [['local_x', false], ['local_y', true]])
})

test('scope and totals: only the build counts; shadows and other chats never do', () => {
  const side = [
    chat('local_orch', 'cli-orch'), // the orchestrator's own chat: another chat, but a lead
    chat('local_side1', 'cli-side1', { isOther: false, parentCli: 'cli-orch', running: true }), // its side session
    chat('local_stranger', 'cli-stranger'), // someone else's chat
  ]
  const fleet = fleetRows(
    [
      { name: 'cli-orch.json', data: { savedAt: AT, runs: [agent('orch-sub')] } }, // counted in the orchestrator's chat row
      { name: 'cli-lead2.json', data: { savedAt: AT, runs: [agent('lead2-sub')] } }, // a lead with no chat row here
      { name: 'cli-stranger.json', data: { savedAt: AT, runs: [agent('stranger-sub')] } },
    ],
    AT,
  )
  const runs = scope({ ...BUILD, orchestrators: ['cli-orch', 'cli-lead2'] }, side, fleet)
  const by = Object.fromEntries(runs.map(r => [r.id, r]))
  assert.equal(by.local_orch.isOutside, undefined)
  assert.equal(by.local_side1.isOutside, undefined)
  assert.equal(by.local_stranger.isOutside, true)
  assert.equal(by['orch-sub'].isShadow, true)
  assert.equal(by['orch-sub'].isOutside, undefined)
  assert.equal(by['lead2-sub'].isShadow, undefined)
  assert.equal(by['stranger-sub'].isOutside, true)

  const v = view(BUILD, runs, AT)
  // Two chats at $4 each plus lead2's $1 subagent; the shadow and the outsiders are left out.
  assert.equal(Math.round(v.totals.cost * 100) / 100, 9)
  assert.deepEqual(v.running.map(a => a.id), ['local_side1'])
  assert.deepEqual(v.outside.map(a => a.id).sort(), ['local_stranger', 'stranger-sub'])
})

test('Now/Next come from the jobs; Next follows the build\'s own order when set', () => {
  assert.deepEqual(nowNext(BUILD), { now: 'Job 2 Title j2', next: 'Job 3 Title j3 · Job 4 Title j4' })
  assert.equal(nowNext({ ...BUILD, next: ['j4'] }).next, 'Job 4 Title j4')
})

test('render: every drawing gets its own ids, and only GitHub PR links and local chats get links', () => {
  const side = [chat('local_side1', 'cli-side1', { isOther: false, parentCli: 'cli-orch', running: true })]
  const html = render(view({ ...BUILD, jobs: [...BUILD.jobs, job('j5', 'shipped', { prUrl: 'javascript:alert(1)', pr: '8' })] }, scope(BUILD, side, []), AT), 420)
  assert.match(html, /<span class="pr" data-k="pr">PR 8<\/span>/)
  assert.ok(!/<style>/.test(html))
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
  assert.equal(new Set(ids).size, ids.length)
  assert.match(html, /href="https:\/\/github\.com\/acme\/garden\/pull\/7"/)
  assert.ok(!html.includes('javascript:'))
  assert.match(html, /data-open="local_side1"/)
  assert.ok(!html.includes('class="cols wide"'))
  assert.match(render(view(BUILD, [], AT), 900), /class="cols wide"/)
})
