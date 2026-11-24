# savvy board

The savvy-progress build and agents view as a small always-on window on the Mac desktop, apart from any Claude session. A mod's pane lives and dies with one session's process; this board reads the same files every session already writes, so it keeps going through reloads, restarts and closed chats.

- **What it shows**: the newest unfinished build (header with Now/Next, the four tiles, the saber bar, a card per job with its PR link), then the build's agents and side sessions with cost, tokens and time ticking live. Other chats sit behind **◎ All** and never count in the totals.
- **Where the data comes from**: `~/.claude/savvy-progress/builds/*.json`, `~/.claude/savvy-progress/agents/*.json` (a "running" row whose file stops its heartbeat for 60s shows finished), and `savvy-progress/hooks/sessions.py --live` every 12s.
- **The look** is the mod's own drawings: `jobs.ts` and `glass.ts` are imported as they are; the pane's crabs, agent cards and totals header are ported in `pane.ts` (keep it in step with `register.tsx`). Hover glow, glimmer and the cards' glass are CSS in `page.html`.

## Run it

```bash
savvy-board/start-board.sh
```

This starts the server on `http://127.0.0.1:7447` if it isn't running and opens a 420×900 Chrome app window in the top-right corner (its own Chrome profile, so your browser is untouched). Pass a width and height to change the size.

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
