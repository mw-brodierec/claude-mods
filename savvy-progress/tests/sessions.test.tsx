import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'savvy-progress',
  component: 'Pane',
  requestId: 'savvy-agents',
  props: { title: 'Agents', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const SESSION = {
  id: 'local_abc',
  name: 'fence-repair',
  title: 'Repaint the north fence',
  link: 'claude://claude.ai/epitaxy/local_abc',
  model: 'claude-opus-5-5',
  effort: 'high',
  running: false,
  state: 'blocked',
  createdAt: 1_000,
  lastAt: 500_000,
  activeMs: 244_000,
  context: 120_000,
  requests: 30,
  models: { 'claude-opus-5-5': [100, 10_000, 4_000_000, 0, 1_000_000] },
}

test('a linked side session shows its cost and time and opens its chat', async ($, on) => {
  const opened: string[][] = []
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key
    if (key === 'sessions') return { value: { value: [SESSION], version: 1 } }
    if (key === 'flow')
      return {
        value: {
          value: { title: 'Sweep', total: 2, done: 0, running: 0, phase: 'delegate', isFinished: false, tasks: [
            { title: 'Repaint the fence', tier: 'careful', after: [], session: 'fence-repair' },
            { title: 'Something else', tier: 'light', after: [] },
          ] },
          version: 1,
        },
      }
    return { value: {} }
  })
  on('process.run', (_, e) => {
    opened.push([...(e as { argv: readonly string[] }).argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', key: 'open-local_abc' })).toBeTruthy()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 100 in + 10k out + 4M cache read + 1M 1h write on Opus 5.5 ≈ $8.00 + $0.20 + $0.80
  expect((await ui.find({ type: 'Text', text: /≈\$9\.00/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /4:04/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /needs you/ }))?.text).toBeTruthy()
  // Cache reads are counted apart from new tokens.
  expect((await ui.find({ type: 'Text', text: /1\.0M new tokens · \+4\.0M cached/ }))?.text).toBeTruthy()
  // The linked task leaves the planned list; the other stays.
  expect(await ui.find({ type: 'Text', text: /1\. Repaint the fence/ })).toBeFalsy()
  await $.ui.press({ plugin: 'savvy-progress', key: 'open-local_abc' })
  expect(opened.at(-1)).toEqual(['open', 'claude://claude.ai/epitaxy/local_abc'])
  await ui.unmount()
})
