import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Build, Flow, Job, Panel, Phase, PlannedTask, SideSession } from '../types'
import {
  FONT,
  GROUPS,
  JOB_THEME,
  buildHeaderSvg,
  buildReport,
  countJobs,
  fitText,
  fmtDay,
  jobCardSvg,
  labelOf,
  mergeBuild,
  nowNext,
  prLineSvg,
  runsOf,
  slug,
  summaryLine,
  textWidth,
  xml,
} from './jobs'
import type { JobsInput, RunLine } from './jobs'
import { GLASS, GLASS_CSS, glassBar, glassDefs, glassPanel, glowOnly } from './glass'

const flow = atom({ plugin: 'savvy-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
const sessions = atom({ plugin: 'savvy-progress', key: 'sessions' } as const, [])
const panel = atom({ plugin: 'savvy-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'savvy-progress', key: 'now' } as const, 0)
// Marc: the build this session shows; its truth is the JSON file, re-read on a timer.
const build = atom({ plugin: 'savvy-progress', key: 'build' } as const, null)
// Marc: every other session's agent rows, so the pane follows the whole build from any session.
const fleet = atom({ plugin: 'savvy-progress', key: 'fleet' } as const, [])

const TOOL = 'mcp__savvy-progress__progress'
const STEP_TOOL = 'mcp__savvy-progress__step'
const JOBS_TOOL = 'mcp__savvy-progress__jobs'
const PANE = 'savvy-agents'
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
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'New tokens',
    cached: 'cached',
    fresh: 'new',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    open: 'Open chat ↗',
    view: 'View transcript',
    states: { blocked: 'needs you', review_ready: 'ready for review', completed: 'done' } as Record<string, string>,
    groups: { running: 'Running', waiting: 'Waiting on something', planned: 'Planned', later: 'Later', shipped: 'Shipped' } as Record<string, string>,
    tiles: ['Shipped', 'Running', 'Waiting', 'To do'] as [string, string, string, string],
    updated: 'Updated',
    waitingOn: 'Waiting on:',
    more: 'more',
    memo: 'Build memo ↗',
    jobsWord: 'Jobs',
    doneWord: 'done',
    noJobs: 'No jobs yet.',
    nowWord: 'Now',
    nextWord: 'Next',
    refresh: 'Refresh',
    otherChat: 'other chat',
    showAll: 'All chats',
    allShort: 'All',
    buildOnly: 'Build',
    otherChats: 'Other chats',
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Новые токены',
    cached: 'из кэша',
    fresh: 'новых',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    open: 'Открыть чат ↗',
    view: 'Транскрипт',
    states: { blocked: 'ждёт тебя', review_ready: 'на проверку', completed: 'готово' } as Record<string, string>,
    groups: { running: 'В работе', waiting: 'Чего-то ждут', planned: 'Запланированы', later: 'Позже', shipped: 'Выпущены' } as Record<string, string>,
    tiles: ['Выпущено', 'В работе', 'Ждут', 'Впереди'] as [string, string, string, string],
    updated: 'Обновлено',
    waitingOn: 'Ждёт:',
    more: 'ещё',
    memo: 'Мемо сборки ↗',
    jobsWord: 'Задачи',
    doneWord: 'готово',
    noJobs: 'Задач пока нет.',
    nowWord: 'Сейчас',
    nextWord: 'Дальше',
    refresh: 'Обновить',
    otherChat: 'другой чат',
    showAll: 'Все чаты',
    allShort: 'Все',
    buildOnly: 'Только сборка',
    otherChats: 'Другие чаты',
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

const JOB_COLORS = JOB_THEME.status
// Pane width, CSS px, from which jobs and agents sit side by side; the gap between them.
// Marc: the narrowest a column may be with its text still easy to read.
const MIN_COL = 320
// bodyColumns counts the pane's code-font cells, measured at about 9.3px. Drawings are made at a
// slightly larger cell and given no size, so the app fits each one to its column: they always fill
// it (shrunk a few percent at most), never leave a gap at the right or run past the edge.
// Marc (2026-11-23, seen in a capture of the app): at 9.6 a wide pane drew narrower than its
// column, leaving more room on the right than the left. Made wider, a drawing is always shrunk to fit.
const PANE_CELL_PX = 10.4
// What one of bodyColumns' cells really measures in the pane, so a drawing shown at its own size
// (not shrunk to the column) can match the shrunk ones.
const PANE_CELL_REAL = 9.3
// Marc: every pane drawing is a plain image. A hoverable (isInteractive) frame keeps its drawn
// height while the app shrinks the picture to the column, which left uneven gaps above and below.

// Marc: native glass for the band, neutral so it reads on light and dark. Translucent fill and
// edge and a soft light across the top; no hover effect. The skins band wears the same.
const GLASS_EDGE = '#9a9a9a59'
const GLASS_FILL = '#8080800d'
// The light across the top, as on the Agents panels: a wide drawing pinned under the band's
// parts and clipped by its corners. The skins band draws the same one.
const GLASS_SHEEN = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="40" viewBox="0 0 2400 40"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/></linearGradient></defs><rect width="2400" height="40" fill="url(#s)"/><rect width="2400" height="1" fill="url(#r)"/></svg>`
// The band's bodyColumns counts cells of the app's code font, about 8px; taken a little smaller to stay safe.
const BAND_CELL_PX = 7.4
const COL_GAP_PX = 16
// Marc: the glimmer on a hovered job card: a soft band of light sweeping left to right every 2.6s,
// drawn wide and tall and clipped by the card's box, so it needs no measure of the card.
// Marc (seen in a capture of the app): an absolute Box sizes itself to its parent, and the app caps
// a drawing at its box's width, so a wide drawing (the band's beam, a sheen) was squeezed to a
// sliver and never showed. Such a box gets a width of its own, in cells, wider than any drawing.
const WIDE_CELLS = 320
const SPACER = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="10" viewBox="0 0 1 10"></svg>'
const GLIMMER_W = 1400
const GLIMMER_H = 400
const GLIMMER = `<svg xmlns="http://www.w3.org/2000/svg" width="${GLIMMER_W}" height="${GLIMMER_H}" viewBox="0 0 ${GLIMMER_W} ${GLIMMER_H}"><style>.gm{animation:gm 2.6s cubic-bezier(.4,0,.2,1) infinite}@keyframes gm{0%{transform:translateX(-160px)}45%,100%{transform:translateX(1100px)}}@media (prefers-reduced-motion:reduce){.gm{animation:none;opacity:0}}</style><defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g class="gm"><rect x="0" y="-100" width="90" height="${GLIMMER_H + 200}" fill="url(#gl)" transform="skewX(-20)"/></g></svg>`

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

// The build a session should show when it has none: the newest unfinished one started from this
// project; else one started in a folder above or below it; else (Marc: any session's build shows
// after a restart) the newest unfinished build touched in the last three days, wherever it began.
const RECENT_MS = 3 * 24 * 3600_000
async function latestBuildFor($: EngineInterface, project: string): Promise<Build | null> {
  try {
    const dir = await buildsDir($)
    const names = (await $.fs.list(dir)).filter(x => x.kind === 'file' && x.name.endsWith('.json'))
    const all = (await Promise.all(names.map(x => loadBuild($, x.name.replace(/\.json$/, '')))))
      .filter((b): b is Build => b !== null && !b.isFinished && b.jobs.length > 0)
      .sort((a, z) => z.updatedAt - a.updatedAt)
    const within = (a: string, b: string) => a === b || a.startsWith(`${b.replace(/\/$/, '')}/`)
    const at = await $.clock.now()
    return (
      all.find(b => b.project === project) ??
      all.find(b => within(project, b.project) || within(b.project, project)) ??
      all.find(b => at - b.updatedAt < RECENT_MS) ??
      null
    )
  } catch {
    return null
  }
}

// Restores a build into a session that shows none, and otherwise picks up other sessions' changes
// to it, at most every 15s. Called at start, on every draw of the pane or band and on the timer:
// /resume, /clear and a restart reset $.state and skip session.start (and with it the timer), so
// the draws are what bring a resumed session's build back.
let lastLookup = 0
async function ensureBuild($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  if (at - lastLookup < 15_000 && lastLookup !== 0) return
  lastLookup = at
  if (await read($, build)) return refreshBuild($)
  const found = await latestBuildFor($, await $.session.root())
  if (found && !(await read($, build))) await update($, build, () => found)
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
// restart can skip that, by the first draw of the pane or band; once per process either way.
let timersStarted = false
let timers: { cancel: () => void }[] = []
// `isRestart` (the Refresh button): drops the running clocks and starts fresh ones.
function startTimers($: EngineInterface, isRestart = false): void {
  if (timersStarted && !isRestart) return
  for (const t of timers) t.cancel()
  timersStarted = true
  timers = []
  timers.push($.clock.every(1000, () => {
    void (async () => {
      const list = await read($, agents)
      if (!list.some(a => a.status === 'running')) return
      const at = await $.clock.now()
      await update($, now, () => at)
    })()
  }))
  timers.push($.clock.every(15_000, () => {
    void (async () => {
      await ensureBuild($)
      await syncAgents($, true)
      await shellsDone($)
      if ((await $.ui.panes()).some(p => p.id === PANE) || (await read($, build))) {
        await refreshSessions($)
      }
    })()
  }))
}

// Marc: the Refresh button. Everything the pane shows is re-read now (the build file, this
// session's saved rows, the chats, other sessions' rows) and the clocks start over, for when a
// clock died with its process or the app slept.
// Marc: after /reload-plugins the app kept the old copy's pane (its buttons dead) or showed "has
// not drawn in this pane": opening a pane the app already shows asked for no new drawing. Closing
// it first makes this copy draw it fresh. Used at start and by the band's ↻ button.
async function reopenPane($: EngineInterface): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE }).catch(() => undefined)
  await $.ui.open({ id: PANE, title: tr().pane })
  await rememberPane($, true)
}

async function refreshNow($: EngineInterface): Promise<void> {
  lastLookup = 0
  startTimers($, true)
  await ensureBuild($)
  await syncAgents($, true)
  await shellsDone($)
  await refreshSessions($)
  const at = await $.clock.now()
  await update($, now, () => at)
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

// What a job card says about each agent working on it.
const runLines = (runs: readonly AgentRun[], at: number): RunLine[] =>
  runs.map(r => {
    const s = tr()
    const state = r.note || (r.status === 'running' ? s.isRunning : r.status === 'done' ? s.isFinished : r.status === 'failed' ? s.failed : s.states.blocked)
    return { name: r.name || r.description || r.type, status: r.status, state: state ?? '', stats: `≈${fmtCost(r.costUsd)} · ${fmtTime(elapsed(r, at))}` }
  })

// The coach beside a build's name, running the team.
const coachBadge = (isWorking: boolean) => ({ svg: crab(0, -1, 'coach', false, isWorking, 1), css: CRAB_CSS, w: 36 })


// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

// What each savvy tier runs on, for planned tasks that have no run yet.
// Marc: kits beyond the savvy tiers, each with its own accent.
const COSTUME_COLOR: Record<string, string> = {
  coach: '#CE102C',
  explore: '#8A8580',
  session: '#CE102C',
  review: '#8E929A',
  plan: '#2F9E9E',
  player: '#4A6FA5',
}

const colorOf = (tier: string): string => TIER_COLOR[tier] ?? COSTUME_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, string> = {
  fable: 'Fable · high',
  heavy: 'Opus · xhigh',
  careful: 'Opus · high',
  medium: 'Opus · medium',
  light: 'Opus · low',
}

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// The engine reports tokens, not money, so the panel's cost is an estimate.
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

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin.
const tierOf = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return t in TIER_COLOR && bare.startsWith('savvy-') ? t : 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// A side session's own time is its active time: the gaps it sat waiting don't count.
const elapsed = (a: AgentRun, at: number): number => a.activeMs ?? (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

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
    // "Show all chats" widens the listing from the last 20 minutes to the newest 40 of the week.
    const scope = (await read($, panel)).isShowingAll ? '--all' : '--live'
    const { exitCode, stdout } = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/sessions.py`, id, scope, ...extra], { timeoutMs: 20_000 })
    if (exitCode !== 0) return
    const list = JSON.parse(stdout) as SideSession[]
    const at = await $.clock.now()
    await update($, sessions, () => list)
    await update($, now, () => at)
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
let mine: string[] | null = null
async function refreshFleet($: EngineInterface): Promise<void> {
  try {
    const id = await $.session.id()
    mine ??= [id, ...(await priorIds($, id))]
    const dir = `${(await $.env.get('HOME')) || '~'}/.claude/savvy-progress/agents`
    const at = await $.clock.now()
    const files = (await $.fs.list(dir)).filter(x => x.kind === 'file' && x.name.endsWith('.json') && !mine?.includes(x.name.replace(/\.json$/, '')))
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

// Where a press on a row goes: a side session opens in the app, a subagent's transcript in the view.
// Marc: a chat opens in split view beside this one; the app allows that only for sessions this
// one started, so anything else (or an older app) falls back to opening it on its own.
const openRun = async ($: EngineInterface, a: AgentRun): Promise<void> => {
  if (a.link) {
    try {
      const r = await $.mcp.call('ccd_window', 'open_session_in', { session_id: a.id, target: 'split' })
      const text = r.content.map(c => ('text' in c && typeof c.text === 'string' ? c.text : '')).join(' ')
      if (!r.isError && /^\s*Opened/.test(text)) return
    } catch {
      // No window tools in this session: open it the plain way.
    }
    await $.process.run(['open', a.link])
  }
  else if (a.agentId && !a.fromSession) await $.ui.view({ agentId: a.agentId })
}

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

const totals = (all: AgentRun[], at: number) => {
  const list = all.filter(a => !a.isShadow && !a.isOutside)
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  // Cache reads re-count the same context on every request: shown apart, not as new work.
  const cached = list.reduce((s, a) => s + (a.cachedTokens ?? 0), 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, cached, fresh: tokens - cached, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

const PANE_CSS = `<style>
/* Marc: text never light on light or dark on dark. Each text carries a thin halo in the opposite tone, drawn under its fill, so it reads on any background; on a matching one the halo blends in. */
.t{fill:#1f1f1f}.s{fill:#5f5f5c}.m{fill:#80807c}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
text{paint-order:stroke;stroke:#ffffff;stroke-opacity:.8;stroke-width:2.4px;stroke-linejoin:round}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#8d8d89}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}
text{stroke:#141413}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
.zz{transform-box:fill-box;opacity:0;animation:zz 3.2s ease-in-out infinite}.zz2{animation-delay:-1.6s}
@keyframes zz{0%{transform:translate(0,3px);opacity:0}25%{opacity:.85}100%{transform:translate(3px,-7px);opacity:0}}
@media (prefers-reduced-motion: reduce){.live{animation:none}.zz{animation:none;opacity:.7}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
/* Marc: every player dribbles while working; the fable star floats, the light runs at double pace,
   the coach paces side to side and his whistle glints. */
.run .ball{animation:dribble .5s ease-in infinite}
@keyframes dribble{50%{transform:translateY(5px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
@keyframes float{50%{transform:translateY(-2px)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}.c-light.run .ball{animation-duration:.25s}
.c-coach.run{animation:pace 2s ease-in-out infinite}@keyframes pace{0%,100%{transform:translateX(-2px)}50%{transform:translateX(2px)}}
.c-coach.run .gl{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const BALL_ORANGE = '#E8833A'
const BALL_SEAM = '#8A3B12'
const BRODIE_RED = '#CE102C'

// Marc: the Coldest Winter lineup, the 18 city jerseys (dark colourways) on brodierec.com,
// sampled from the site's own pictures. Rows of the 30x28 crab: straps and the trimmed V neck
// (13-15), the wordmark (16), a "4" like every jersey on the site (17-19), the hem stripes
// (20-21), shorts over the legs (22). The site shows no shorts, so each pair takes the jersey's colour and a side stripe.
type Jersey = { base: string; trim: string; word: string; num: string; bands: [string, string]; shorts: string; side: string; diag?: string }

const LINEUP: Jersey[] = [
  { base: '#5D85C5', trim: '#822D3C', word: '#E8DFC8', num: '#E8DFC8', bands: ['#EADFDE', '#141F3E'], shorts: '#5D85C5', side: '#141F3E' }, // ATL light blue
  { base: '#BC2836', trim: '#1A1A1A', word: '#FFFFFF', num: '#FFFFFF', bands: ['#F1F3F2', '#1A1A1A'], shorts: '#BC2836', side: '#1A1A1A' }, // BKN red
  { base: '#5789BD', trim: '#1A1A1A', word: '#EAE8E9', num: '#EAE8E9', bands: ['#EAEEF6', '#4E7A9D'], shorts: '#5789BD', side: '#EAEEF6' }, // BUF light blue
  { base: '#BC2836', trim: '#1A213C', word: '#EFF3F4', num: '#EFF3F4', bands: ['#1A213C', '#EDDEDA'], shorts: '#BC2836', side: '#1A213C' }, // CLE red
  { base: '#C01D32', trim: '#FFFFFF', word: '#FFFFFF', num: '#FFFFFF', bands: ['#FFEAED', '#FFEAED'], shorts: '#C01D32', side: '#FFFFFF' }, // DET red
  { base: '#0D307D', trim: '#E1B837', word: '#E1B837', num: '#E1B837', bands: ['#0D307D', '#11265A'], shorts: '#0D307D', side: '#E1B837', diag: '#E1B837' }, // IND blue
  { base: '#BC2836', trim: '#142136', word: '#FFFFFF', num: '#FFFFFF', bands: ['#DEAE5D', '#142136'], shorts: '#BC2836', side: '#DEAE5D' }, // MIA red
  { base: '#E8E6E7', trim: '#0E655F', word: '#0E655F', num: '#0E655F', bands: ['#0E655F', '#0E655F'], shorts: '#0E655F', side: '#0E0E0E', diag: '#0E0E0E' }, // MIL white
  { base: '#1A4635', trim: '#A41F33', word: '#E8E2D0', num: '#E8E2D0', bands: ['#A41F33', '#C7B692'], shorts: '#1A4635', side: '#A41F33' }, // MIN green
  { base: '#0A3395', trim: '#BF1C31', word: '#BF1C31', num: '#BF1C31', bands: ['#F2FAFF', '#BF1C31'], shorts: '#0A3395', side: '#F2FAFF' }, // NYL blue
  { base: '#141F2B', trim: '#C22234', word: '#FFFFFF', num: '#FFFFFF', bands: ['#C22234', '#90C2C1'], shorts: '#141F2B', side: '#90C2C1' }, // OKC navy
  { base: '#0B0D0F', trim: '#3D6BD9', word: '#FFFFFF', num: '#3D6BD9', bands: ['#F7F7F7', '#093A94'], shorts: '#0B0D0F', side: '#093A94' }, // ORL black
  { base: '#C65138', trim: '#FFFFFF', word: '#FFFFFF', num: '#FFFFFF', bands: ['#C65138', '#0C0B04'], shorts: '#C65138', side: '#0C0B04' }, // PHI orange
  { base: '#1B626E', trim: '#0E0E0E', word: '#FFFFFF', num: '#FFFFFF', bands: ['#F0F0F0', '#9BA0A0'], shorts: '#1B626E', side: '#F0F0F0' }, // SAC teal
  { base: '#E76F33', trim: '#1C235E', word: '#1C235E', num: '#1C235E', bands: ['#FBE9DA', '#1C235E'], shorts: '#E76F33', side: '#1C235E' }, // SAN orange
  { base: '#67A9D2', trim: '#0B0D0F', word: '#0B0D0F', num: '#0B0D0F', bands: ['#0B0D0F', '#D3D3D3'], shorts: '#67A9D2', side: '#0B0D0F' }, // UTA light blue
  { base: '#0B0D0F', trim: '#AA9463', word: '#C9AE73', num: '#E8E2D0', bands: ['#AC273B', '#AA9463'], shorts: '#0B0D0F', side: '#AA9463' }, // VEG black
  { base: '#0B0D0F', trim: '#C9B79F', word: '#C9B79F', num: '#C9B79F', bands: ['#2D6087', '#9C7C69'], shorts: '#0B0D0F', side: '#BDD5E9' }, // WAS black
]

const FOUR = ['x.x', 'xxx', '..x']

// A player in one of the lineup's jerseys, with a ball under the right claw.
const player = (f: Fill, k: Jersey, extra?: (f: Fill) => void): void => {
  crabBody(f)
  stamp(f, 7, 13, ['tjjj........jjjt', 'jjjjjt....tjjjjj', 'jjjjjjttttjjjjjj', 'jjjjjwwwwwwjjjjj', 'jjjjjjjjjjjjjjjj', 'jjjjjjjjjjjjjjjj', 'jjjjjjjjjjjjjjjj', 'aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'], { j: k.base, t: k.trim, w: k.word, a: k.bands[0], b: k.bands[1] })
  if (k.diag) for (let i = 0; i < 5; i++) f(12 + i * 2, 21 - i, 2, 1, k.diag)
  stamp(f, 13, 17, FOUR, { x: k.num })
  // Shorts over the tops of the legs, the side stripe on the outer edge.
  f(7, 22, 6, 1, k.shorts); f(17, 22, 6, 1, k.shorts); f(7, 22, 1, 1, k.side); f(22, 22, 1, 1, k.side)
  f(24, 18, 3, 3, BALL_ORANGE, 'ball'); f(25, 18, 1, 3, BALL_SEAM, 'ball'); f(24, 19, 3, 1, BALL_SEAM, 'ball')
  extra?.(f)
}

const headband = (c: string) => (f: Fill) => f(7, 10, 16, 1, c)

// Each role keeps a look of its own on top of whatever jersey it draws.
const ROLE_LOOKS: Record<string, ((f: Fill) => void) | undefined> = {
  fable: headband('#F5C542'),
  heavy: f => { f(8, 11, 13, 1, '#1F1E1D'); f(8, 12, 4, 2, 'rgba(169,214,245,.55)'); f(18, 12, 4, 2, 'rgba(169,214,245,.55)') },
  careful: f => f(3, 14, 4, 4, '#F4F3EE'),
  medium: headband('#FFFFFF'),
  light: f => { f(3, 17, 4, 1, '#FFFFFF'); f(23, 17, 4, 1, '#FFFFFF') },
  explore: f => { f(7, 9, 16, 2, BRODIE_RED); f(22, 11, 2, 2, BRODIE_RED) },
  session: headband(BRODIE_RED),
  review: f => { f(3, 13, 5, 2, '#FFFFFF'); f(7, 14, 2, 3, '#FFFFFF') },
  plan: f => { f(7, 24, 2, 2, '#FFFFFF', 'la'); f(17, 24, 2, 2, '#FFFFFF', 'la'); f(11, 24, 2, 2, '#FFFFFF', 'lb'); f(21, 24, 2, 2, '#FFFFFF', 'lb') },
  player: undefined,
  other: undefined,
}

// Which jersey an agent wears: picked from its id, so it keeps the same one all session.
const jerseyOf = (key: string): number => {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % LINEUP.length
}

// A costume is "<role>" or "<role>#<jersey>"; the coach has no jersey.
const COSTUMES: Record<string, (f: Fill, t: string) => void> = {}
const drawCostume = (costume: string, f: Fill): void => {
  const [role = 'player', n] = costume.split('#')
  const own = COSTUMES[role]
  if (own) return own(f, '')
  const kit = LINEUP[Number(n ?? jerseyOf(role)) % LINEUP.length] ?? LINEUP[0]
  if (kit) player(f, kit, ROLE_LOOKS[role])
}

// The orchestrator: the coach. Black hair, a plain white collared shirt with grey buttons, a black whistle on a fine grey necklace, blue trousers. He paces while the team works.
COSTUMES.coach = f => {
  crabBody(f)
  const BLUE = '#2F5BA8'
  // Hair: a black crop on top of his head.
  f(7, 9, 16, 2, '#1F1E1D'); f(8, 8, 5, 1, '#1F1E1D'); f(14, 8, 6, 1, '#1F1E1D'); f(21, 10, 2, 1, '#1F1E1D')
  stamp(f, 7, 14, ['eWWWWcc..ccWWWWe', 'eWWWWWc..cWWWWWe', 'eWWWWWWbWWWWWWWe', 'eWWWWWWWWWWWWWWe', 'eWWWWWWbWWWWWWWe', 'eWWWWWWWWWWWWWWe', 'eWWWWWWbWWWWWWWe', 'pppppppppppppppp'], { W: '#F8F8F6', c: '#D6D6D2', b: '#9AA0A8', e: '#C9CCD2', p: BLUE })
  // Blue trouser legs over his legs, moving with them.
  f(7, 22, 2, 3, BLUE, 'la'); f(17, 22, 2, 3, BLUE, 'la'); f(11, 22, 2, 3, BLUE, 'lb'); f(21, 22, 2, 3, BLUE, 'lb')
  // The fine grey necklace from the collar down to the black whistle on his chest.
  f(12, 15, 1, 1, '#9AA0A8'); f(12, 16, 1, 1, '#9AA0A8'); f(16, 15, 1, 1, '#9AA0A8'); f(16, 16, 1, 1, '#9AA0A8'); f(13, 17, 1, 1, '#9AA0A8'); f(15, 17, 1, 1, '#9AA0A8')
  f(13, 18, 3, 1, '#1F1E1D'); f(12, 18, 1, 1, '#1F1E1D'); f(15, 19, 1, 1, '#1F1E1D')
  f(14, 18, 1, 1, '#6A6A70', 'gl')
}

// Who plays what: the savvy tiers by tier; other agents by their role.
const costumeOf = (type: string): string => {
  if (type === 'Explore') return 'explore'
  const tier = tierOf(type)
  if (tier !== 'other') return tier
  if (type === 'session') return 'session'
  if (/review|critic|audit|judge|evaluat|sanitiz/i.test(type)) return 'review'
  if (/plan|architect/i.test(type)) return 'plan'
  return 'player'
}

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own.
// Marc: `isAsleep`, a finished worker: eyes shut (a line where each eye was).
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, isAsleep = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  drawCostume(costume, f)
  if (isAsleep) {
    f(9, 12, 2, 2, CLAY); f(19, 12, 2, 2, CLAY)
    f(9, 13, 2, 1, INK); f(19, 13, 2, 1, INK)
  }
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" opacity="${dim ? 0.45 : isAsleep ? 0.72 : 1}" shape-rendering="crispEdges"><g class="c-${costume.split('#')[0]}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${GLASS_CSS}${glassDefs()}${CRAB_CSS}${body}</svg>`

const GI = GLASS.inset
const TILE_TINTS = ['#8f8cf4', '#378ADD', '#1D9E75']

// The pane's own title already says "Agents": the header names the flow, with its coach beside it.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>, isWorking = false): string => {
  const s = tr()
  const gap = 8
  const tw = (W - GI * 2 - gap * 2) / 3
  const top = title ? 36 : 0
  const y = top + GI
  const tile = (i: number, k: string, v: string) => {
    const x = GI + i * (tw + gap)
    // Marc: bigger figures with room around them; the cached count follows the value only where it fits.
    const extra = i === 1 && t.cached ? `+${fmtTokens(t.cached)} ${s.cached}` : ''
    const vx = x + 13 + textWidth(v, 19) + 7
    const hasExtra = extra && vx + textWidth(extra, 11.5) <= x + tw - 12
    return `${glassPanel(x, y, tw, TILE_H, { r: GLASS.tileRadius, tint: TILE_TINTS[i] })}
<text class="s" x="${x + 13}" y="${y + 20}" font-family="${FONT}" font-size="12.5">${xml(fitText(k, 12.5, tw - 26))}</text>
<text class="t" x="${x + 13}" y="${y + 44}" font-family="${FONT}" font-size="19" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>${hasExtra ? `<text class="m" x="${vx}" y="${y + 44}" font-family="${FONT}" font-size="11.5" font-variant-numeric="tabular-nums">${extra}</text>` : ''}`
  }
  return svg(
    W,
    headerHeight(title),
    `${title ? `${crab(0, 0, 'coach', false, isWorking, 1)}<text class="t" x="36" y="21" font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W - 36))}</text>` : ''}
${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.fresh))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const TILE_H = 56
const headerHeight = (title: string): number => (title ? 36 : 0) + TILE_H + GI * 2

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const AGENT_H = 88
const PLANNED_H = 54
const COMPACT_H = 42

// One agent on its own pane of glass, its costume's colour glowing through.
const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const costume = costumeOf(a.type)
  const color = colorOf(tier === 'other' ? costume : tier)
  const ctx = ctxOf(a)
  const ox = GI + 10
  const tx = ox + 42
  const textW = W - tx - GI - 26
  const meta = [a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  if (a.note) meta.push(a.note)
  // Marc: the bar runs to the card's right edge, matching the room on its left.
  const barW = W - tx - GI - 14
  const progress = progressOf(a)
  const stats = `ctx ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
  // Marc: every line starts at the left edge; the steps follow the figures on the same line.
  const statsW = textWidth(stats, 12)
  const stepsW = Math.max(0, barW - statsW - 14)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fill = progress ?? ctx / 100
  const isAsleep = a.status === 'done'
  const zs = isAsleep
    ? `<text class="s zz" x="${ox + 20}" y="29" font-family="${FONT}" font-size="8" font-weight="700">z</text><text class="s zz zz2" x="${ox + 26}" y="24" font-family="${FONT}" font-size="10" font-weight="700">z</text>`
    : ''
  return svg(
    W,
    AGENT_H,
    `${glassPanel(GI, GI, W - GI * 2, AGENT_H - GI * 2, { tint: color, isQuiet: a.status !== 'running' })}
${crab(ox, 24, `${costume}#${jerseyOf(a.id)}`, false, a.status === 'running', CRAB_SCALE, isAsleep)}${zs}
<text class="t" x="${tx}" y="${GI + 22}" font-family="${FONT}" font-size="14.5" font-weight="600">${xml(fitText(a.description || a.type, 14.5, textW))}</text>
<text x="${tx}" y="${GI + 41}" font-family="${FONT}" font-size="12.5"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tier)}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
<text class="s" x="${tx}" y="${GI + 59}" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${stats}</text>
${steps && stepsW > 30 ? `<text class="t" x="${tx + statsW + 14}" y="${GI + 59}" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(fitText(steps, 12, stepsW))}</text>` : ''}
${glassBar(tx, GI + 67, barW, 6, [{ w: Math.round(barW * fill), color: progress === null ? '#9a9a96' : color }])}
${statusMark(W - GI - 14, GI + 16, a.status, color)}`,
  )
}

// The colour an agent card glows in on hover: its tier's, else its costume's.
const tintOf = (a: AgentRun): string => {
  const tier = tierOf(a.type)
  return colorOf(tier === 'other' ? costumeOf(a.type) : tier)
}

// The size a drawing was made at, read from its root element.
const sizeOf = (source: string): [number, number] => {
  const m = /<svg[^>]*?width="([\d.]+)"[^>]*?height="([\d.]+)"/.exec(source)
  return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0)]
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const ox = GI + 10
  const tx = ox + 42
  const textW = W - tx - GI - 26
  const meta = [TIER_MODEL[tier] ?? '']
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    PLANNED_H,
    `${glassPanel(GI, GI, W - GI * 2, PLANNED_H - GI * 2, { tint: color, isQuiet: true })}
${crab(ox, 10, `${tier}#${jerseyOf(p.title)}`, true)}
<text class="s" x="${tx}" y="${GI + 20}" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text x="${tx}" y="${GI + 36}" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier)}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(W - GI - 14, GI + 16, 'planned', color)}`,
  )
}

// The team in one glass capsule: the coach first, then every player.
const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    { k: 'coach', c: COSTUME_COLOR.coach ?? ACCENT, s: list.some(a => a.status === 'running') ? 'running' : 'done', dim: false },
    ...list.filter(a => a.status === 'running').map(a => ({ k: `${costumeOf(a.type)}#${jerseyOf(a.id)}`, c: colorOf(tierOf(a.type)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: `${costumeOf(a.type)}#${jerseyOf(a.id)}`, c: colorOf(tierOf(a.type)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: `${p.tier in TIER_COLOR ? p.tier : 'other'}#${jerseyOf(p.title)}`, c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const x0 = GI + 12
  const totalsText = `≈${fmtCost(t.cost)} · ${fmtTokens(t.fresh)} ${tr().fresh} · ${fmtTime(t.time)}`
  const fit = Math.max(1, Math.floor((W - x0 - GI - 16 - textWidth(totalsText, 12) - 40) / 36))
  // An Svg may not pass 131072 characters; each crab is drawn in full, so stop short of that.
  const BUDGET = 90_000
  let used = 0
  const drawn: string[] = []
  for (const [i, ic] of icons.slice(0, fit).entries()) {
    const one = crab(x0 + i * 36, 5, ic.k, ic.dim, ic.s === 'running', CRAB_SCALE, ic.s === 'done') + (ic.s === 'running' && ic.k !== 'coach' ? `<circle class="live" cx="${x0 + i * 36 + 32}" cy="9" r="3" fill="${ic.c}"/>` : '')
    if (used + one.length > BUDGET) break
    used += one.length
    drawn.push(one)
  }
  const more = icons.length - drawn.length
  const body = drawn.join('')
  const shownCount = drawn.length
  const x = x0 + shownCount * 36 + (more ? 4 : 0)
  return svg(
    W,
    COMPACT_H,
    `${glassPanel(GI, GI, W - GI * 2, COMPACT_H - GI * 2, { r: (COMPACT_H - GI * 2) / 2, tint: ACCENT, isQuiet: true })}${body}${more ? `<text class="s" x="${x}" y="26" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${W - GI - 16}" y="26" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${totalsText}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', waiting: '◷', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    await rememberPane($, false)
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  await rememberPane($, true)
  void refreshSessions($)
  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  await rememberPane($, true)
  void $.ui.open({ id: PANE, title: tr().pane }).catch(() => undefined)
}

// Marc: a pane lives in the running process, so a restart (every plugin update) left the app's
// tab with nothing behind it: "savvy-progress has not drawn in this pane". The store remembers,
// per session, that the pane was up, and session.start opens it again.
const OPEN_KEY = 'open-panes'
async function openSessions($: EngineInterface): Promise<Record<string, number>> {
  const v = await $.store.get(OPEN_KEY)
  return v && typeof v === 'object' ? (v as Record<string, number>) : {}
}
async function rememberPane($: EngineInterface, isOpen: boolean): Promise<void> {
  const id = await $.session.id()
  const all = await openSessions($)
  if (isOpen) all[id] = await $.clock.now()
  else delete all[id]
  // ponytail: keeps the 50 newest sessions; nothing else reads this list.
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 50))
  await $.store.set(OPEN_KEY, kept)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lastLookup = 0
    await ensureBuild($).catch(() => undefined)
    await syncAgents($)
    lang = await detectLang($, options.language)
    // Marc: the pane comes back only where it was up before (this session, or the ids a restart
    // gave it), never in a fresh session just because some build is still unfinished.
    const sid = await $.session.id()
    const wasOpen = await openSessions($)
    if (wasOpen[sid] || (await priorIds($, sid)).some(x => wasOpen[x])) void reopenPane($).catch(() => undefined)
    await $.tool.register({
      name: 'progress',
      description:
        'Report /savvy-flow progress to the progress bar above the prompt and the agents panel. ' +
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
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: ['fable', 'heavy', 'careful', 'medium', 'light'] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
                session: {
                  type: 'string',
                  description: 'When the task runs as a side session (start_session): its short name or local_… id, so the panel shows its cost and opens it.',
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
        'For savvy-flow workers: report progress on your own task to the agents panel. ' +
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
        'Report a multi-job build (each job = one PR) to the jobs view beside the agents panel and to the band above the prompt. ' +
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
    await $.command.register({
      name: 'agents-info',
      description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
    })

    startTimers($)
    return started
  })

  // Closed by its own mark: don't bring it back on the next start. An unload (restart) keeps it.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await rememberPane($, false)
    return next(e)
  })

  on('command.run', { command: 'agents-info' }, async $ => {
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
    }
    const next = await update($, flow, p => merge(p, input))
    if (next && input.tasks?.length) await autoOpen($, next.title)
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
    const hasChange = Boolean(input.jobs?.length || input.remove?.length || input.next || input.summary !== undefined || input.memo !== undefined || input.finished !== undefined || !prev)
    if (hasChange) await saveBuild($, linked)
    await update($, build, () => (hasChange ? linked : prev ?? linked))
    if (linked.jobs.length && !linked.isFinished) await autoOpen($, `build:${linked.id}`)
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

  // Drawing is pure (the app refuses state writes made while a pane or band draws), and /resume or
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
    await update($, now, () => at)
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
    await update($, now, () => at)
    if (e.subagentType.startsWith('savvy-')) {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
    }
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
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Link } = ui
    const wide = await everyRun($)
    const list = wide.filter(a => !a.isOutside)
    // Marc: other chats and other sessions' agents, listed only on request and never in the totals.
    const outside = wide.filter(a => a.isOutside).reverse()
    const f = await read($, flow)
    const b = await read($, build)
    const p: Panel = await read($, panel)
    // A row that leads somewhere carries a press: its session's chat, or a subagent's transcript.
    // Another session's subagent has no transcript this session can open.
    const opener = (a: AgentRun) =>
      a.link || (a.agentId && !a.fromSession) ? (
        <Button key={`open-${a.id}`} label={a.link ? s.open : s.view} plain onPress={() => void openRun($, a)} />
      ) : null
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    // Marc: the controls stay on one line: icon and word while all four fit, the icons alone when the
    // pane is too narrow. App text has one size here (the pane refuses Text `size`), so width decides.
    // Labels are proportional text, about 0.8 of a cell a character, two cells between controls.
    // The fullest set that fits: every word; then Collapse as its icon alone; then icons only.
    const paneCols = e.props.bodyColumns || 40
    const fits = (words: string[]) => words.join('').length * 0.8 + words.length * 2 + 3 * 2 + 2 <= paneCols
    const all = [b ? 'Swap' : '', s.collapse, s.allShort, s.refresh].filter(Boolean)
    const dropped = fits(all) ? new Set<string>() : fits(all.filter(w => w !== s.collapse && w !== s.expand)) ? new Set([s.collapse, s.expand]) : new Set(all.concat(s.expand, s.buildOnly))
    const iconLabel = (icon: string, word: string) => (dropped.has(word) ? icon : `${icon} ${word}`)
    const toggleCompact = (
      <Button key="compact" label={iconLabel(p.isCompact ? '⊞' : '⊟', p.isCompact ? s.expand : s.collapse)} plain onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))} />
    )
    const toggleAll =
      outside.length || p.isShowingAll ? (
        <Button
          key="show-all"
          label={p.isShowingAll ? iconLabel('◉', s.buildOnly) : `${iconLabel('◎', s.allShort)} ${outside.length}`}
          plain
          onPress={async () => {
            await update($, panel, prev => ({ ...prev, isShowingAll: !prev.isShowingAll }))
            void refreshSessions($)
          }}
        />
      ) : null
    const refreshButton = <Button key="refresh" label={iconLabel('↻', s.refresh)} plain onPress={() => refreshNow($)} />
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? '▸' : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const toggleShipped = (n: number) => (
      <Button
        key="shipped"
        label={`${p.isShippedCollapsed ? '▸' : '▾'} ${s.groups.shipped} · ${n}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isShippedCollapsed: !prev.isShippedCollapsed }))}
      />
    )
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.fresh)} ${s.fresh} ${s.tokensWord} (+${fmtTokens(t.cached)} ${s.cached}), ${fmtTime(t.time)}`
    const groups = b ? GROUPS.map(g => ({ g, jobs: b.jobs.filter(j => j.status === g) })).filter(x => x.jobs.length) : []
    // Marc: a file path as the memo is a short link that opens the file, not the whole path.
    const memoButton = (path: string) => (
      <Button key="memo" label={`${path.split('/').pop() || s.memo} ↗`} plain onPress={() => void $.process.run(['open', path])} />
    )
    const prLink = (j: Job) => (j.prUrl ? <Link key={`pr-${j.id}`} href={j.prUrl} label={`PR ${j.pr ?? ''} ↗`.replace('  ', ' ')} /> : null)

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      // Marc: a card glows in its colour only under the pointer. The card is keyed, so it is the
      // hover scope; the glow layer on top of it is hidden until then and has no key of its own.
      // The layer spans the card's width, so the app fits both drawings to the same size.
      // `inside`, drawn last so it stays pressable over the glow: a link laid on the card's bottom.
      const glowCard = (key: string, source: string, alt: string, tint: string, inside?: ReturnType<typeof prLink>) => {
        const [gw, gh] = sizeOf(source)
        return (
          <Box key={key} position="relative">
            <Svg source={source} alt={alt} />
            <Box position="absolute" top={0} left={0} width="100%" display="none" hover={{ display: 'flex' }}>
              <Svg source={glowOnly(gw, gh, tint)} alt="" />
            </Box>
            {inside ? (
              <Box position="absolute" bottom={0} left={2}>
                {inside}
              </Box>
            ) : (
              ''
            )}
          </Box>
        )
      }
      const W = Math.max(240, Math.min(1400, Math.round((e.props.bodyColumns || 40) * PANE_CELL_PX) - 8))
      // Marc: side by side wherever both columns stay legible (MIN_COL each), stacked otherwise; no switch.
      const isWide = Boolean(b) && W >= MIN_COL * 2 + COL_GAP_PX
      const CW = b ? (isWide ? Math.floor((W - COL_GAP_PX) / 2) : W) : W
      const AW = Math.min(CW, 900)
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1}>
            {b && (
              <Svg source={buildHeaderSvg(CW, b, { tiles: s.tiles, now: s.nowWord, next: s.nextWord }, coachBadge(running.length > 0)).source} alt={`${b.name}: ${summaryLine(b)}`} />
            )}
            <Svg source={compactSvg(AW, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} />
            {toggleCompact}
          </Box>
        )
      }
      // Marc: the pane's controls on one row at the top, small, each with its icon; never two lines.
      const controls = (
        <Box key="pane-controls" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={2}>
          {b ? <Button key="layout-swap" label={iconLabel(isWide ? '⇄' : '⇅', 'Swap')} plain onPress={() => update($, panel, prev => ({ ...prev, isAgentsFirst: !prev.isAgentsFirst }))} /> : null}
          {toggleCompact}
          {toggleAll}
          {refreshButton}
        </Box>
      )
      const agentsColumn = (
        <Box key="agents-col" flexDirection="column" gap={1} {...(isWide ? { width: 0, flexGrow: 1, minWidth: 0 } : {})}>
          {!b && controls}
          <Svg source={headerSvg(AW, title, t, running.length > 0)} alt={title ? `${title}: ${summary}` : summary} />
          {isEmpty && <Text dimColor>{s.empty}</Text>}
          {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
          {running.flatMap(a => [
            glowCard(a.id, agentSvg(AW, a, at), `${a.description}: ${modelName(a.model)}, ${s.isRunning}`, tintOf(a)),
            opener(a),
          ])}
          {finished.length > 0 && toggleDone}
          {!p.isDoneCollapsed &&
            finished.flatMap(a => [
              glowCard(a.id, agentSvg(AW, a, at), `${a.description}: ${modelName(a.model)}, ${s.isFinished}`, tintOf(a)),
              opener(a),
            ])}
          {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
          {planned.map(pl => (
            <Svg key={`plan-${pl.n}`} source={plannedSvg(AW, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} />
          ))}
          {p.isShowingAll && outside.length > 0 && section('h-other', `${s.otherChats} · ${outside.length}`)}
          {p.isShowingAll &&
            outside.flatMap(a => [
              glowCard(`o-${a.id}`, agentSvg(AW, a, at), `${a.description}: ${modelName(a.model)}, ${a.status === 'running' ? s.isRunning : s.isFinished}`, tintOf(a)),
              opener(a),
            ])}
        </Box>
      )
      if (!b) return agentsColumn

      const header = buildHeaderSvg(CW, b, { tiles: s.tiles, now: s.nowWord, next: s.nextWord }, coachBadge(running.length > 0))
      // Marc: a job card is a native box: the drawing holds its text, and the PR link flows beneath
      // it inside the same box, so the box grows to whatever size the app draws the link at (a link
      // laid over the drawing by estimate overlapped the text and was cut off). Under the pointer the
      // edge takes the job's colour and a glimmer sweeps across.
      const card = (j: Job) => {
        const tint = JOB_COLORS[j.status]
        const drawn = jobCardSvg(CW, b, j, runLines(runsOf(j, list), at), { updated: s.updated, waitingOn: s.waitingOn, more: s.more }, { isBare: true, hasLink: Boolean(j.prUrl) })
        return [
          <Box key={`job-${j.id}`} position="relative" overflow="hidden" flexDirection="column" borderStyle="round" borderColor={GLASS_EDGE} backgroundColor={GLASS_FILL} paddingX={1} paddingY={0} hover={{ borderColor: `${tint}8c` }}>
            <Box position="absolute" top={0} left={0} width={WIDE_CELLS}>
              <Svg source={GLASS_SHEEN} alt="" width={2400} height={40} />
            </Box>
            <Box position="absolute" top={0} left={0} width={WIDE_CELLS} display="none" hover={{ display: 'flex' }}>
              <Svg source={GLIMMER} alt="" width={GLIMMER_W} height={GLIMMER_H} />
            </Box>
            <Svg source={drawn.source} alt={`${labelOf(b, j)}: ${j.title}, ${s.groups[j.status]}${j.waitingOn ? `, ${s.waitingOn} ${j.waitingOn}` : ''}`} />
            {j.prUrl ? (
              <Box key={`prrow-${j.id}`} flexDirection="row" alignItems="center" columnGap={1}>
                <Svg source={prLineSvg(`PR ${j.pr ?? ''}`.trim(), CW * 0.8, PANE_CELL_REAL / PANE_CELL_PX).source} alt={`PR ${j.pr ?? ''}`} />
                <Link key={`pr-${j.id}`} href={j.prUrl} label="↗" />
              </Box>
            ) : (
              ''
            )}
            {/* An exact 10px under the last line: a cell of padding was too much. */}
            <Svg source={SPACER} alt="" width={1} height={10} />
          </Box>,
        ]
      }
      const jobsColumn = (
        <Box key="jobs-col" flexDirection="column" gap={1} {...(isWide ? { width: 0, flexGrow: 1, minWidth: 0 } : {})}>
          <Svg source={header.source} alt={`${b.name}: ${summaryLine(b)}`} />
          {b.memo && (/^https?:/.test(b.memo) ? <Link key="memo" href={b.memo} label={s.memo} /> : memoButton(b.memo))}
          {groups.length === 0 && <Text dimColor>{s.noJobs}</Text>}
          {groups.flatMap(({ g, jobs }) =>
            g === 'shipped'
              ? [toggleShipped(jobs.length), ...(p.isShippedCollapsed ? [] : jobs.flatMap(card))]
              : [section(`h-${g}`, `${s.groups[g]} · ${jobs.length}`), ...jobs.flatMap(card)],
          )}
        </Box>
      )
      // Marc: the only control at the top left is Swap.
      return (
        <Box flexDirection="column" gap={1}>
          {controls}
          <Box flexDirection={isWide ? 'row' : 'column'} flexWrap="nowrap" columnGap={2} rowGap={2} alignItems={isWide ? 'flex-start' : 'stretch'}>
            {/* Marc: Swap puts the agents first, on top when stacked, on the left side by side. */}
            {p.isAgentsFirst ? agentsColumn : jobsColumn}
            {p.isAgentsFirst ? jobsColumn : agentsColumn}
          </Box>
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = colorOf(tier)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)
      const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · ` : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tier} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
            {a.note ? ` · ${a.note}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {steps}ctx {ctx}% · {fmtTokens(a.contextTokens)} ≈{fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
          {opener(a)}
        </Box>
      )
    }
    const jobRow = (j: Job) => {
      const color = JOB_COLORS[j.status]
      const runs = runLines(runsOf(j, list), at)
      return (
        <Box key={`job-${j.id}`} flexDirection="column" marginBottom={1}>
          <Text wrap="truncate-end">
            <Text color={color}>▍</Text>
            <Text dimColor>{labelOf(b as Build, j)} · </Text>
            <Text bold>{j.title}</Text>
          </Text>
          {j.detail && (
            <Text dimColor wrap="truncate-end">
              {'  '}
              {j.detail}
            </Text>
          )}
          {j.waitingOn && (
            <Text color={JOB_COLORS.waiting} wrap="truncate-end">
              {'  '}
              {s.waitingOn} {j.waitingOn}
            </Text>
          )}
          <Text dimColor wrap="truncate-end">
            {'  '}
            {s.updated} {fmtDay(j.updated)}
            {j.pr && !j.prUrl ? ` · PR ${j.pr}` : ''}
          </Text>
          {prLink(j)}
          {runs.map(r => (
            <Text key={`${j.id}-${r.name}`} dimColor wrap="truncate-end">
              {'  '}
              <Text color={r.status === 'running' ? JOB_COLORS.running : r.status === 'done' ? JOB_COLORS.shipped : JOB_COLORS.waiting}>●</Text> {r.name} · {r.state}
              {r.stats ? ` · ${r.stats}` : ''}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {b && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold wrap="truncate-end">
              {b.name}
            </Text>
            <Text wrap="truncate-end">{summaryLine(b)}</Text>
            {nowNext(b).now && (
              <Text wrap="truncate-end">
                <Text color={JOB_COLORS.running}>{s.nowWord} </Text>
                <Text dimColor>{nowNext(b).now}</Text>
              </Text>
            )}
            {nowNext(b).next && (
              <Text wrap="truncate-end">
                <Text color={JOB_COLORS.planned}>{s.nextWord} </Text>
                <Text dimColor>{nowNext(b).next}</Text>
              </Text>
            )}
            <Text wrap="truncate-end">
              {GROUPS.map(g => (
                <Text key={`bar-${g}`} color={JOB_COLORS[g]}>
                  {'█'.repeat(Math.round((Math.max(10, cols - 4) * countJobs(b)[g]) / Math.max(1, b.jobs.length)))}
                </Text>
              ))}
            </Text>
            {b.memo && (/^https?:/.test(b.memo) ? <Link key="memo" href={b.memo} label={s.memo} /> : <Text dimColor>{b.memo}</Text>)}
            {!p.isCompact &&
              groups.map(({ g, jobs }) => (
                <Box key={`g-${g}`} flexDirection="column" marginTop={1}>
                  {g === 'shipped' ? toggleShipped(jobs.length) : <Text dimColor>{s.groups[g]} · {jobs.length}</Text>}
                  {g === 'shipped' && p.isShippedCollapsed ? null : jobs.map(jobRow)}
                </Box>
              ))}
          </Box>
        )}
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        <Text dimColor>
          ≈{fmtCost(t.cost)} · {fmtTokens(t.fresh)} {s.fresh} {s.tokensWord} · +{fmtTokens(t.cached)} {s.cached} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(tierOf(a.type))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {running.map(row)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
            {toggleAll}
            {refreshButton}
            {p.isShowingAll && outside.length > 0 && <Text dimColor>{s.otherChats} · {outside.length}</Text>}
            {p.isShowingAll && outside.map(row)}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tier} · {TIER_MODEL[tier] ?? ''}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
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

    // Marc: the magnifier says the count opens the agents panel.
    const crewButton = <Button key="savvy-agents" label={`🔍 ×${crew}`} plain onPress={() => void togglePane($)} />
    // Marc: refresh where it always works: the band draws even when the pane doesn't. It reopens the
    // pane drawn fresh by this copy of the mod and re-reads everything.
    const bandRefresh = (
      <Button
        key="savvy-refresh"
        label="↻"
        plain
        onPress={async () => {
          await reopenPane($)
          await refreshNow($)
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
          await update($, flow, () => null)
          await update($, build, () => null)
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
