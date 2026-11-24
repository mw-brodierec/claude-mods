import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Build, Flow, Phase, PlannedTask, SideSession } from '../types'
import { buildReport, countJobs, mergeBuild, slug, textWidth } from './jobs'
import type { JobsInput } from './jobs'

const flow = atom({ plugin: 'savvy-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
const sessions = atom({ plugin: 'savvy-progress', key: 'sessions' } as const, [])
// Marc: the build this session shows; its truth is the JSON file, re-read on a timer.
const build = atom({ plugin: 'savvy-progress', key: 'build' } as const, null)
// Marc: every other session's agent rows, so the band counts the whole build from any session.
const fleet = atom({ plugin: 'savvy-progress', key: 'fleet' } as const, [])

const TOOL = 'mcp__savvy-progress__progress'
const STEP_TOOL = 'mcp__savvy-progress__step'
const JOBS_TOOL = 'mcp__savvy-progress__jobs'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[]; session?: string }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Russian.

type Lang = 'en' | 'ru'

const STRINGS = {
  en: {
    running: 'Running',
    after: 'after',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    states: { blocked: 'needs you', review_ready: 'ready for review', completed: 'done' } as Record<string, string>,
    jobsWord: 'Jobs',
    doneWord: 'done',
    otherChat: 'other chat',
  },
  ru: {
    running: 'Работают',
    after: 'после',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    states: { blocked: 'ждёт тебя', review_ready: 'на проверку', completed: 'готово' } as Record<string, string>,
    jobsWord: 'Задачи',
    doneWord: 'готово',
    otherChat: 'другой чат',
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return isRussian(settings.language) ? 'ru' : 'en'
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return isRussian(locale) ? 'ru' : 'en'
}

const blank = (): Flow => ({
  title: 'savvy-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && input.title.trim() !== prev.title)

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: (t.tier ?? '').replace(/^savvy-/, '').trim().toLowerCase(),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0),
      ...(t.session?.trim() ? { session: t.session.trim() } : {}),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total)))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: input.title?.trim() || base.title,
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

// Marc: "running" counts live agents and side sessions, not in-flight Agent calls (a
// background agent's call returns at once, and side sessions never made one).
const liveCount = (runs: readonly AgentRun[]): number => runs.filter(a => a.status === 'running').length

const label = (f: Flow, runs: readonly AgentRun[] = []): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const live = liveCount(runs)
  if (!f.total) return `${live} ${s.busy} · ${runs.length - live} ${s.doneWord}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${f.done}/${f.total}${live ? ` · ${live} ${s.busy}` : ''}`
}

// With no planned total, finished runs out of all runs.
const ratio = (f: Flow, runs: readonly AgentRun[] = []): number =>
  f.isFinished ? 1 : f.total ? f.done / f.total : runs.length ? (runs.length - liveCount(runs)) / runs.length : 0

// Marc: the band's fill as native slices, deep purple to light, the last the brightest tip.
const LASER_STEPS = ((from: number[], to: number[], n: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = Math.pow(i / (n - 1), 1.3)
    return `#${from.map((f, k) => Math.round(f + ((to[k] ?? f) - f) * t).toString(16).padStart(2, '0')).join('')}`
  }))([0x3b, 0x0f, 0x8c], [0xc4, 0xb5, 0xfd], 14)


const barText = (r: number, width: number): string => {
  const filled = Math.round(width * r)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Build jobs (Marc): the list lives in ~/.claude/savvy-progress/builds/<id>.json, so
// every session, a resumed orchestrator included, reads the same build.

// Marc: native glass for the band, neutral so it reads on light and dark. Translucent fill and
// edge and a soft light across the top; no hover effect. The skins band wears the same.
const GLASS_EDGE = '#9a9a9a59'
const GLASS_FILL = '#8080800d'
// The light across the top: a wide drawing pinned under the band's
// parts and clipped by its corners. The skins band draws the same one.
const GLASS_SHEEN = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="40" viewBox="0 0 2400 40"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/></linearGradient></defs><rect width="2400" height="40" fill="url(#s)"/><rect width="2400" height="1" fill="url(#r)"/></svg>`
// The band's bodyColumns counts cells of the app's code font, about 8px; taken a little smaller to stay safe.
const BAND_CELL_PX = 7.4
// Marc (seen in a capture of the app): an absolute Box sizes itself to its parent, and the app caps
// a drawing at its box's width, so a wide drawing (the band's beam, a sheen) was squeezed to a
// sliver and never showed. Such a box gets a width of its own, in cells, wider than any drawing.
const WIDE_CELLS = 320

const buildsDir = async ($: EngineInterface): Promise<string> => `${(await $.env.get('HOME')) || '~'}/.claude/savvy-progress/builds`

const isBuild = (v: unknown): v is Build =>
  typeof v === 'object' && v !== null && typeof (v as Build).id === 'string' && Array.isArray((v as Build).jobs)

async function loadBuild($: EngineInterface, id: string): Promise<Build | null> {
  try {
    const parsed: unknown = JSON.parse(String(await $.fs.read(`${await buildsDir($)}/${slug(id)}.json`)))
    return isBuild(parsed) ? parsed : null
  } catch {
    return null
  }
}

const saveBuild = async ($: EngineInterface, b: Build): Promise<void> =>
  $.fs.write(`${await buildsDir($)}/${b.id}.json`, JSON.stringify(b, null, 2) + '\n')

// The build a session should show when it has none: the newest unfinished build this chat
// reported (it is in `orchestrators`, under its current CLI id or one it had before a restart).
// Marc (Nov 24): never a build because it is recent or shares a folder; that put the band, and
// the band's ✕ that never stuck, into every unrelated chat.
const isLead = (b: Build, ids: readonly string[]): boolean => (b.orchestrators ?? []).some(o => ids.includes(o))
async function latestBuildFor($: EngineInterface, ids: readonly string[]): Promise<Build | null> {
  try {
    const dir = await buildsDir($)
    const names = (await $.fs.list(dir)).filter(x => x.kind === 'file' && x.name.endsWith('.json'))
    const all = (await Promise.all(names.map(x => loadBuild($, x.name.replace(/\.json$/, '')))))
      .filter((b): b is Build => b !== null && !b.isFinished && b.jobs.length > 0 && isLead(b, ids))
      .sort((a, z) => z.updatedAt - a.updatedAt)
    return all[0] ?? null
  } catch {
    return null
  }
}

// This chat's CLI ids, current first, then the ones it had before a restart (sessions.py --prior).
let mine: string[] | null = null
async function myIds($: EngineInterface): Promise<string[]> {
  const id = await $.session.id()
  if (mine?.[0] !== id) mine = [id, ...(await priorIds($, id))]
  return mine
}

// Marc: the band's ✕ sticks. The store keeps session id → dismissed build id, so the restore below
// skips it after a reload or restart too; the chat calling the jobs tool again brings it back.
const DISMISSED_KEY = 'dismissed-builds'
const readDismissed = async ($: EngineInterface): Promise<Record<string, string>> => {
  const v = await $.store.get(DISMISSED_KEY).catch(() => undefined)
  return v && typeof v === 'object' ? (v as Record<string, string>) : {}
}
async function setDismissed($: EngineInterface, buildId: string | null): Promise<void> {
  const ids = await myIds($)
  const map = Object.fromEntries(Object.entries(await readDismissed($)).filter(([k]) => !ids.includes(k)))
  if (buildId) map[ids[0]] = buildId
  await $.store.set(DISMISSED_KEY, map)
}

// Restores this chat's build when it shows none, and otherwise picks up other sessions' changes
// to it, at most every 15s. Called at start, on every draw of the band and on the timer:
// /resume, /clear and a restart reset $.state and skip session.start (and with it the timer), so
// the draws are what bring a resumed session's build back.
let lastLookup = 0
async function ensureBuild($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  if (at - lastLookup < 15_000 && lastLookup !== 0) return
  lastLookup = at
  const ids = await myIds($)
  const held = await read($, build)
  // A build adopted by an older copy of this mod, in a chat that never reported it: let it go.
  if (held && !isLead(held, ids)) return void (await update($, build, () => null))
  if (held) return refreshBuild($)
  const found = await latestBuildFor($, ids)
  if (!found) return
  const dismissed = await readDismissed($)
  if (ids.some(i => dismissed[i] === found.id)) return
  if (!(await read($, build))) await update($, build, () => found)
}

// Marc: the agent rows survive a restart. The list lives in $.state, which a restart, /resume or
// /clear resets, so it is also kept in ~/.claude/savvy-progress/agents/<session id>.json and read
// back when a session shows an empty list. A row still running when it was saved died with the
// old process, so it comes back finished at the time of the save.
// The CLI session ids this desktop session had before the current one (sessions.py --prior).
async function priorIds($: EngineInterface, id: string): Promise<string[]> {
  try {
    const { exitCode, stdout } = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/sessions.py`, '--prior', id], { timeoutMs: 10_000 })
    const ids: unknown = exitCode === 0 ? JSON.parse(stdout) : []
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[\w-]+$/.test(x)) : []
  } catch {
    return []
  }
}

let agentsLoaded = false
let agentsSaved = ''
let agentsSavedAt = 0
async function syncAgents($: EngineInterface, isForced = false): Promise<void> {
  try {
    const dir = `${(await $.env.get('HOME')) || '~'}/.claude/savvy-progress/agents`
    const id = await $.session.id()
    const file = `${dir}/${id}.json`
    const list = await read($, agents)
    if (!agentsLoaded) {
      agentsLoaded = true
      if (list.length === 0) {
        // A desktop restart continues the chat under a new CLI session id: fall back to the
        // rows saved under the ids it had before, newest first.
        const readRuns = async (path: string): Promise<{ savedAt?: number; runs: AgentRun[] }> => {
          try {
            const saved = JSON.parse(String(await $.fs.read(path))) as { savedAt?: number; runs?: AgentRun[] }
            return { savedAt: saved.savedAt, runs: Array.isArray(saved.runs) ? saved.runs.filter(r => r && typeof r.id === 'string') : [] }
          } catch {
            return { runs: [] }
          }
        }
        let saved = await readRuns(file)
        if (!saved.runs.length) {
          for (const prior of (await priorIds($, id)).reverse()) {
            saved = await readRuns(`${dir}/${prior}.json`)
            if (saved.runs.length) break
          }
        }
        const runs = saved.runs
        if (runs.length) {
          const endedAt = saved.savedAt ?? (await $.clock.now())
          await update($, agents, cur => (cur.length ? cur : runs.map(r => (r.status === 'running' ? { ...r, status: 'done' as const, endedAt } : r))))
          agentsSaved = JSON.stringify(await read($, agents))
        }
        return
      }
    }
    if (list.length === 0) return
    const text = JSON.stringify(list)
    const at = await $.clock.now()
    // A forced save (the 15s timer) rewrites unchanged rows while one runs: the fresh savedAt is the
    // heartbeat other sessions read to tell a live row from one whose process is gone.
    const isHeartbeat = isForced && list.some(a => a.status === 'running')
    if ((text === agentsSaved && !isHeartbeat) || (!isForced && at - agentsSavedAt < 3_000)) return
    agentsSaved = text
    agentsSavedAt = at
    await $.fs.write(file, JSON.stringify({ savedAt: at, runs: list }))
  } catch {
    // A list that can't be saved still shows; the next draw tries again.
  }
}

// The clocks: running agents tick every second; every 15s the build, the saved agent rows and the
// side sessions (other processes) are re-read. Started at session start and, since /resume and a
// restart can skip that, by the first draw of the band; once per process either way.
let timersStarted = false
let timers: { cancel: () => void }[] = []
// `isRestart` (the Refresh button): drops the running clocks and starts fresh ones.
function startTimers($: EngineInterface, isRestart = false): void {
  if (timersStarted && !isRestart) return
  for (const t of timers) t.cancel()
  timersStarted = true
  timers = []
  timers.push($.clock.every(15_000, () => {
    void (async () => {
      await ensureBuild($)
      await syncAgents($, true)
      await shellsDone($)
      if ((await read($, build)) || (await read($, flow))) await refreshSessions($)
    })()
  }))
}

// Marc: the band's ↻. Everything is re-read now (the build file, this session's saved rows, the
// chats, other sessions' rows) and the clocks start over, for when a clock died with its process.
async function refreshNow($: EngineInterface): Promise<void> {
  lastLookup = 0
  startTimers($, true)
  await ensureBuild($)
  await syncAgents($, true)
  await shellsDone($)
  await refreshSessions($)
}

// Marc (Nov 23): the savvy board (savvy-board/ in this repo) replaced the Agents pane. It is a
// desktop window apart from any session; the band's 🔍 and ↻ open it. Its server writes where its
// launcher is to ~/.claude/savvy-progress/board.json each time it starts.
async function openBoard($: EngineInterface, isRefresh = false): Promise<boolean> {
  try {
    const home = (await $.env.get('HOME')) || '~'
    const d = JSON.parse(String(await $.fs.read(`${home}/.claude/savvy-progress/board.json`))) as { start?: unknown }
    if (typeof d.start !== 'string' || !d.start.endsWith('/savvy-board/start-board.sh')) return false
    const { exitCode } = await $.process.run(['/bin/zsh', d.start, ...(isRefresh ? ['--refresh'] : [])], { timeoutMs: 20_000 })
    return exitCode === 0
  } catch {
    return false
  }
}

function kick($: EngineInterface): void {
  startTimers($)
  void ensureBuild($).catch(() => undefined)
  void syncAgents($)
  void shellsDone($)
}

// Background shell rows still marked running whose command no process runs any more: finished.
let lastShellCheck = 0
async function shellsDone($: EngineInterface): Promise<void> {
  try {
    const list = await read($, agents)
    const open = list.filter(a => a.type === 'shell' && a.status === 'running' && a.command)
    if (!open.length) return
    const at = await $.clock.now()
    if (at - lastShellCheck < 5_000) return
    lastShellCheck = at
    const { exitCode, stdout } = await $.process.run(['ps', '-axww', '-o', 'command='], { timeoutMs: 5_000 })
    if (exitCode !== 0) return
    const ended = open.filter(a => !stdout.includes(String(a.command).slice(0, 120))).map(a => a.id)
    if (ended.length) await update($, agents, l => l.map(a => (ended.includes(a.id) ? { ...a, status: 'done' as const, endedAt: at } : a)))
  } catch {
    // Checked again on the next tick.
  }
}

// Another session may have written the file: pick its changes up.
async function refreshBuild($: EngineInterface): Promise<void> {
  const cur = await read($, build)
  if (!cur) return
  const disk = await loadBuild($, cur.id)
  if (disk && disk.updatedAt !== cur.updatedAt) await update($, build, () => disk)
}



// ---------------------------------------------------------------------------
// Agent rows: every subagent of the session, plus the tasks the flow planned. The savvy board
// reads them from the files syncAgents writes.

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// The engine reports tokens, not money, so the cost is an estimate.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string): [number, number, number, number] =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]

const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = priceOf(model)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// --- side sessions: the desktop app's sessions this one started (start_session).

// A row of sessions.py: input, output, cache read, cache write 5m, cache write 1h (twice the input price).
const sideCost = (models: Record<string, number[]>): number =>
  Object.entries(models).reduce((sum, [model, [inp = 0, out = 0, rd = 0, w5 = 0, w1h = 0]]) => {
    const [i, o, r, w] = priceOf(model)
    return sum + (inp * i + out * o + rd * r + w5 * w + w1h * 2 * i) / 1e6
  }, 0)

// A task names its session by `session` (name or id); else a title equal to the session's.
const taskOf = (f: Flow | null, s: SideSession): PlannedTask | undefined =>
  f?.tasks.find(t => (t.session ? t.session === s.name || t.session === s.id : norm(t.title) === norm(s.title)))

// `leads`: the build's orchestrator sessions; another chat that is one of them belongs to the build.
const sideRuns = (list: SideSession[], f: Flow | null, leads: ReadonlySet<string> = new Set()): AgentRun[] =>
  list.map(s => {
    const task = taskOf(f, s)
    const model = Object.keys(s.models)[0] || s.model
    const tokens = Object.values(s.models).reduce((n, row) => n + row.reduce((a, b) => a + b, 0), 0)
    return {
      id: s.id,
      type: task ? `savvy-${task.tier}` : 'session',
      description: task?.title ?? s.title,
      model,
      effort: s.effort || undefined,
      status: s.running ? 'running' : s.state === 'blocked' ? 'waiting' : 'done',
      startedAt: s.createdAt,
      endedAt: s.running ? undefined : s.lastAt,
      contextTokens: s.context,
      contextMax: windowOf(model),
      tokens,
      cachedTokens: Object.values(s.models).reduce((n, row) => n + (row[2] ?? 0), 0),
      costUsd: sideCost(s.models),
      steps: s.requests,
      round: 1,
      link: s.link,
      name: s.name,
      activeMs: s.activeMs,
      ...(s.isOther && !(s.cli && leads.has(s.cli)) ? { isOutside: true } : {}),
      // Marc: a chat this session didn't start says so.
      note: s.isOther ? (s.running ? tr().otherChat : tr().states[s.state] ?? tr().otherChat) : s.running ? undefined : tr().states[s.state],
    }
  })

async function refreshSessions($: EngineInterface): Promise<void> {
  try {
    const id = await $.session.id()
    const b = await read($, build)
    const extra = [...new Set((b?.jobs ?? []).flatMap(j => j.sessions).filter(x => x.startsWith('local_')))]
    const { exitCode, stdout } = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/sessions.py`, id, '--live', ...extra], { timeoutMs: 20_000 })
    if (exitCode !== 0) return
    const list = JSON.parse(stdout) as SideSession[]
    await update($, sessions, () => list)
  } catch {
    // Not on a Mac with the desktop app, or a file mid-write: keep the last read.
  }
  // Other sessions' agent rows move with the chats: refreshed together, wherever this is called.
  await refreshFleet($)
}

// This session's rows, its side sessions and other chats, then other sessions' saved rows. A saved
// row whose session also shows as a chat row is marked a shadow: that row's cost already has it.
// Marc: only the build's own rows count; everything else is marked outside (shown on request).
const everyRun = async ($: EngineInterface): Promise<AgentRun[]> => {
  const side = await read($, sessions)
  // The build's sessions: those that reported it, the chats that started its side sessions (a build
  // saved before `orchestrators` existed still finds its orchestrator), and those side sessions.
  const ownSide = side.filter(s => !s.isOther)
  const leads = new Set([
    ...((await read($, build))?.orchestrators ?? []),
    ...ownSide.flatMap(s => [s.parentCli ?? '', s.cli ?? '']).filter(Boolean),
  ])
  const own = [...(await read($, agents)), ...sideRuns(side, await read($, flow), leads)]
  const seen = new Set(own.map(a => a.id))
  const counted = new Set(side.map(s => s.cli).filter(Boolean))
  const others = (await read($, fleet))
    .filter(a => !seen.has(a.id))
    .map(a => ({
      ...a,
      ...(a.fromSession && counted.has(a.fromSession) ? { isShadow: true } : {}),
      ...(a.fromSession && leads.has(a.fromSession) ? {} : { isOutside: true }),
    }))
  return [...own, ...others]
}

const allRuns = async ($: EngineInterface): Promise<AgentRun[]> => (await everyRun($)).filter(a => !a.isOutside)

// Marc: other sessions' agent rows, from the files each session saves (syncAgents). Rows from the
// last FLEET_MS only; a row still "running" in a file not saved for FLEET_STALE_MS lost its process
// (no heartbeat), so it shows finished at its last save.
// ponytail: re-reads every file on each 15s tick; fine for dozens, index them if hundreds pile up.
const FLEET_MS = 12 * 3600_000
const FLEET_STALE_MS = 60_000
async function refreshFleet($: EngineInterface): Promise<void> {
  try {
    const mine = await myIds($)
    const dir = `${(await $.env.get('HOME')) || '~'}/.claude/savvy-progress/agents`
    const at = await $.clock.now()
    const files = (await $.fs.list(dir)).filter(x => x.kind === 'file' && x.name.endsWith('.json') && !mine.includes(x.name.replace(/\.json$/, '')))
    const rows: AgentRun[] = []
    for (const f of files) {
      let saved: { savedAt?: number; runs?: AgentRun[] }
      try {
        saved = JSON.parse(String(await $.fs.read(`${dir}/${f.name}`))) as typeof saved
      } catch {
        continue
      }
      const savedAt = saved.savedAt ?? 0
      if (at - savedAt > FLEET_MS || !Array.isArray(saved.runs)) continue
      const from = f.name.replace(/\.json$/, '')
      for (const r of saved.runs) {
        if (!r || typeof r.id !== 'string' || at - r.startedAt > FLEET_MS) continue
        const isDead = r.status === 'running' && at - savedAt > FLEET_STALE_MS
        rows.push({ ...r, fromSession: from, ...(isDead ? { status: 'done' as const, endedAt: savedAt } : {}) })
      }
    }
    const next = JSON.stringify(rows)
    if (next !== JSON.stringify(await read($, fleet))) await update($, fleet, () => rows)
  } catch {
    // No folder yet: nothing saved by anyone.
  }
}

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lastLookup = 0
    await ensureBuild($).catch(() => undefined)
    await syncAgents($)
    lang = await detectLang($, options.language)
    await $.tool.register({
      name: 'progress',
      description:
        'Report /savvy-flow progress to the progress bar above the prompt and the savvy board. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
          done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the board can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: ['fable', 'heavy', 'careful', 'medium', 'light'] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
                session: {
                  type: 'string',
                  description: 'When the task runs as a side session (start_session): its short name or local_… id, so the board shows its cost and opens it.',
                },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For savvy-flow workers: report progress on your own task to the savvy board. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
    })
    await $.tool.register({
      name: 'jobs',
      description:
        'Report a multi-job build (each job = one PR) to the band above the prompt and the savvy board window. ' +
        'The list is kept in a file per build, so any later session can read it back: call with only `build` to load it and get the list. ' +
        'Call it: when a multi-job build is planned (seed every job from the build memo, status planned or later); when a job starts (running, with its side session names or local_ ids in `sessions`); ' +
        'when one is blocked (waiting, with `waitingOn`: who or what, in a few words); when its PR opens (pr, prUrl) and when it merges (shipped); and once with finished: true at the end. ' +
        'Jobs upsert by `id`: send only the fields that changed. The mod stamps `updated` and derives the counts and summary line.',
      inputSchema: {
        type: 'object',
        properties: {
          build: { type: 'string', description: 'The build name, a few words; the same name every call (it keys the file).' },
          summary: { type: 'string', description: 'Optional one or two sentences on where the build stands, in plain words.' },
          memo: { type: 'string', description: 'Path or https link to the build memo / SOP.' },
          jobs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Stable short id, such as "job-5" or "schedule-view".' },
                label: { type: 'string', description: 'Shown above the title, such as "Job 5". Defaults to the job number.' },
                title: { type: 'string', description: 'What the job delivers, a few words. Required for a new job.' },
                detail: { type: 'string', description: 'One or two sentences: scope, or what is happening now.' },
                status: { type: 'string', enum: ['running', 'waiting', 'planned', 'later', 'shipped'] },
                waitingOn: { type: 'string', description: 'With status waiting: who or what it waits on.' },
                pr: { type: 'string', description: 'PR number.' },
                prUrl: { type: 'string', description: 'PR link.' },
                sessions: { type: 'array', items: { type: 'string' }, description: 'Side session short names or local_… ids, or subagent Agent descriptions, working on it.' },
                updated: { type: 'string', description: 'Only to backdate when seeding an existing build: an ISO date. Otherwise the mod stamps it.' },
              },
              required: ['id'],
            },
          },
          remove: { type: 'array', items: { type: 'string' }, description: 'Job ids to drop from the list.' },
          next: {
            type: 'array',
            items: { type: 'string' },
            description: 'Job ids in the order they run next (the header shows the first three as "Next"). Send it whenever the plan changes; without it the header guesses.',
          },
          finished: { type: 'boolean', description: 'True once every job has shipped or been dropped.' },
        },
        required: ['build'],
      },
    })

    startTimers($)
    return started
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
    }
    await update($, flow, p => merge(p, input))
    void refreshSessions($)
    return { result: `ok: ${label(next ?? blank(), await allRuns($))}` }
  })

  on('tool.call', { tool: JOBS_TOOL }, async ($, e) => {
    const input = e as unknown as JobsInput
    const cur = await read($, build)
    const id = input.build?.trim() ? slug(input.build) : cur?.id
    if (!id) return { result: 'error: name the build in `build`' }
    const at = await $.clock.now()
    const prev = (await loadBuild($, id)) ?? (cur?.id === id ? cur : null)
    // Only a name and no build by it: a lookup that missed. List what exists rather than start an empty build.
    const isLookup = !input.jobs?.length && !input.remove?.length && !input.next && input.summary === undefined && input.memo === undefined && input.finished === undefined
    if (!prev && isLookup) {
      let names: string[] = []
      try {
        names = (await $.fs.list(await buildsDir($))).filter(x => x.name.endsWith('.json')).map(x => x.name.replace(/\.json$/, ''))
      } catch {
        // No builds yet.
      }
      return { result: `no build "${id}". Existing builds: ${names.join(', ') || 'none'}. To start one, send its jobs.` }
    }
    const merged = mergeBuild(prev, input, at, await $.session.root())
    // A side session named by its short name also gets its local_… id, so the link survives a restart.
    const side = await read($, sessions)
    const linked: Build = {
      ...merged,
      // Marc: the sessions that report the build are its orchestrators; their agents count as its own.
      orchestrators: [...new Set([...(prev?.orchestrators ?? []), await $.session.id()])],
      jobs: merged.jobs.map(j => ({
        ...j,
        sessions: [...new Set(j.sessions.flatMap(x => [x, ...side.filter(ss => ss.name && ss.name === x).map(ss => ss.id)]))],
      })),
    }
    const isNewLead = !(prev?.orchestrators ?? []).includes(await $.session.id())
    const hasChange = isNewLead || Boolean(input.jobs?.length || input.remove?.length || input.next || input.summary !== undefined || input.memo !== undefined || input.finished !== undefined || !prev)
    if (hasChange) await saveBuild($, linked)
    await setDismissed($, null).catch(() => undefined)
    await update($, build, () => (hasChange ? linked : prev ?? linked))
    void refreshSessions($)
    return { result: buildReport(hasChange ? linked : prev ?? linked) }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: 'ok' }
  })

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = String(e.subagent_type ?? '')
    if (!type.startsWith('savvy-')) return next(e)

    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? { ...blank(), ...prev } : blank()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  // Drawing is pure (the app refuses state writes made while the band draws), and /resume or
  // a restart can skip session.start. So the restore, the saved rows and the clocks are also kicked
  // off by every tool call and every prompt: an orchestrator at work calls tools constantly.
  on('tool.call', async ($, e, next) => {
    kick($)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    kick($)
    return next(e)
  })

  // Marc: background shell tasks (a test gate, a deploy) are work too, so they get a row. The row
  // starts when Bash reports the command went to the background, and ends once no process runs
  // that command any more (checked every 15s and on each tool call; see shellsDone).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const answer = await next(e)
    const taskId = (answer as { result?: { backgroundTaskId?: unknown } }).result?.backgroundTaskId
    if (typeof taskId !== 'string' || !taskId) return answer
    const input = e as unknown as { command?: string; description?: string }
    const at = await $.clock.now()
    const command = String(input.command ?? '').replace(/\s+/g, ' ').trim()
    const run: AgentRun = {
      id: taskId,
      agentId: taskId,
      type: 'shell',
      description: input.description?.trim() || command.slice(0, 60) || 'Background command',
      model: 'shell',
      status: 'running',
      startedAt: at,
      contextTokens: 0,
      contextMax: 0,
      tokens: 0,
      costUsd: 0,
      steps: 0,
      round: 1,
      stepNote: command.length > 48 ? `${command.slice(0, 47)}…` : command,
      command: String(input.command ?? '').trim(),
    }
    await update($, agents, list => [...list.filter(a => a.id !== taskId), run].slice(-200))
    return answer
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await update($, agents, list =>
      list.map(a =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running' as const,
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              cachedTokens: (a.cachedTokens ?? 0) + (usage.cache_read_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map(a => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? ('done' as const) : ('failed' as const),
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  cachedTokens: e.usage.cache_read_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage),
                }
              : {}),
          }
        }),
      )
    }
    return next(e)
  })

  // The band: a build's jobs when one is open, else the flow's tasks. Native elements only,
  // so the desktop lays the row out at whatever width the band really has (it reports the
  // window's width, not the band's, so a drawing sized from it overflowed or left gaps).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    const b = await read($, build)
    if ((f === null && (b === null || b.isFinished)) || e.props.hasSurvey) return next(e)

    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await allRuns($)
    const live = liveCount(list)
    const crew = list.length + plannedOf(f, list).length

    // A build in progress outranks the flow: the band shows the macro view.
    const bar =
      b && !b.isFinished
        ? (() => {
            const c = countJobs(b)
            return {
              title: b.name,
              value: c.shipped,
              max: Math.max(1, c.total),
              text: `${s.jobsWord} ${c.shipped}/${c.total}${live ? ` · ${live} ${s.busy}` : ''}`,
              color: ACCENT,
              ratio: c.total ? c.shipped / c.total : 0,
            }
          })()
        : f
          ? { title: f.title, value: ratio(f, list), max: 1, text: label(f, list), color: f.isFinished ? DONE : ACCENT, ratio: ratio(f, list) }
          : null
    if (!bar) return next(e)
    const percent = `${Math.round(bar.ratio * 100)}%`

    // Marc: the magnifier opens the savvy board window.
    const crewButton = <Button key="savvy-agents" label={`🔍 ×${crew}`} plain onPress={() => void openBoard($)} />
    // Marc: ↻ re-reads everything, then brings up the board window and has it re-read too.
    const bandRefresh = (
      <Button
        key="savvy-refresh"
        label="↻"
        plain
        onPress={async () => {
          await refreshNow($)
          await openBoard($, true)
        }}
      />
    )
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={async () => {
          const cur = await read($, build)
          await update($, flow, () => null)
          await update($, build, () => null)
          if (cur) await setDismissed($, cur.id)
        }}
      />
    )

    if ('Svg' in ui) {
      const { Svg } = ui
      // Marc: one glass bar. The coach and the crew count sit together at the left, the
      // progress bar takes whatever room is left so the gaps stay even, and the dot and the
      // title share one line with the bar so they centre on it.
      // Which parts show is measured, not guessed: the full bar when it fits, then without the
      // figures, then without the coach; the title truncates and the bar keeps at least 60px.
      const room = (e.props.bodyColumns || 200) * BAND_CELL_PX - 20
      const gap = 16
      const crewW = textWidth(`🔍 ×${crew}`, 14) + 8 + textWidth("↻", 14) + 16
      const titleW = textWidth(`● ${bar.title}`, 14) + 4
      const figureW = textWidth(`${bar.text} · ${percent}`, 14) + 4
      const need = (parts: number[]) => parts.reduce((sum, w) => sum + w, 0) + gap * (parts.length - 1)
      // Marc: no coach beside the magnifier; the crew count stands alone.
      const hasFigure = need([crewW, titleW, 60, figureW, 20]) <= room
      const pct = Math.round(bar.ratio * 100)
      return (
        <Box key="savvy-glass" position="relative" overflow="hidden" flexDirection="row" alignItems="center" columnGap={2} paddingX={1} borderStyle="round" borderColor={GLASS_EDGE} backgroundColor={GLASS_FILL}>
          <Box key="sheen" position="absolute" top={0} left={0} width={WIDE_CELLS}>
            <Svg source={GLASS_SHEEN} alt="" width={2400} height={40} />
          </Box>
          <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
            {crewButton}
            {bandRefresh}
          </Box>
          <Box flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">
              <Text color={bar.color}>● </Text>
              <Text bold>{bar.title}</Text>
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} width={0} minWidth={6} alignItems="center">
            {/* Marc: the fill is a slow purple laser. Its drawing is pinned by its right end, so the
                bright head always sits at the fill's tip whatever the band's width; the sparks past
                the tip live in the empty track beside it. Both sources are constant, so a redraw
                never restarts the motion. */}
            {/* Marc (seen in captures of the app): no drawing ever painted inside the band's bar, so the
                fill is the app's own boxes: LASER_STEPS slices stepping from deep purple on the left to
                light at the tip, always drawn. A finished build is one solid colour. */}
            <Box key="laser-track" width="100%" height={1} flexDirection="row" backgroundColor="#80808026">
              <Box key="laser-fill" width={`${pct}%`} minWidth={0} height={1} flexDirection="row" overflow="hidden" backgroundColor={bar.color}>
                {bar.color === ACCENT ? LASER_STEPS.map((c, i) => <Box key={`ls-${i}`} flexGrow={1} flexShrink={1} minWidth={0} height={1} backgroundColor={c} />) : ''}
              </Box>
            </Box>
          </Box>
          {hasFigure ? (
            <Box flexShrink={1} minWidth={0}>
              <Text dimColor wrap="truncate-end">
                {bar.text} · {percent}
              </Text>
            </Box>
          ) : (
            ''
          )}
          {dismiss}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, bar.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    return (
      <Box flexDirection="row" gap={2}>
        <Box width={titleW} flexShrink={0}>
          <Text color={bar.color}>● </Text>
          <Text wrap="truncate-end">{bar.title}</Text>
        </Box>
        <Text color={bar.color}>{barText(bar.ratio, width)}</Text>
        <Text bold>{bar.text}</Text>
        <Text dimColor>{percent}</Text>
        {crewButton}
        {bandRefresh}
        {dismiss}
      </Box>
    )
  })
}
