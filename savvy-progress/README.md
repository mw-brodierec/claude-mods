# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (`/agents-info` toggles it): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk (Marc's copy: and dribble; see the team below). `prefers-reduced-motion` stops them.

- **Glass and the team** (Marc's copy): every row, tile and card sits on frosted glass with its colour glowing through (`GLASS` in `hooks/glass.ts` restyles it, light and dark). The orchestrator is the coach (cap, polo, whistle, clipboard), beside the flow's name and the build's, at the head of the compact strip and in the band; he taps the clipboard while the team works. Every agent is a player in a Brodie jersey with a number and a look of its own, dribbling while it works: the savvy tiers keep their colours, side sessions wear the away kit, reviewers are the veteran with the towel, planners the point guard, the rest the bench. Kits live in `KITS` in `hooks/register.tsx`.
- **Build jobs** (Marc's copy): for work that ships as several PRs, the orchestrator keeps a job list through the `jobs` tool. The panel shows it beside the agents once it is wide enough (below the jobs when narrow): a summary line, four counts, a bar by status, then a card per job grouped Running / Waiting on something / Planned / Later / Shipped, each with its detail, what it waits on, its PR link, the day it last changed and its live agents. The band above the prompt shows jobs shipped out of all. Each build is a JSON file in `~/.claude/savvy-progress/builds/`, so any session (a resumed orchestrator, a side session) reads the same list, and a new session in the build's project picks it up. To restyle the view, edit `JOB_THEME` and `JOB_CSS` in `hooks/jobs.ts`.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks.
- `mcp__savvy-progress__jobs`: the orchestrator reports a build's jobs (upsert by id; it answers with the whole list).
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill.

## Settings

`language`: `auto` (default), `en` or `ru`. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

Install instructions are in the [repository README](../../README.md).
