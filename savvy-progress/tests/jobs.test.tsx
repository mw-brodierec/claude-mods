import { expect, test } from 'claude-code/testing'

import { mergeBuild, nowNext, summaryLine, wrap } from '../hooks/jobs'

// Invented sample data only: this repository is public.
const PANE = {
  plugin: 'savvy-progress',
  component: 'Pane',
  requestId: 'savvy-agents',
  props: { title: 'Agents', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

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
  on('ui.close', () => ({ value: undefined }))
  // The CLI ids this session had before a restart (sessions.py --prior).
  const priors: string[] = []
  // The command lines `ps` lists, for the background shell rows.
  const procs: string[] = []
  // What sessions.py lists: side sessions, and with --live other chats on the machine.
  const side: Record<string, unknown>[] = [SESSION]
  on('process.run', (_, e) => {
    const text = JSON.stringify(e)
    if (text.includes('"ps"')) return { value: { exitCode: 0, stdout: procs.join('\n'), stderr: '' } }
    return { value: { exitCode: 0, stdout: JSON.stringify(text.includes('--prior') ? priors : side), stderr: '' } }
  })
  return Object.assign(files, { store, opened, priors, procs, time, side })
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

test('the jobs tool writes the build file, answers the list, and the pane shows it', async ($, on) => {
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

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.findAll({ type: 'Link' })).map(l => l.text)).toContain('PR 12 ↗')
    expect(await ui.find({ type: 'Button', key: 'shipped' })).toBeTruthy()
    // The side session's own row still opens its chat.
    expect(await ui.find({ type: 'Button', key: 'open-local_w1' })).toBeTruthy()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 of 5 jobs shipped, 2 running, 1 waiting/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Waiting on: a weather API key/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Updated Sun Nov 22/ })).toBeTruthy()
  // The job's linked side session is listed on its card with its state.
  expect(await ui.find({ type: 'Text', text: /water-sched · running/ })).toBeTruthy()
  await ui.unmount()
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

test('the desktop pane lays out by width with only a Swap button, and the band is one glass row', async ($, on) => {
  harness(on)
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })

  const label = async (ui: { find: (q: object) => Promise<unknown> }, key: string) => ((await ui.find({ type: 'Button', key })) as { props: { label: string } } | undefined)?.props.label
  const wide = { ...PANE, surface: 'desktop' as const, props: { ...PANE.props, bodyColumns: 140 } }
  const side = await $.ui.mount(wide)
  // Wide, it opens side by side, two equal columns; Swap is the only control.
  expect(await label(side, 'layout-swap')).toBe('⇄ Swap')
  expect(await side.find({ type: 'Button', key: 'layout-side' })).toBeUndefined()
  expect(await side.find({ type: 'Button', key: 'layout-stacked' })).toBeUndefined()
  const cols = (await side.findAll({ type: 'Box' })) as { key?: string; props: { flexGrow?: number; width?: number } }[]
  expect(cols.filter(x => (x.key === 'jobs-col' || x.key === 'agents-col') && x.props.flexGrow === 1 && x.props.width === 0).length).toBe(2)
  // Drawings carry no size, so the app fits each to its column, and none is a hoverable frame
  // (a frame keeps its drawn height when the picture shrinks, leaving uneven gaps).
  const svgs = (await side.findAll({ type: 'Svg' })) as { props: { width?: number; isInteractive?: boolean; alt: string } }[]
  expect(svgs.every(x => x.props.width === undefined)).toBe(true)
  expect(svgs.some(x => x.props.isInteractive)).toBe(false)
  // Swap puts the agents column first.
  const order = async () => ((await side.findAll({ type: 'Box' })) as { key?: string }[]).map(x => x.key).filter(k => k === 'jobs-col' || k === 'agents-col')
  expect(await order()).toEqual(['jobs-col', 'agents-col'])
  await side.press({ key: 'layout-swap' })
  expect(await order()).toEqual(['agents-col', 'jobs-col'])
  await side.unmount()

  // Too narrow for two legible columns: it stacks by itself, with no hint text.
  const narrow = await $.ui.mount({ ...wide, props: { ...wide.props, bodyColumns: 60 } })
  const ncols = (await narrow.findAll({ type: 'Box' })) as { key?: string; props: { flexGrow?: number } }[]
  expect(ncols.filter(x => (x.key === 'jobs-col' || x.key === 'agents-col') && x.props.flexGrow === 1).length).toBe(0)
  expect(await label(narrow, 'layout-swap')).toBe('⇅ Swap')
  expect(await narrow.find({ type: 'Text', text: /Widen the pane/ })).toBeUndefined()
  await narrow.unmount()

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

test('a pane left open comes back after a restart, and one closed by hand does not', async ($, on) => {
  const { store, opened } = harness(on)
  on('session.start', (_, e) => e as never)
  const at = Date.UTC(2026, 10, 22, 18)

  await $.command.run({ command: 'agents-info', args: '' })
  expect(store.get('open-panes')).toEqual({ 'cli-test': at })

  // A restart: the engine starts the session again with the pane gone.
  opened.length = 0
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never)
  expect(opened).toEqual(['savvy-agents'])

  // Closed again: forgotten, so the next start leaves it shut.
  await $.command.run({ command: 'agents-info', args: '' })
  expect(store.get('open-panes')).toEqual({})
  opened.length = 0
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never)
  expect(opened).toEqual([])
})

// Marc: after a restart the pane must show the build another session keeps, wherever it was started.
for (const [what, project] of [['the same project', '/projects/garden'], ['another folder', '/projects/elsewhere']] as const) {
  test(`after a restart the pane shows a build started in ${what}`, async ($, on) => {
    const files = harness(on)
    on('session.start', (_, e) => e as never)
    on('tool.register', (_, e) => ({ value: { tool: `mcp__savvy-progress__${(e as { name: string }).name}` } }))
    on('command.register', () => ({ value: { command: 'agents-info' } }))
    const b = { ...mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), project) }
    files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(b))
    await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Garden planner/ })).toBeTruthy()
    await ui.unmount()
  })
}

test('a start hook that fails before the restore still leaves the pane showing the build', async ($, on) => {
  const files = harness(on)
  // No registration stubs: the start hook's registrations throw here, as they could in the app.
  on('session.start', (_, e) => e as never)
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/elsewhere')))
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never).catch(() => undefined)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: /Garden planner/ })).toBeTruthy()
  await ui.unmount()
})

test('agent rows come back after a restart, a row still running then shown as finished', async ($, on) => {
  const files = harness(on)
  on('session.start', (_, e) => e as never)
  const at = Date.UTC(2026, 10, 22, 18)
  const run = (id: string, status: 'running' | 'done', description: string) => ({ id, agentId: id, type: 'lab-worker', description, model: 'claude-opus-5-5', status, startedAt: at - 600_000, contextTokens: 1000, contextMax: 1_000_000, tokens: 5000, costUsd: 0.4, steps: 3, round: 1, ...(status === 'done' ? { endedAt: at - 60_000 } : {}) })
  files.set('/home/test/.claude/savvy-progress/agents/cli-test.json', JSON.stringify({ savedAt: at - 30_000, runs: [run('a1', 'done', 'Merge main into job 9'), run('a2', 'running', 'Job 9b hiring plan')] }))
  await $.session.start({ source: 'resume', cwd: '/projects/garden' } as never).catch(() => undefined)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: /Merge main into job 9/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Job 9b hiring plan/ })).toBeTruthy()
  await ui.unmount()
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
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: /Gate the market page/ })).toBeTruthy()
  await ui.unmount()
})

test('a background shell task gets a row while it runs, and finishes once its process is gone', async ($, on) => {
  const h = harness(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }))
  const command = '~/gate.sh ~/repo --push 2>&1 | tail -45'
  h.procs.push(`/bin/zsh -c eval '${command}'`)
  await $.tool.call({ tool: 'Bash', command, description: 'Run the test gate on PR 226', run_in_background: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Run the test gate on PR 226/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeTruthy()
  // Still running at the next tool call; then the process ends and the next check finishes the row.
  h.time.at += 10_000
  await $.tool.call({ tool: 'Bash', command: 'true', description: 'x' })
  expect(await ui.find({ type: 'Text', text: '●' })).toBeTruthy()
  h.procs.length = 0
  h.time.at += 10_000
  await $.tool.call({ tool: 'Bash', command: 'true', description: 'x' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeTruthy()
  await ui.unmount()
})

test('with session.start skipped (a resume), the first tool call brings the build back', async ($, on) => {
  const files = harness(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/garden')))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'x' })
  await new Promise(r => setTimeout(r, 30))
  expect(await ui.find({ type: 'Text', text: /Garden planner/ })).toBeTruthy()
  await ui.unmount()
})

// Marc: a new chat never opens the pane just because some build is unfinished.
test('a fresh session with an unfinished build keeps the pane shut', async ($, on) => {
  const files = harness(on)
  on('session.start', (_, e) => e as never)
  on('tool.register', (_, e) => ({ value: { tool: `mcp__savvy-progress__${(e as { name: string }).name}` } }))
  on('command.register', () => ({ value: { command: 'agents-info' } }))
  files.set('/home/test/.claude/savvy-progress/builds/garden-planner.json', JSON.stringify(mergeBuild(null, SEED, Date.UTC(2026, 10, 22, 17), '/projects/garden')))
  await $.session.start({ source: 'startup', cwd: '/projects/garden' } as never)
  expect(files.opened).toEqual([])
})

// Marc: the totals are the build's; other chats and other sessions' agents show only on request.
test('other chats stay out of the build totals and show only with Show all chats', async ($, on) => {
  const files = harness(on)
  // A busy unrelated chat ($20 of output) and an unrelated agent saved by another session ($50).
  files.side.push({ ...SESSION, id: 'local_x', name: '', title: 'JARVIS sweep', cli: 'cli-x', isOther: true, running: true, models: { 'claude-opus-5-5': [0, 1_000_000, 0, 0, 0] } })
  const run = { id: 'ag-y', agentId: 'ag-y', type: 'Explore', description: 'Unrelated digging', model: 'claude-opus-5-5', status: 'running', startedAt: files.time.at - 1_000, contextTokens: 0, contextMax: 1e6, tokens: 0, costUsd: 50, steps: 1, round: 1 }
  files.set('/home/test/.claude/savvy-progress/agents/cli-y.json', JSON.stringify({ savedAt: files.time.at, runs: [run] }))
  // The build opens the pane and refreshes the chats and other sessions' rows in the background.
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  await new Promise(r => setTimeout(r, 30))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /JARVIS sweep/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Unrelated digging/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /≈\$0\.02 ·/ })).toBeTruthy()

  await ui.press({ key: 'show-all' })
  expect(await ui.find({ type: 'Text', text: /JARVIS sweep/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Unrelated digging/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /≈\$0\.02 ·/ }), 'the totals stay the build\'s').toBeTruthy()
  await ui.unmount()
})

// Marc: a finished worker sleeps (eyes shut, z's rising); a running one doesn't.
test('a finished session sleeps on its card and a running one does not', async ($, on) => {
  const files = harness(on)
  files.side[0] = { ...SESSION, running: false }
  files.side.push({ ...SESSION, id: 'local_r', name: 'other-job', title: 'Frost alerts', running: true })
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  await new Promise(r => setTimeout(r, 30))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 60 } })
  const svgs = (await ui.findAll({ type: 'Svg' })) as { props: { alt: string; source: string } }[]
  const card = (name: string) => svgs.find(x => x.props.alt.startsWith(name))?.props.source ?? ''
  expect(card('Watering schedule')).toContain('class="s zz"')
  expect(card('Frost alerts')).not.toContain('class="s zz"')
  await ui.unmount()
})

// Marc: a card glows only under the pointer: a hidden layer the app's hover reveals, and every
// drawing stays a plain image (an interactive frame left uneven gaps).
test('cards glow only on hover, through a hidden layer over a plain image', async ($, on) => {
  harness(on)
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  await new Promise(r => setTimeout(r, 30))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 60 } })
  // findAll leaves hover styles out; the drawn tree keeps them.
  type Node = { type?: string; key?: string; props?: Record<string, unknown>; hover?: { display?: string }; children?: unknown[] }
  const all: Node[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    all.push(n as Node)
    for (const c of (n as Node).children ?? []) walk(c)
  }
  walk(await ui.drawn())
  // In the drawn tree a Box's key, the hover scope, sits in its props.
  const card = all.find(x => x.props?.key === 'local_w1')
  expect(card?.props?.position).toBe('relative')
  const layers = all.filter(x => x.props?.display === 'none' && x.hover?.display === 'flex' && x.props?.position === 'absolute')
  expect(layers.length).toBeGreaterThan(1)
  expect(layers.every(x => x.props?.key === undefined), 'a keyed layer would be its own hover scope and never light').toBe(true)
  const svgs = (await ui.findAll({ type: 'Svg' })) as { props: { source: string; isInteractive?: boolean } }[]
  expect(svgs.some(x => x.props.isInteractive)).toBe(false)
  expect(svgs.some(x => /class="glive"|class="gfaint"/.test(x.props.source))).toBe(false)
  await ui.unmount()
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

// Marc: a job's PR link sits inside its card, and the pane has a Refresh button that re-reads everything.
test('the PR link is inside its job card, and Refresh re-reads the pane', async ($, on) => {
  harness(on)
  await $.tool.call({ tool: 'mcp__savvy-progress__jobs', ...SEED })
  await new Promise(r => setTimeout(r, 30))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 60 } })
  type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const find = (n: unknown, pred: (x: Node) => boolean): Node | undefined => {
    if (!n || typeof n !== 'object') return undefined
    if (pred(n as Node)) return n as Node
    for (const c of (n as Node).children ?? []) {
      const hit = find(c, pred)
      if (hit) return hit
    }
    return undefined
  }
  const card = find(await ui.drawn(), x => x.props?.key === 'job-seeds')
  expect(find(card, x => x.type === 'Link' && x.props?.href === 'https://example.com/pr/12')).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeTruthy()
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Button', key: 'refresh' })).toBeTruthy()
  await ui.unmount()
})
