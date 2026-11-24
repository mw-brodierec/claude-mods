// The savvy-progress pane's pure parts, ported for the board: data rules (cost, side-session rows,
// totals) and drawings (crabs, the jersey lineup, agent cards, the totals header, the compact strip).
// Copied verbatim from ../savvy-progress/hooks/register.tsx at a3fd6a9 (lines 47, 511-519, 525-662,
// 766-785, 787-1132), which can't be imported here: it is JSX and needs the claude-code runtime.
// Only edits: `tr()` reads the English strings below, and the names the board uses are exported.
// Keep in step with register.tsx when its drawings or rules change.

import type { AgentRun, Flow, PlannedTask, SideSession } from '../savvy-progress/types'
import { FONT, JOB_THEME, fitText, textWidth, xml } from '../savvy-progress/hooks/jobs'
import type { RunLine } from '../savvy-progress/hooks/jobs'
import { GLASS, GLASS_CSS, glassBar, glassDefs, glassPanel } from '../savvy-progress/hooks/glass'

const S = {
  cost: 'Cost', tokens: 'New tokens', cached: 'cached', fresh: 'new', time: 'Time', round: 'round', failed: 'error', after: 'after',
  isRunning: 'running', isFinished: 'finished', otherChat: 'other chat',
  states: { blocked: 'needs you', review_ready: 'ready for review', completed: 'done' } as Record<string, string>,
}
const tr = () => S
const ACCENT = '#8f8cf4'

const runLines = (runs: readonly AgentRun[], at: number): RunLine[] =>
  runs.map(r => {
    const s = tr()
    const state = r.note || (r.status === 'running' ? s.isRunning : r.status === 'done' ? s.isFinished : r.status === 'failed' ? s.failed : s.states.blocked)
    return { name: r.name || r.description || r.type, status: r.status, state: state ?? '', stats: `≈${fmtCost(r.costUsd)} · ${fmtTime(elapsed(r, at))}` }
  })

// The coach beside a build's name, running the team.
const coachBadge = (isWorking: boolean) => ({ svg: crab(0, -1, 'coach', false, isWorking, 1), css: CRAB_CSS, w: 36 })

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

export { coachBadge, CRAB_CSS, PANE_CSS, agentSvg, colorOf, compactSvg, crab, elapsed, fmtCost, fmtTime, fmtTokens, headerSvg, modelName, runLines, sideRuns, tintOf, totals }
