// The board's data layer and drawing: what to show, read from the files every savvy-progress
// session already writes, and the HTML for it. Pure functions (data in, strings out), so
// board.test.mjs can call them; server.mjs does the reading, the timers and the pushing.
// The rules mirror the mod's (savvy-progress/hooks/register.tsx: refreshFleet, everyRun, totals),
// seen from no session at all: every agents file counts, and the build's orchestrators lead.

import { registerHooks } from 'node:module'

// The mod's modules import each other without the .ts extension (its runtime resolves them);
// Node needs it, so add it here rather than touch the mod.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, ctx)
      throw e
    }
  },
})

const jobs = await import('../savvy-progress/hooks/jobs.ts')
const glass = await import('../savvy-progress/hooks/glass.ts')
const pane = await import('./pane.ts')

const { GROUPS, JOB_CSS, JOB_THEME, buildHeaderSvg, jobCardSvg, labelOf, nowNext, runsOf, summaryLine, xml } = jobs
const { agentSvg, coachBadge, compactSvg, headerSvg, modelName, runLines, sideRuns, tintOf, totals } = pane

export { nowNext, summaryLine }

// --- what to show

// Mod values: rows from the last 12h; a "running" row in a file not saved for 60s lost its process.
export const FLEET_MS = 12 * 3600_000
export const FLEET_STALE_MS = 60_000
export const isBuild = v => typeof v === 'object' && v !== null && typeof v.id === 'string' && Array.isArray(v.jobs)

// The build to show: the newest unfinished one with jobs. Unlike the mod's last fallback (three days),
// any age: a build can wait weeks on one job, and an always-on board shouldn't drop it.
export const pickBuild = builds =>
  builds.filter(b => isBuild(b) && !b.isFinished && b.jobs.length > 0).sort((a, z) => z.updatedAt - a.updatedAt)[0] ?? null

// The picker's list: every build by name, how far it got and when it last moved; unfinished first,
// newest first. A build's name is what its orchestrator called it in the `jobs` tool.
export const buildOptions = builds =>
  builds
    .filter(isBuild)
    .sort((a, z) => Number(a.isFinished) - Number(z.isFinished) || z.updatedAt - a.updatedAt)
    .map(b => ({ id: b.id, name: b.name, shipped: b.jobs.filter(j => j.status === 'shipped').length, total: b.jobs.length, updatedAt: b.updatedAt, isFinished: Boolean(b.isFinished) }))

// What one sessions.py scan covers: every unfinished build and any finished one a window is watching.
export const watchedScope = (builds, watching) => {
  const list = builds.filter(b => isBuild(b) && (!b.isFinished || watching.has(b.id)))
  return { jobs: list.flatMap(b => b.jobs), orchestrators: [...new Set(list.flatMap(b => b.orchestrators ?? []))] }
}

// Every session's saved agent rows ({ name: '<cli id>.json', data: { savedAt, runs } }), with the
// stale-running rule: a running row whose file stopped its 15s heartbeat shows finished at its last save.
export const fleetRows = (files, at) => {
  const rows = []
  for (const { name, data } of files) {
    const savedAt = data?.savedAt ?? 0
    if (at - savedAt > FLEET_MS || !Array.isArray(data?.runs)) continue
    const from = name.replace(/\.json$/, '')
    for (const r of data.runs) {
      if (!r || typeof r.id !== 'string' || at - r.startedAt > FLEET_MS) continue
      const isDead = r.status === 'running' && at - savedAt > FLEET_STALE_MS
      rows.push({ ...r, fromSession: from, ...(isDead ? { status: 'done', endedAt: savedAt } : {}) })
    }
  }
  return rows
}

// How to call sessions.py: once with no parent (every live chat, the orchestrators' own among them)
// and once per orchestrator (its side sessions even when they went quiet), naming the jobs' sessions.
export const sessionCalls = build => {
  const extra = [...new Set((build?.jobs ?? []).flatMap(j => j.sessions).filter(x => /^local_[\w-]+$/.test(x)))]
  return ['', ...(build?.orchestrators ?? [])].map(parent => [parent, '--live', ...extra])
}

// One list from those calls: a row any call saw as a side session is one.
export const mergeSessions = lists => {
  const byId = new Map()
  for (const row of lists.flat()) {
    const had = byId.get(row.id)
    byId.set(row.id, had ? { ...had, ...row, isOther: had.isOther && row.isOther } : row)
  }
  return [...byId.values()]
}

// Every run, the build's marked apart from the rest (the mod's everyRun, with no session of its own).
// The build's leads: its orchestrators and the chats that started its side sessions. A chat or a saved
// agent row from anyone else is outside: listed under "All chats", never in the totals. A saved row
// whose session also shows as a chat row is a shadow: that row's cost already has it.
export const scope = (build, side, fleet) => {
  const ownSide = side.filter(s => !s.isOther)
  const leads = new Set([...(build?.orchestrators ?? []), ...ownSide.flatMap(s => [s.parentCli ?? '', s.cli ?? '']).filter(Boolean)])
  const own = sideRuns(side, null, leads)
  const seen = new Set(own.map(a => a.id))
  const counted = new Set(side.map(s => s.cli).filter(Boolean))
  const others = fleet
    .filter(a => !seen.has(a.id))
    .map(a => ({
      ...a,
      ...(a.fromSession && counted.has(a.fromSession) ? { isShadow: true } : {}),
      ...(a.fromSession && leads.has(a.fromSession) ? {} : { isOutside: true }),
    }))
  return [...own, ...others]
}

// What the page draws: the build, the build's runs split running/finished, the rest, the totals.
export const view = (build, runs, now) => {
  const list = runs.filter(a => !a.isOutside)
  const outside = runs.filter(a => a.isOutside).reverse()
  const at = Math.max(now, ...list.map(a => a.startedAt), 0)
  return {
    build,
    at,
    list,
    running: list.filter(a => a.status === 'running').reverse(),
    finished: list.filter(a => a.status !== 'running').reverse(),
    outside,
    totals: totals(list, at),
  }
}

// --- drawing

const MIN_COL = 320
const COL_GAP = 16
// A job card's box: its border and side padding, so the drawing inside fits exactly.
const CARD_PAD = 12

// The page carries every drawing's CSS once; each inline drawing keeps none of its own.
export const SVG_CSS = [JOB_CSS, glass.GLASS_CSS, pane.PANE_CSS, pane.CRAB_CSS].map(s => s.replace(/<\/?style>/g, '')).join('\n')

// Inline SVGs share one document, so each drawing's ids (gradients, clips, filters) get its own prefix.
const inline = (svg, key) => {
  const p = `${key.replace(/[^\w-]/g, '_')}-`
  return svg
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/\sid="([^"]+)"/g, ` id="${p}$1"`)
    .replace(/url\(#/g, `url(#${p}`)
}

const esc = s => xml(String(s ?? ''))
const isGitHub = u => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(u ?? '')
const isLocal = id => /^local_[\w-]+$/.test(id ?? '')

const WORDS = {
  tiles: ['Shipped', 'Running', 'Waiting', 'To do'],
  card: { updated: 'Updated', waitingOn: 'Waiting on:', more: 'more' },
  groups: { running: 'Running', waiting: 'Waiting on something', planned: 'Planned', later: 'Later', shipped: 'Shipped' },
}

// The whole board at width W, as HTML. Folds and toggles are classes the page sets; every part is
// drawn, except other chats' cards (dozens of crabs), drawn only when the page asks (`opts.all`).
export const render = (v, W, opts = {}) => {
  const b = v.build
  const isWide = Boolean(b) && W >= MIN_COL * 2 + COL_GAP
  const CW = b ? (isWide ? Math.floor((W - COL_GAP) / 2) : W) : W
  const AW = Math.min(CW, 900)
  const isWorking = v.running.length > 0
  const h3 = (k, text, cls = '') => `<h3 data-k="${k}"${cls ? ` class="${cls}"` : ''}>${esc(text)}</h3>`
  // Other chats' cards tick with the 12s scan (`opts.outsideAt`), not every second: dozens of crabs.
  const agentCard = (a, prefix, at = v.at) => {
    const key = `${prefix}${a.id}`
    const open = isLocal(a.id) && a.link ? `<button class="open" data-k="open" data-open="${esc(a.id)}">Open chat ↗</button>` : ''
    return `<div class="agent" data-k="${esc(key)}" style="--tint:${tintOf(a)}" title="${esc(`${a.description || a.type}: ${modelName(a.model)}`)}"><div data-k="s">${inline(agentSvg(AW, a, at), key)}</div>${open}</div>`
  }

  let jobsCol = ''
  if (b) {
    const nn = nowNext(b)
    const header = buildHeaderSvg(CW, b, { tiles: WORDS.tiles, now: 'Now', next: 'Next' }, coachBadge(isWorking)).source
    const memo = b.memo
      ? /^https?:/.test(b.memo)
        ? `<a class="memo" data-k="memo" href="${esc(b.memo)}" target="_blank" rel="noopener">Build memo ↗</a>`
        : `<button class="memo" data-k="memo" data-memo="1">${esc(b.memo.split('/').pop() || 'Build memo')} ↗</button>`
      : ''
    const card = j => {
      const tint = JOB_THEME.status[j.status]
      const drawn = jobCardSvg(CW - CARD_PAD * 2, b, j, runLines(runsOf(j, v.list), v.at), WORDS.card, { isBare: true, hasLink: Boolean(j.prUrl) })
      // The drawing leaves the PR to this line whenever there is a URL; one that isn't a GitHub PR gets no link, only its number.
      const pr = !j.prUrl ? '' : isGitHub(j.prUrl) ? `<a class="pr" data-k="pr" href="${esc(j.prUrl)}" target="_blank" rel="noopener">PR ${esc(j.pr ?? '')} ↗</a>` : j.pr ? `<span class="pr" data-k="pr">PR ${esc(j.pr)}</span>` : ''
      return `<div class="job" data-k="job-${esc(j.id)}" style="--tint:${tint}" title="${esc(`${labelOf(b, j)}: ${j.title}`)}"><div data-k="s">${inline(drawn.source, `job-${j.id}`)}</div>${pr}</div>`
    }
    const groups = GROUPS.map(g => ({ g, list: b.jobs.filter(j => j.status === g) })).filter(x => x.list.length)
    jobsCol = [
      `<div class="drawing" data-k="bh" title="${esc(`${b.name}: ${summaryLine(b)}${nn.now ? `. Now: ${nn.now}` : ''}`)}">${inline(header, 'bh')}</div>`,
      memo,
      ...groups.flatMap(({ g, list }) =>
        g === 'shipped'
          ? [`<button class="fold" data-k="h-shipped" data-fold="shipped">${WORDS.groups.shipped} · ${list.length}</button>`, `<div class="group" data-k="g-shipped" data-group="shipped">${list.map(card).join('')}</div>`]
          : [h3(`h-${g}`, `${WORDS.groups[g]} · ${list.length}`), `<div class="group" data-k="g-${g}">${list.map(card).join('')}</div>`],
      ),
    ].join('')
  }

  const agentsCol = [
    `<div class="drawing full" data-k="th">${inline(headerSvg(AW, '', v.totals, isWorking), 'th')}</div>`,
    `<div class="drawing compact" data-k="strip">${inline(compactSvg(AW, v.list, [], v.totals), 'strip')}</div>`,
    v.list.length === 0 ? `<p class="empty full" data-k="empty">No agents for this build yet.</p>` : '',
    v.running.length ? h3('h-run', `Running · ${v.running.length}`, 'full') : '',
    `<div class="group full" data-k="g-run">${v.running.map(a => agentCard(a, 'a-')).join('')}</div>`,
    v.finished.length ? `<button class="fold full" data-k="h-done" data-fold="done">Finished · ${v.finished.length}</button>` : '',
    `<div class="group full" data-k="g-done" data-group="done">${v.finished.map(a => agentCard(a, 'a-')).join('')}</div>`,
    v.outside.length ? h3('h-other', `Other chats · ${v.outside.length}`, 'outside') : '',
    opts.all ? `<div class="group outside" data-k="g-other">${v.outside.map(a => agentCard(a, 'o-', Math.min(v.at, opts.outsideAt ?? v.at))).join('')}</div>` : '',
  ].join('')

  return `<div class="cols${isWide ? ' wide' : ''}" data-k="cols" style="--cw:${CW}px">${b ? `<section class="col jobs" data-k="jobs">${jobsCol}</section>` : ''}<section class="col agents" data-k="agents">${agentsCol}</section></div>`
}
