# savvy-progress

A Claude Code mod: a progress bar above the prompt, and the data behind the savvy board window (`../savvy-board`), which shows the subagents live. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, a 🔍 button with the crew size that opens the savvy board, and ↻, which re-reads everything and has the board re-read too. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **No pane** (Marc, Nov 23 2026): the Agents pane and `/agents-info` are gone; the savvy board replaced them. The mod still saves every session's agent rows to `~/.claude/savvy-progress/agents/<cli id>.json` (a 15s heartbeat while one runs), and the board draws them. The crabs and jerseys now live in the board's `pane.ts`.
- **Build jobs** (Marc's copy): for work that ships as several PRs, the orchestrator keeps a job list through the `jobs` tool. The band above the prompt shows jobs shipped out of all, and the savvy board window (`../savvy-board`) draws the full job list. Each build is a JSON file in `~/.claude/savvy-progress/builds/`, so any session (a resumed orchestrator, a side session) reads the same list, and a new session in the build's project picks it up. The board's job cards are styled by `JOB_THEME` and `JOB_CSS` in `hooks/jobs.ts`.

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
