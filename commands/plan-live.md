---
description: Open a markdown plan as a live, two-way HTML review page
argument-hint: "[plan.md] [--theme aurora|editorial|blueprint] [--mode auto|light|dark]"
---

Open a plan in plan-live. Arguments: $ARGUMENTS

1. Resolve the plan file. If the arguments name a `.md` file, use it. Otherwise run `ls -t docs/superpowers/plans/*.md` and take the first result. If there is none, ask the user which file to open and stop.
2. Always put the plan path in single quotes (and write a literal single quote inside it as `'\''`), never double quotes: a filename can contain `$(…)` or backticks. Start the server with the Bash tool and `run_in_background: true`:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-live.mjs" serve '<plan>' --open` followed by any `--theme`/`--mode` flags from the arguments.
3. Start the watcher with the Bash tool and `run_in_background: true`:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-live.mjs" watch '<plan>'`
4. Read the server's first output line (JSON with `url`). Tell the user, in one line, the URL and that their comments reach you when they press Apply.

When the watcher exits with a review batch, follow the `plan-live` skill.
