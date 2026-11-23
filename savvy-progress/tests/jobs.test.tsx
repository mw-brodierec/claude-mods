import { expect, test } from 'claude-code/testing'

import { mergeBuild, summaryLine, wrap } from '../hooks/jobs'

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
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 22, 18) }))
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
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify([SESSION]), stderr: '' } }))
  return Object.assign(files, { store, opened })
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
