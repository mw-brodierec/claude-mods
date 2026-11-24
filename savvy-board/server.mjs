// The savvy board: a local page showing the current build and its agents live, with no Claude
// session needed. Reads ~/.claude/savvy-progress (written by every session running the mod) and
// savvy-progress/hooks/sessions.py; pushes the drawn board over Server-Sent Events.
//   node server.mjs            then open http://127.0.0.1:7447 (start-board.sh does both)
// Only 127.0.0.1, only this page's own requests.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { buildOptions, fleetRows, isBuild, mergeSessions, pickBuild, render, scope, sessionCalls, SVG_CSS, view, watchedScope } from './board.mjs'

const PORT = Number(process.env.SAVVY_BOARD_PORT || 7447)
const HOST = '127.0.0.1'
const ORIGIN = `http://${HOST}:${PORT}`
const ROOT = join(homedir(), '.claude/savvy-progress')
const SESSIONS_PY = new URL('../savvy-progress/hooks/sessions.py', import.meta.url).pathname
const PYTHON = existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3'
const TICK_MS = 1000
// sessions.py reads every chat's metadata (~0.4s a call): every 12s, never two at once.
const SESSIONS_MS = 12_000
// Each window hears from the server at least this often, so it can tell live from stuck.
const HEARTBEAT_MS = 5000

const readDir = dir => {
  try {
    return readdirSync(dir)
      .filter(n => n.endsWith('.json'))
      .flatMap(name => {
        try {
          return [{ name, data: JSON.parse(readFileSync(join(dir, name), 'utf8')) }]
        } catch {
          return [] // mid-write: read it next tick
        }
      })
  } catch {
    return []
  }
}

// Agent files untouched for longer than the fleet window can't hold a row worth showing: skip them unread.
const freshFiles = (dir, at) => {
  try {
    return readdirSync(dir).filter(n => n.endsWith('.json') && at - statSync(join(dir, n)).mtimeMs < 12 * 3600_000)
  } catch {
    return []
  }
}

let builds = []
let side = []
let scanning = false
let lastScan = 0
// When a scan last came back whole: the page turns yellow when this grows old.
let lastScanOk = 0

const py = args =>
  new Promise(resolve =>
    execFile(PYTHON, ['-I', SESSIONS_PY, ...args], { timeout: 20_000, maxBuffer: 16 << 20 }, (err, out) => {
      try {
        resolve(err ? null : JSON.parse(out))
      } catch {
        resolve(null)
      }
    }),
  )

async function scanSessions() {
  if (scanning) return
  scanning = true
  lastScan = Date.now()
  try {
    const lists = []
    const watching = new Set([...clients].map(c => c.build).filter(Boolean))
    for (const args of sessionCalls(watchedScope(builds, watching))) lists.push(await py(args))
    // A failed call keeps the last read rather than blanking the board.
    if (lists.every(Boolean)) {
      side = mergeSessions(lists)
      lastScanOk = Date.now()
    }
  } finally {
    scanning = false
  }
}

const clients = new Set()

const status = () => `event: status\ndata: ${JSON.stringify({ at: Date.now(), scanOkAt: lastScanOk, scanning })}\n\n`

// The build a window shows: the one it picked, else the newest unfinished (Auto).
const buildFor = c => builds.find(b => b.id === c.build) ?? pickBuild(builds)

function tick() {
  const at = Date.now()
  builds = readDir(join(ROOT, 'builds')).map(f => f.data).filter(isBuild)
  const agentsDir = join(ROOT, 'agents')
  const files = freshFiles(agentsDir, at).flatMap(name => {
    try {
      return [{ name, data: JSON.parse(readFileSync(join(agentsDir, name), 'utf8')) }]
    } catch {
      return []
    }
  })
  const fleet = fleetRows(files, at)
  const views = new Map()
  const options = buildOptions(builds)
  const auto = pickBuild(builds)?.id ?? ''
  for (const c of clients) {
    const b = buildFor(c)
    const key = b?.id ?? ''
    if (!views.has(key)) views.set(key, view(b, scope(b, side, fleet), at))
    const v = views.get(key)
    const msg = JSON.stringify({ html: render(v, c.width, { all: c.all, outsideAt: lastScan }), outside: v.outside.length, title: b ? b.name : 'Agents', builds: options, current: key, auto })
    if (msg === c.last) continue
    c.last = msg
    c.res.write(`data: ${msg}\n\n`)
  }
  if (at - lastScan > SESSIONS_MS) void scanSessions()
}

const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8').replace('/*SVG_CSS*/', SVG_CSS)

const open = target => execFile('/usr/bin/open', [target], () => {})

const server = createServer((req, res) => {
  // A page on any other site can reach 127.0.0.1 too: answer only requests addressed to the board,
  // and take actions only from the board's own page.
  if (req.headers.host !== `${HOST}:${PORT}`) return void res.writeHead(403).end()
  const url = new URL(req.url ?? '/', ORIGIN)
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return void res.end(page)
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    const pick = url.searchParams.get('build') ?? ''
    const c = { res, width: Math.max(240, Math.min(1600, Number(url.searchParams.get('w')) || 400)), all: url.searchParams.get('all') === '1', build: /^[\w-]{1,80}$/.test(pick) ? pick : '', last: '' }
    clients.add(c)
    req.on('close', () => clients.delete(c))
    res.write(status())
    return void tick()
  }
  if (req.method === 'POST' && req.headers.origin === ORIGIN) {
    const id = url.searchParams.get('id') ?? ''
    if (url.pathname === '/open' && /^local_[\w-]+$/.test(id)) {
      open(`claude://claude.ai/epitaxy/${id}`)
      return void res.writeHead(204).end()
    }
    // The memo is a known build's own path, picked by the build's id, never a path the page sends.
    const memo = builds.find(b => b.id === url.searchParams.get('build'))?.memo
    if (url.pathname === '/memo' && memo?.startsWith('/') && existsSync(memo)) {
      open(memo)
      return void res.writeHead(204).end()
    }
    if (url.pathname === '/refresh') {
      lastScan = 0
      void scanSessions().then(tick)
      for (const c of clients) c.last = ''
      return void res.writeHead(204).end()
    }
  }
  res.writeHead(404).end()
})

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is taken: the board is probably running already.` : e)
  process.exit(1)
})
server.listen(PORT, HOST, () => {
  console.log(`savvy board on ${ORIGIN}`)
  // Where the board lives, for the savvy-progress band's 🔍 and ↻ (they open this window, not the pane).
  try {
    writeFileSync(join(ROOT, 'board.json'), JSON.stringify({ url: ORIGIN, start: new URL('./start-board.sh', import.meta.url).pathname }) + '\n')
  } catch {
    // No ~/.claude/savvy-progress yet: the band keeps opening its pane.
  }
  setInterval(() => {
    for (const c of clients) c.res.write(status())
  }, HEARTBEAT_MS)
  tick() // finds the build first, so the first scan names its sessions
  void scanSessions().then(tick)
  setInterval(tick, TICK_MS)
})
