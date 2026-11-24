// Build jobs: the level above the task list. A build is many jobs (one PR each), each
// run by one or more agents or side sessions. The orchestrator writes the list through
// the `jobs` tool; it lives in a JSON file per build so every session sees it.
//
// Pure functions only (data in, strings out), so tests and the demo page can call them.
// To restyle the jobs view, change JOB_THEME and JOB_CSS (the glass itself: GLASS in glass.ts).

import type { AgentRun, Build, Job, JobStatus } from '../types'
import { GLASS, GLASS_CSS, glassBar, glassDefs, glassPanel } from './glass'

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

// ---------------------------------------------------------------------------
// Theme: every color and size the jobs view draws with.

export const JOB_THEME = {
  status: {
    running: '#8f8cf4',
    waiting: '#D08A1E',
    planned: '#8a8a86',
    later: '#b9b8b3',
    shipped: '#3B9C5F',
  } as Record<JobStatus, string>,
  failed: '#D0453F',
  pad: 12,
  // Marc: sizes close to the app's own text (a PR link beside them reads the same size).
  size: { label: 12, title: 16, body: 14, agent: 13, header: 16, summary: 13.5, tileKey: 12.5, tileValue: 20 },
  line: { title: 21, body: 19, agent: 20 },
  maxLines: { title: 2, detail: 3, waiting: 2, summary: 3 },
  maxAgents: 4,
  tileH: 58,
  barH: 10,
}

// Light first, dark under the media query: the app draws an SVG as an image, which follows the OS.
export const JOB_CSS = `<style>
/* Marc: text never light on light or dark on dark. Each text carries a thin halo in the opposite tone, drawn under its fill, so it reads on any background; on a matching one the halo blends in. */
.t{fill:#1f1f1f}.s{fill:#5f5f5c}.m{fill:#80807c}.k{fill:#ecebe8}.ln{stroke:#e6e5e1}.card{fill:#faf9f7;stroke:#e6e5e1}.tile{fill:#f4f3f0}
text{paint-order:stroke;stroke:#ffffff;stroke-opacity:.8;stroke-width:2.4px;stroke-linejoin:round}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#8d8d89}.k{fill:#2c2c2b}.ln{stroke:#333331}.card{fill:#222221;stroke:#333331}.tile{fill:#262625}
text{stroke:#141413}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
.lk{fill:#2563c9}@media (prefers-color-scheme: dark){.lk{fill:#6aa8f5}}
</style>`

// Group order and names on the page; `later` sits after planned, shipped last.
export const GROUPS: readonly JobStatus[] = ['running', 'waiting', 'planned', 'later', 'shipped']
export const STATUSES: readonly JobStatus[] = GROUPS

// ---------------------------------------------------------------------------
// Text helpers shared with the agents panel.

export const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Rough advance of system UI text, in em; good enough to size a slot.
const charEm = (ch: string): number =>
  /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

export const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
export const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

// Greedy word wrap to `maxLines`; the last line is cut with … when text remains.
export const wrap = (s: string, size: number, maxW: number, maxLines: number): string[] => {
  const words = s.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    const next = cur ? `${cur} ${w}` : w
    if (textWidth(next, size) <= maxW || !cur) {
      cur = next
      continue
    }
    lines.push(cur)
    cur = w
    if (lines.length === maxLines - 1) {
      const rest = [cur, ...words.slice(i + 1)].join(' ')
      lines.push(fitText(rest, size, maxW))
      return lines
    }
  }
  if (cur) lines.push(fitText(cur, size, maxW))
  return lines.slice(0, maxLines)
}

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'build'

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Sun Nov 22": the weekday always beside the date.
export const fmtDay = (ms: number): string => {
  const d = new Date(ms)
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// ---------------------------------------------------------------------------
// The tool's input and the merge that keeps the file the single truth.

export type JobInput = {
  id?: string
  label?: string
  title?: string
  detail?: string
  status?: string
  waitingOn?: string
  pr?: string | number
  prUrl?: string
  sessions?: string[]
  updated?: string
}

export type JobsInput = {
  build?: string
  summary?: string
  memo?: string
  jobs?: JobInput[]
  remove?: string[]
  finished?: boolean
  /** Job ids in the order they run next. */
  next?: string[]
}

const FIELDS = ['label', 'title', 'detail', 'waitingOn', 'prUrl'] as const

const parseDay = (s: string | undefined): number | undefined => {
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : undefined
}

// Upserts by job id: a field left out keeps its value, an empty string clears it.
// `updated` moves only when something about the job changed (or the caller backdates it).
export const mergeBuild = (prev: Build | null, input: JobsInput, at: number, project: string): Build => {
  const name = input.build?.trim() || prev?.name || 'Build'
  const base: Build = prev ?? { id: slug(name), name, project, jobs: [], createdAt: at, updatedAt: at, isFinished: false }
  const jobs = base.jobs.map(j => ({ ...j }))
  for (const raw of input.jobs ?? []) {
    const id = (raw.id ?? '').trim() || slug(raw.title ?? '')
    if (!id || id === 'build') continue
    let job = jobs.find(j => j.id === id)
    const isNew = !job
    if (!job) {
      if (!raw.title?.trim()) continue
      job = { id, title: raw.title.trim(), status: 'planned', sessions: [], updated: at }
      jobs.push(job)
    }
    const before = JSON.stringify(job)
    for (const k of FIELDS) {
      const v = raw[k]
      if (v === undefined) continue
      if (v.trim()) job[k] = v.trim()
      else delete job[k]
    }
    if (raw.status && (STATUSES as readonly string[]).includes(raw.status)) job.status = raw.status as JobStatus
    if (raw.pr !== undefined) {
      const pr = String(raw.pr).replace(/^#/, '').trim()
      if (pr) job.pr = pr
      else delete job.pr
    }
    if (raw.sessions) job.sessions = [...new Set(raw.sessions.map(s => s.trim()).filter(Boolean))]
    // A job that is no longer waiting drops its reason.
    if (job.status !== 'waiting' && raw.waitingOn === undefined) delete job.waitingOn
    const backdated = parseDay(raw.updated)
    if (backdated !== undefined) job.updated = backdated
    else if (isNew || JSON.stringify(job) !== before) job.updated = at
  }
  const removed = new Set(input.remove ?? [])
  const kept = jobs.filter(j => !removed.has(j.id))
  const next: Build = {
    ...base,
    name,
    jobs: kept,
    updatedAt: at,
    isFinished: input.finished ?? base.isFinished,
  }
  if (input.summary !== undefined) {
    if (input.summary.trim()) next.summary = input.summary.trim()
    else delete next.summary
  }
  if (input.memo !== undefined) {
    if (input.memo.trim()) next.memo = input.memo.trim()
    else delete next.memo
  }
  if (input.next) next.next = input.next.map(x => x.trim()).filter(Boolean)
  return next
}

export type Counts = Record<JobStatus, number> & { total: number }

export const countJobs = (b: Build): Counts => {
  const c = { running: 0, waiting: 0, planned: 0, later: 0, shipped: 0, total: b.jobs.length }
  for (const j of b.jobs) c[j.status]++
  return c
}

// "5 of 17 jobs shipped, 2 running, 1 waiting": derived, so it never drifts from the cards.
export const summaryLine = (b: Build): string => {
  const c = countJobs(b)
  const parts = [`${c.shipped} of ${c.total} ${c.total === 1 ? 'job' : 'jobs'} shipped`]
  if (c.running) parts.push(`${c.running} running`)
  if (c.waiting) parts.push(`${c.waiting} waiting`)
  return parts.join(', ')
}

export const labelOf = (b: Build, j: Job): string => j.label || `Job ${b.jobs.indexOf(j) + 1}`

// Marc: a job's PR numbers as a drawing, so they read at the card's own text size (the pane's
// link text has one fixed size, larger than the card's). The pane puts a ↗ link beside it.
// `scale` makes up for the card body being drawn wider than its column and shrunk to fit.
export const prLineSvg = (text: string, maxW: number, scale: number): Drawn => {
  const size = JOB_THEME.size.body * scale
  const shown = fitText(text, size, maxW)
  const W = Math.ceil(textWidth(shown, size) + 2)
  const H = Math.ceil(size * 1.45)
  return { source: svg(W, H, txt(0, Math.round(size * 1.1), size, shown, 'class="lk" font-weight="500"')), height: H }
}

// Marc: what is happening now and what comes next, read from the jobs themselves (a written
// summary went stale: "13 of 19" under a header counting 16 of 21). Now: the running jobs, else
// those waiting and on what. Next: the first two planned, else the first two for later.
export const nowNext = (b: Build): { now: string; next: string } => {
  const of = (s: JobStatus) => b.jobs.filter(j => j.status === s)
  const name = (j: Job) => `${labelOf(b, j)} ${j.title}`
  const running = of('running')
  const now = running.length
    ? running.map(name).join(' · ')
    : of('waiting').map(j => `${name(j)}${j.waitingOn ? ` (waiting on ${j.waitingOn})` : ''}`).join(' · ')
  // Next, in the build's own order: the ids the orchestrator set (`next`), else the "Next: …"
  // sentence of the summary it wrote, else the first two planned in list order (a guess).
  const byId = new Map(b.jobs.map(j => [j.id, j]))
  const set = (b.next ?? []).map(id => byId.get(id)).filter((j): j is Job => j !== undefined && j.status !== 'shipped')
  const said = /\bNext:\s*(.+?)(?:\.\s|\.?$)/.exec(b.summary ?? '')?.[1]?.trim()
  const queued = of('planned').length ? of('planned') : of('later')
  const next = set.length ? set.slice(0, 3).map(name).join(' · ') : said || queued.slice(0, 2).map(name).join(' · ')
  return { now, next }
}

// The tool's answer: the whole list back, so a fresh orchestrator can pick the build up.
export const buildReport = (b: Build): string =>
  [
    `${b.name} (${b.id}): ${summaryLine(b)}${b.isFinished ? ', build finished' : ''}`,
    ...(b.memo ? [`memo: ${b.memo}`] : []),
    ...GROUPS.flatMap(g =>
      b.jobs
        .filter(j => j.status === g)
        .map(
          j =>
            `- ${j.id} [${j.status}] ${labelOf(b, j)}: ${j.title}` +
            (j.waitingOn ? ` · waiting on: ${j.waitingOn}` : '') +
            (j.pr ? ` · PR ${j.pr}` : '') +
            (j.sessions.length ? ` · ${j.sessions.join(', ')}` : '') +
            ` · updated ${fmtDay(j.updated)}`,
        ),
    ),
  ].join('\n')

// Which runs work on a job: its `sessions` name a side session (name or local_… id) or a
// subagent (its Agent description), in any case and spacing.
export const runsOf = (j: Job, runs: readonly AgentRun[]): AgentRun[] => {
  const keys = new Set(j.sessions.map(norm))
  return runs.filter(r => keys.has(norm(r.id)) || (r.name && keys.has(norm(r.name))) || keys.has(norm(r.description)))
}

// ---------------------------------------------------------------------------
// Drawings. Each returns { source, height } at the width asked.

type Drawn = { source: string; height: number }

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${JOB_CSS}${GLASS_CSS}${glassDefs()}${body}</svg>`

const txt = (x: number, y: number, size: number, s: string, attrs = ''): string =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" ${attrs}>${xml(s)}</text>`

export type RunLine = { name: string; state: string; stats: string; status: string }

// The header: build name, derived summary, the orchestrator's own sentence, four tiles, a bar by status.
// `badge` is an SVG fragment drawn left of the name (the general, from register.tsx), with its CSS.
export const buildHeaderSvg = (W: number, b: Build, words: { tiles: [string, string, string, string]; now?: string; next?: string }, badge?: { svg: string; css: string; w: number }): Drawn => {
  const T = JOB_THEME
  const c = countJobs(b)
  let y = 0
  const parts: string[] = []
  const nx = badge ? badge.w : 0
  if (badge) parts.push(badge.css, badge.svg)
  y += 22
  parts.push(txt(nx, y, T.size.header, fitText(b.name, T.size.header, W - nx), 'class="t" font-weight="600"'))
  y += 22
  parts.push(txt(0, y, T.size.summary, fitText(summaryLine(b), T.size.summary, W), 'class="t"'))
  const nn = nowNext(b)
  const rows: [string, string, string][] = [
    [words.now ?? 'Now', nn.now, T.status.running],
    [words.next ?? 'Next', nn.next, T.status.planned],
  ]
  const keyW = Math.max(...rows.map(([k]) => textWidth(k, T.size.body))) + 10
  for (const [k, v, color] of rows) {
    if (!v) continue
    const lines = wrap(v, T.size.body, W - keyW, 2)
    lines.forEach((line, i) => {
      y += T.line.body + (i ? 0 : 2)
      if (!i) parts.push(txt(0, y, T.size.body, k, `fill="${color}" font-weight="600"`))
      parts.push(txt(keyW, y, T.size.body, line, 'class="s"'))
    })
  }
  y += 12
  // Tiles: shipped, running, waiting, to do (planned + later), inset for their shadows.
  const gap = 8
  const I = GLASS.inset
  const tw = (W - I * 2 - gap * 3) / 4
  const tiles: [string, number, string][] = [
    [words.tiles[0], c.shipped, T.status.shipped],
    [words.tiles[1], c.running, T.status.running],
    [words.tiles[2], c.waiting, T.status.waiting],
    [words.tiles[3], c.planned + c.later, T.status.planned],
  ]
  tiles.forEach(([k, v, color], i) => {
    const x = I + i * (tw + gap)
    parts.push(
      glassPanel(x, y, tw, T.tileH, { r: GLASS.tileRadius, tint: color, isQuiet: v === 0 }),
      `<circle cx="${x + 14}" cy="${y + 17}" r="3.5" fill="${color}"/>`,
      txt(x + 22, y + 21, T.size.tileKey, fitText(k, T.size.tileKey, tw - 30), 'class="s"'),
      txt(x + 12, y + 47, T.size.tileValue, String(v), 'class="t" font-weight="600" font-variant-numeric="tabular-nums"'),
    )
  })
  y += T.tileH + 12
  // Progress by status: shipped, running, waiting, planned, later, left to right, as liquid in glass.
  const BW = W - I * 2
  const order: JobStatus[] = ['shipped', 'running', 'waiting', 'planned', 'later']
  parts.push(glassBar(I, y, BW, T.barH, order.map(s => ({ w: c.total ? (BW * c[s]) / c.total : 0, color: T.status[s], isFaint: s === 'planned' || s === 'later' }))))
  // Room under the bar for its glow, so the drawing's edge never cuts it.
  y += T.barH + 10
  return { source: svg(W, y, parts.join('')), height: y }
}

// One job's card: label and date, title, detail, what it waits on, its PR, its live agents.
// `isBare` (Marc): the body alone, no glass panel: the pane draws the card as a native box around
// it, so a PR link can flow beneath the body inside the card and the box grows to fit it.
// `hasLink`: a link follows, so the body ends with less room below.
export const jobCardSvg = (W: number, b: Build, j: Job, runs: readonly RunLine[], words: { updated: string; waitingOn: string; more: string }, opts: { isBare?: boolean; hasLink?: boolean } = {}): Drawn => {
  const T = JOB_THEME
  const color = T.status[j.status]
  // A bare body sits in the pane's own padded box: almost no room of its own, or the two add up.
  const I = opts.isBare ? 0 : GLASS.inset
  const x0 = opts.isBare ? 1 : I + T.pad + 2
  const xr = opts.isBare ? W - 1 : W - I - T.pad
  const inner = xr - x0
  const parts: string[] = []
  // Marc: the same room above the first line as below the last (the pane adds 10px under the card).
  let y = opts.isBare ? 23 : I + T.pad + 11
  const date = `${words.updated} ${fmtDay(j.updated)}`
  const dateW = textWidth(date, T.size.label) + 8
  parts.push(
    txt(x0, y, T.size.label, fitText(labelOf(b, j).toUpperCase(), T.size.label, inner - dateW), `fill="${color}" font-weight="600" letter-spacing=".04em"`),
    txt(xr, y, T.size.label, date, 'class="m" text-anchor="end"'),
  )
  const title = wrap(j.title, T.size.title, inner, T.maxLines.title)
  for (const line of title) {
    y += T.line.title
    parts.push(txt(x0, y, T.size.title, line, 'class="t" font-weight="600"'))
  }
  for (const line of j.detail ? wrap(j.detail, T.size.body, inner, T.maxLines.detail) : []) {
    y += T.line.body
    parts.push(txt(x0, y, T.size.body, line, 'class="s"'))
  }
  if (j.waitingOn) {
    const lines = wrap(`${words.waitingOn} ${j.waitingOn}`, T.size.body, inner, T.maxLines.waiting)
    for (const line of lines) {
      y += T.line.body
      parts.push(txt(x0, y, T.size.body, line, `fill="${T.status.waiting}" font-weight="500"`))
    }
  }
  if (j.pr && !j.prUrl) {
    y += T.line.body
    parts.push(txt(x0, y, T.size.body, `PR ${j.pr}`, 'class="s" font-weight="500"'))
  }
  if (runs.length) {
    y += 9
    parts.push(`<line class="ln" x1="${x0}" y1="${y}" x2="${xr}" y2="${y}"/>`)
    for (const r of runs.slice(0, T.maxAgents)) {
      y += T.line.agent
      const dot = r.status === 'running' ? T.status.running : r.status === 'done' ? T.status.shipped : r.status === 'failed' ? T.failed : T.status.waiting
      const right = r.stats ? `${r.state} · ${r.stats}` : r.state
      const rightW = textWidth(right, T.size.agent) + 10
      parts.push(
        `<circle${r.status === 'running' ? ' class="live"' : ''} cx="${x0 + 3.5}" cy="${y - 4}" r="3.5" fill="${dot}"/>`,
        txt(x0 + 13, y, T.size.agent, fitText(r.name, T.size.agent, inner - 13 - rightW), 'class="t"'),
        txt(xr, y, T.size.agent, right, 'class="s" text-anchor="end" font-variant-numeric="tabular-nums"'),
      )
    }
    if (runs.length > T.maxAgents) {
      y += T.line.agent
      parts.push(txt(x0 + 13, y, T.size.agent, `+${runs.length - T.maxAgents} ${words.more}`, 'class="m"'))
    }
  }
  const H = Math.ceil(y + (opts.isBare ? 5 : T.pad + I))
  const isQuiet = j.status === 'planned' || j.status === 'later' || j.status === 'shipped'
  return {
    source: svg(W, H, (opts.isBare ? '' : glassPanel(I, I, W - I * 2, H - I * 2, { tint: color, isQuiet })) + parts.join('')),
    height: H,
  }
}
