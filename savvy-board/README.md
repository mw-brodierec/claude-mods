# savvy board

The savvy-progress build and agents view as a small always-on Mac app, **Savvy Flow** (its own Dock tile with Clawd; no Chrome), apart from any Claude session. A mod's pane lives and dies with one session's process; this board reads the same files every session already writes, so it keeps going through reloads, restarts and closed chats.

- **What it shows**: the newest unfinished build (header with Now/Next, the four tiles, the saber bar, a card per job with its PR link), then the build's agents and side sessions with cost, tokens and time ticking live. Other chats sit behind **◎ All** and never count in the totals.
- **Where the data comes from**: `~/.claude/savvy-progress/builds/*.json`, `~/.claude/savvy-progress/agents/*.json` (a "running" row whose file stops its heartbeat for 60s shows finished), and `savvy-progress/hooks/sessions.py --live` every 12s.
- **Which build**: the **Watching** menu lists every build by the name its orchestrator gave it in the `jobs` tool, with jobs shipped and the day it last moved; unfinished first, finished ones marked ✓. **Auto** (the default) follows the newest unfinished build, so a new build shows up by itself; pick one to pin this window to it.
- **Status light** (top right): green **Live**; yellow **Reconnecting**, **Starting** or **Sessions stale** (sessions.py hasn't answered for 45s; jobs and agents still update); red **Offline** or **No signal**. Hover it for the detail.
- **From the chat band**: savvy-progress's 🔍 and ↻ open this window (↻ also makes it re-read everything) once the board's server has run, since it notes where it lives in `~/.claude/savvy-progress/board.json`. Without that note they open the old pane.
- **The look** is the mod's own drawings: `jobs.ts` and `glass.ts` are imported as they are; the pane's crabs, agent cards and totals header are ported in `pane.ts` (keep it in step with `register.tsx`). Hover glow, glimmer and the cards' glass are CSS in `page.html`.

## Run it

```bash
savvy-board/start-board.sh
```

This starts the server on `http://127.0.0.1:7447` if it isn't running and opens `~/Applications/Savvy Flow.app` (a WebKit window, 420×900 in the top-right corner the first time, then wherever you left it). macOS keeps one copy: running it again brings the window forward, and closing the window quits the app.

The app is built from `app/` on first use, or by hand after changing `app/SavvyFlow.swift` or `app/icon.svg` (needs the Command Line Tools' `swiftc`):

```bash
savvy-board/app/build-app.sh
```

It used to be a Chrome `--app` window with its own profile. Each launch was a separate Chrome process, so the Dock's recent-apps section filled with extra Google Chrome tiles.

To keep the server running across logins (a user LaunchAgent, no sudo):

```bash
savvy-board/install-agent.sh
```

`install-agent.sh --remove` takes it out again. Logs go to `~/Library/Logs/savvy-board.log`.

## Test

```bash
cd savvy-board && node --test
```

Needs Node 22.18+ (type stripping, `module.registerHooks`) and no dependencies.
