import { expect, test } from 'claude-code/testing'

import { mergeBuild, nowNext, summaryLine, wrap } from '../hooks/jobs'

// Invented sample data only: this repository is public.
const BAND = { plugin: 'savvy-progress', component: 'AbovePrompt', props: { bodyColumns: 120, isWorking: true, hasSurvey: false } } as const

const SESSION = {
  id: 'local_w1',
  name: 'water-sched',
  title: 'Watering schedule',
  link: 'claude://claude.ai/epitaxy/local_w1',
  model: 'claude-opus-5-5',
  effort: 'high',
  running: true,
  state: '',
  createdAt: 1_000,
  lastAt: 60_000,
  activeMs: 59_000,
  context: 40_000,
  requests: 5,
  models: { 'claude-opus-5-5': [100, 1_000, 10_000, 0, 0] },
}

const SEED = {
  build: 'Garden planner',
  summary: 'Seed list is live; watering is next.',
  jobs: [
    { id: 'seeds', title: 'Seed list', status: 'shipped', pr: '12', prUrl: 'https://example.com/pr/12' },
    { id: 'water', title: 'Watering schedule', status: 'running', sessions: ['water-sched'] },
    { id: 'frost', title: 'Frost alerts', status: 'waiting', waitingOn: 'a weather API key' },
    { id: 'harvest', title: 'Harvest log', status: 'planned' },
    { id: 'mobile', title: 'Mobile layout', status: 'later' },
  ],
}

// A fake disk and clock, so the tool's file is visible to the test.
function harness(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const files = new Map<string, string>()
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'HOME' ? '/home/test' : undefined }))
  on('session.root', () => ({ value: '/projects/garden' }))
  const time = { at: Date.UTC(2026, 10, 22, 18) }
  on('clock.now', () => ({ value: time.at }))
  on('fs.write', (_, e) => {
    const { path, text } = e as { path: string; text: string }
    files.set(path, text)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const text = files.get((e as { path: string }).path)
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('fs.list', (_, e) => {
    const dir = `${(e as { path: string }).path}/`
    return { value: [...files.keys()].filter(k => k.startsWith(dir)).map(k => ({ name: k.slice(dir.length), path: k, kind: 'file' as const })) }
  })
  on('session.id', () => ({ value: 'cli-test' }))
  const store = new Map<string, unknown>()
  const opened: string[] = []
  on('store.get', (_, e) => ({ value: store.get((e as { key: string }).key) }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    store.set(key, value)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: opened.map(id => ({ id })) }))
  const closed: string[] = []
  on('ui.close', (_, e) => {
    closed.push((e as { id: string }).id)
    const at = opened.indexOf((e as { id: string }).id)
    if (at >= 0) opened.splice(at, 1)
    return { value: undefined }
  })
  // The CLI ids this session had before a restart (sessions.py --prior).
  const priors: string[] = []
  // The command lines `ps` lists, for the background shell rows.
  const procs: string[] = []
  // What sessions.py lists: side sessions, and with --live other chats on the machine.
  const side: Record<string, unknown>[] = [SESSION]
  const runs: string[][] = []
  on('process.run', (_, e) => {
    runs.push([...((e as { argv?: readonly string[] }).argv ?? [])])
    const text = JSON.stringify(e)
    if (text.includes('"ps"')) return { value: { exitCode: 0, stdout: procs.join('\n'), stderr: '' } }
    return { value: { exitCode: 0, stdout: JSON.stringify(text.includes('--prior') ? priors : side), stderr: '' } }
  })
  return Object.assign(files, { store, opened, closed, priors, procs, time, side, runs })
}

test('merge upserts by id, stamps updated only on change, and derives the summary', () => {
  const a = mergeBuild(null, SEED, 1_000, '/p')
  expect(a.id).toBe('garden-planner')
  expect(summaryLine(a)).toBe('1 of 5 jobs shipped, 1 running, 1 waiting')
  const b = mergeBuild(a, { jobs: [{ id: 'frost', status: 'running' }, { id: 'harvest' }] }, 2_000, '/p')
  const frost = b.jobs.find(j => j.id === 'frost')
  expect(frost?.status).toBe('running')
  // No longer waiting: the reason goes with it.
  expect(frost?.waitingOn).toBeUndefined()
  expect(frost?.updated).toBe(2_000)
  expect(b.jobs.find(j => j.id === 'harvest')?.updated).toBe(1_000)
  expect(b.jobs.find(j => j.id === 'seeds')?.pr).toBe('12')
  expect(mergeBuild(b, { remove: ['mobile'] }, 3_000, '/p').jobs.length).toBe(4)
  expect(wrap('one two three four five six', 11, 40, 2).length).toBe(2)
})

test('the jobs tool writes the build file and answers the list, and opens no pane', async ($, on) => {
  const files = harness(on)
  const ran = await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  const text = JSON.stringify(ran)
  expect(text).toContain('1 of 5 jobs shipped, 1 running, 1 waiting')
  expect(text).toContain('frost [waiting]')
  const path = '/home/test/.claude/savvy-progress/builds/garden-planner.json'
  expect(files.has(path)).toBe(true)
  expect(JSON.parse(files.get(path) ?? '{}').project).toBe('/projects/garden')

  // A later call sends only what changed; the rest stays.
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', build: 'Garden planner', jobs: [{ id: 'harvest', status: 'running' }] })
  const saved = JSON.parse(files.get(path) ?? '{}') as { jobs: { id: string; status: string }[] }
  expect(saved.jobs.map(j => `${j.id}:${j.status}`)).toEqual(['seeds:shipped', 'water:running', 'frost:waiting', 'harvest:running', 'mobile:later'])

  // Marc (Nov 23): the savvy board replaced the Agents pane; nothing opens a pane any more.
  expect(files.opened).toEqual([])
})

test('the band shows the build and counts live sessions, not in-flight Agent calls', async ($, on) => {
  harness(on)
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  // The tool refreshes the sessions in the background; a lookup call lets that land first.
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', build: 'Garden planner' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Jobs 1\/5 · 1 running/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('the band is one glass row that narrows by width', async ($, on) => {
  harness(on)
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const glass = await ui.find({ type: 'Box', key: 'savvy-glass' })
  expect(glass).toBeTruthy()
  // Coach, crew count and dismiss all live inside the one glass row.
  expect(await ui.find({ type: 'Button', key: 'savvy-agents' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'savvy-dismiss' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Jobs 1\/5/ })).toBeTruthy()
  await ui.unmount()

  // About 300px: the figures go first, then the coach; the count, title and bar stay.
  const slim = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 40 } })
  expect(await slim.find({ type: 'Text', text: /Jobs 1\/5/ })).toBeUndefined()
  expect(await slim.find({ type: 'Button', key: 'savvy-agents' })).toBeTruthy()
  expect(await slim.find({ type: 'Text', text: 'Garden planner' })).toBeTruthy()
  await slim.unmount()
})

// Marc: after a restart the band must show the build another session keeps, wherever it was started.
for (const [what, project] of [['the same project', '/projects/garden'], ['another folder', '/projects/elsewhere']] as const) {
  test(`after a restart the band shows a build started in ${what}`, async ($, on) => {
    const files = harness(on)
    on('session.start', (_, e) => e as never)
    on('tool.register', (_, e) => ({ value: { tool: `mcp__savvy-progress__${(e as { name: string }).name}` } }))
    on('command.register', () => ({ value: { command: 'agents-info' } }))
    const b = { ...mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), project) }
    files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(b))
    await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Jobs 1\/5/ })).toBeTruthy()
    await ui.unmount()
  })
}

test('a start hook that fails before the restore still leaves the band showing the build', async ($, on) => {
  const files = harness(on)
  // No registration stubs: the start hook's registrations throw here, as they could in the app.
  on('session.start', (_, e) => e as never)
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/elsewhere')))
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never).catch(() => undefined)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: /Jobs 1\/5/ })).toBeTruthy()
  await ui.unmount()
})

test('agent rows saved before a restart stay saved for the board', async ($, on) => {
  const files = harness(on)
  on('session.start', (_, e) => e as never)
  const at = Date.UTC(2026, 10, 22, 18)
  const run = (id: string, status: 'running' | 'done', description: string) => ({ id, agentId: id, type: 'lab-worker', description, model: 'claude-opus-5-5', status, startedAt: at - 600_000, contextTokens: 1000, contextMax: 1_000_000, tokens: 5000, costUsd: 0.4, steps: 3, round: 1, ...(status === 'done' ? { endedAt: at - 60_000 } : {}) })
  files.set('/home/test/.claude/savvy-progress/agents/cli-test.json', JSON.stringify({ savedAt: at - 30_000, runs: [run('a1', 'done', 'Merge main into job 9'), run('a2', 'running', 'Job 9b hiring plan')] }))
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never).catch(() => undefined)
  await new Promise(r => setTimeout(r, 30))
  const saved = JSON.parse(files.get('/home/test/.claude/savvy-progress/agents/cli-test.json') ?? '{}') as { runs: { id: string; status: string }[] }
  expect(saved.runs.find(r => r.id === 'a2')?.status).toBe('running')
})

test('after a desktop restart gives the chat a new session id, the rows saved under the old id come back', async ($, on) => {
  const files = harness(on)
  on('session.start', (_, e) => e as never)
  files.priors.push('old-id')
  const at = Date.UTC(2026, 10, 22, 18)
  files.set('/home/test/.claude/savvy-progress/agents/cli-test.json', JSON.stringify({ savedAt: at, runs: [] }))
  files.set('/home/test/.claude/savvy-progress/agents/old-id.json', JSON.stringify({ savedAt: at - 30_000, runs: [{ id: 'w1', agentId: 'w1', type: 'lab-worker', description: 'Gate the market page', model: 'claude-opus-5-5', status: 'running', startedAt: at - 600_000, contextTokens: 0, contextMax: 1_000_000, tokens: 0, costUsd: 0.2, steps: 1, round: 1 }] }))
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never).catch(() => undefined)
  await new Promise(r => setTimeout(r, 30))
  // The board reads old-id.json itself; this session counts the row on the band (with the side session).
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  // The tool refreshes the sessions in the background; a lookup call lets that land first.
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', build: 'Garden planner' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(((await band.find({ type: 'Button', key: 'savvy-agents' })) as { props: { label: string } }).props.label).toBe('🔍 ×2')
  await band.unmount()
})

test('a background shell task gets a row while it runs, and finishes once its process is gone', async ($, on) => {
  const h = harness(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }))
  const command = '~/gate.sh ~/repo --push 2>&1 | tail -45'
  h.procs.push(`/bin/zsh -c eval '${command}'`)
  // The band counts the running row: a build with no side sessions, so only the shell is live.
  h.side.length = 0
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  await $.tool.call({ tool: 'Bash', command, description: 'Run the test gate on PR 226', run_in_background: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /Jobs 1\/5 · 1 running/ }), 'running at first').toBeTruthy()
  // Still running at the next tool call; then the process ends and the next check finishes the row.
  h.time.at += 10_000
  await $.tool.call({ tool: 'Bash', command: 'true', description: 'x' })
  await new Promise(r => setTimeout(r, 30))
  expect(await band.find({ type: 'Text', text: /Jobs 1\/5 · 1 running/ }), 'still running').toBeTruthy()
  h.procs.length = 0
  h.time.at += 10_000
  await $.tool.call({ tool: 'Bash', command: 'true', description: 'x' })
  await new Promise(r => setTimeout(r, 30))
  expect(await band.find({ type: 'Text', text: /^Jobs 1\/5 · \d+%$/ }), 'nothing running').toBeTruthy()
  await band.unmount()
})

test('with session.start skipped (a resume), the first tool call brings the build back', async ($, on) => {
  const files = harness(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/garden')))
  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'x' })
  await new Promise(r => setTimeout(r, 30))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Jobs 1\/5/ })).toBeTruthy()
  await ui.unmount()
})

// Marc: nothing opens a pane any more, not even a session with an unfinished build.
test('a fresh session with an unfinished build opens no pane', async ($, on) => {
  const files = harness(on)
  on('session.start', (_, e) => e as never)
  on('tool.register', (_, e) => ({ value: { tool: `mcp__savvy-progress__${(e as { name: string }).name}` } }))
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/garden')))
  await $.session.start({ source: 'startup', cwd: '/projects/garden' } as never)
  expect(files.opened).toEqual([])
})

// Marc: the header says what is happening now and what is next, from the jobs, not a written summary.
test('Now and Next come from the jobs: running first, else waiting; then the next planned', () => {
  const b = mergeBuild(null, SEED, 1_000, '/p')
  expect(nowNext(b)).toEqual({ now: 'Job 2 Watering schedule', next: 'Job 4 Harvest log' })
  const idle = mergeBuild(b, { jobs: [{ id: 'water', status: 'shipped' }] }, 2_000, '/p')
  expect(nowNext(idle).now).toBe('Job 3 Frost alerts (waiting on a weather API key)')
  // The orchestrator's own order wins; else the summary's "Next:" sentence; list order last.
  expect(nowNext(mergeBuild(b, { summary: '1 of 5 shipped. Next: mobile, then harvest.' }, 3_000, '/p')).next).toBe('mobile, then harvest')
  expect(nowNext(mergeBuild(b, { next: ['mobile', 'seeds', 'harvest'] }, 3_000, '/p')).next).toBe('Job 5 Mobile layout · Job 4 Harvest log')
})

// Marc (Nov 23): the band's 🔍 opens the savvy board window and ↻ has it re-read; no pane.
test('the band buttons open the savvy board, never a pane', async ($, on) => {
  const files = harness(on)
  files.set('/home/test/.claude/savvy-progress/board.json', JSON.stringify({ url: 'http://127.0.0.1:7447', start: '/home/test/marc-mods/savvy-board/start-board.sh' }))
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'savvy-agents' })
  await new Promise(r => setTimeout(r, 30))
  expect(files.runs.some(a => a.at(-1) === '/home/test/marc-mods/savvy-board/start-board.sh')).toBe(true)
  await band.press({ key: 'savvy-refresh' })
  expect(files.runs.some(a => a.at(-1) === '--refresh')).toBe(true)
  expect(files.opened).toEqual([])
  await band.unmount()
})
