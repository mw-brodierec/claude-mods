# claude-mods

Claude Code mods the Brodie growth team runs. Install once, then restart Claude Code.

```
/plugin marketplace add mw-brodierec/claude-mods
/plugin install skins@marc-mods
/plugin install savvy-progress@marc-mods
/plugin install savvy-flow@marc-mods
/plugin install blast-radius@marc-mods
```

Heads up is built into Claude Code, so there's nothing to install: run `/plugin`, find **you-should-know** in the built-in plugins, and enable it.

If you already installed the originals (`skins@hellosverre-mods`, `savvy-progress@claude-kit` or `savvy-flow@claude-kit`), disable them in `/plugin` so two copies don't draw at once.

| Mod | What you get |
| --- | --- |
| **skins** | The usage bar above the prompt: context, session and weekly dials (shorter labels in a narrow window, so the row never clips), a red **Compact** button, and an animated Clawd who shoots hoops while Claude works and, while it waits, takes a turn at one of fifteen trades: welder, lab scientist, navy general, pilot, judge, architect, astronaut, spacewalker, detective, engineer, chef, racer, pirate, golfer or coach. Based on [hellosverre/claude-skins](https://github.com/hellosverre/claude-skins) (MIT); our changes are in `skins-customizations.patch`. |
| **savvy-progress** | The progress bar and Agents panel for `/savvy-flow:savvy-flow`. Side sessions also show cost, tokens and time, and each row has an "Open chat" button. A multi-PR build gets a jobs view beside the agents: every job by status (running, waiting on something, planned, later, shipped), its PR and its live agents. Everything sits on frosted glass; the orchestrator is the coach and every agent a player in one of the 18 Coldest Winter jerseys. Based on [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) (MIT). |
| **savvy-flow** | The `/savvy-flow:savvy-flow` orchestrator and its five worker tiers. Our copy keeps a build's job list current for the jobs view, and starts mega builds with a short build memo. Based on [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) (MIT). |
| **blast-radius** | A safety net: before Claude runs `rm -rf`, `git reset --hard`, `git clean`, a force push or a migration, it shows what would be deleted or lost and waits for Proceed or Cancel. Unchanged from [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground) (Apache-2.0). |
| **Heads up** (built in) | Claude Code's own you-should-know plugin. |

Mods use an early-access Claude Code API, so a Claude Code update can break one. If a mod stops showing, run `/reload-plugins` or reinstall it.
