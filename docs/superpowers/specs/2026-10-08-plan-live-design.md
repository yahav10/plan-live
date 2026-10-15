# plan-live — Design

**Date:** 2026-10-08 · **Status:** approved in brainstorming, awaiting spec review
**Visual reference:** [`docs/mockups/plan-view.html`](../../mockups/plan-view.html) (approved layout, 3 themes × light/dark)

## 1. Goal

A Claude Code plugin that turns an existing markdown plan into a **live, interactive HTML view**:

- The page re-renders the moment Claude edits the plan.
- The user comments on sections, tasks or selected text, presses **Apply**, and Claude is woken to act on the batch.
- Claude's resulting edits come back as per-comment diffs the user **accepts or rejects**.
- Architecture and dependencies are rendered visually, in a polished, themeable UI, not as raw markdown.

**Success criteria**

1. `/plan-live docs/superpowers/plans/X.md` opens a styled view of any of the three existing plan formats without the plan being modified.
2. A Claude edit to `X.md` is visible in the open page within 1 second, with no manual reload.
3. Comment → Apply → Claude acts on it with no typing in the terminal (the watcher path).
4. Every Claude revision made for a batch is shown as a diff linked to its comment, and Reject restores that hunk in `X.md`.
5. All 6 theme/mode combinations pass WCAG AA text contrast.

## 2. Decisions (from brainstorming, 2026-10-08)

| # | Decision | Consequence |
|---|---|---|
| D1 | Packaged plugin (`plugin.json`, marketplace-installable), not a live mod | Ships skill + command + hooks + Node server |
| D2 | Two-way: comments and suggestions flow to Claude; revisions flow back as accept/reject diffs | Needs a feedback channel and a wake mechanism |
| D3 | Local only: one user, `127.0.0.1` | No auth beyond a session key, no publishing in v1 |
| D4 | **`.md` stays the source of truth** (rejected plan-it's HTML+JSON-canonical model) | superpowers/paul plan flows unchanged; review state lives in a sidecar file |
| D5 | Comments are **batched**: drafts until one Apply | One wake per batch, not per comment |
| D6 | Three themes (Aurora, Editorial, Blueprint), each with light and dark; user picks; default Aurora + Auto | Token-driven CSS; one markup for all themes |
| D7 | Compact chrome: one sticky strip (live dot + age, section tabs with progress underline, theme dot-menu, mode icon); no section sidebar; file path as a muted line under the title | Matches the approved mockup v3 |
| D8 | Repo at `~/Documents/personal-apps/plan-live` | Personal tool; publishable later |

**Prior art reviewed:** [OthmanAdi/plan-it](https://github.com/OthmanAdi/plan-it). Borrowed: embedded-state-plus-renderer pattern, per-phase approve/reject, Stop-hook gate, offline single-bundle UI, the approaches/module-map visual ideas. Not borrowed: HTML as the source of truth, file:// with a manual Save button, no live reload, PreToolUse injection on every Read/Grep (token cost), SHA-256 attestation, 17-IDE mirrors.

## 3. Architecture

```
plan-live/
├─ .claude-plugin/
│  ├─ plugin.json
│  └─ marketplace.json
├─ commands/plan-live.md          # /plan-live <file> [--theme t] [--mode m]
├─ skills/plan-live/SKILL.md      # how Claude handles a review batch
├─ hooks/hooks.json               # UserPromptSubmit, Stop
├─ bin/plan-live.mjs              # CLI: serve | watch | resolve | status | stop
├─ server/
│  ├─ serve.mjs                   # HTTP + SSE + file watching
│  ├─ parse.mjs                   # md → PlanModel (pure)
│  ├─ diff.mjs                    # line diff + hunk revert (pure, zero-dep)
│  ├─ review-store.mjs            # sole owner of <plan>.review.json
│  └─ registry.mjs                # running-server lookup in ~/.claude/plan-live/servers/
├─ ui/
│  ├─ index.html, app.js
│  ├─ components/                 # strip, hero, section-card, task-list, table, graph, review-rail, diff-card
│  ├─ themes/{aurora,editorial,blueprint}.css
│  └─ vendor/                     # mermaid.min.js, woff2 fonts (Inter, JetBrains Mono, Fraunces, Source Serif 4, Space Grotesk, IBM Plex Mono)
└─ test/
```

Runtime: **Node ≥ 20, zero npm runtime dependencies.** Dev-only: Playwright for UI tests.

### 3.1 Units and contracts

**`parse.mjs`**: `parse(markdown: string) → PlanModel`, pure.

```
PlanModel {
  title, meta: { eyebrow, fields[] }           // H1 split at its last " — "; fields = preamble `**Label:** value` paragraphs
  preamble: Block[]                            // blocks before the first section
  sections: Section[]                          // one per ## heading, plus every ### heading that starts "Task N" / "TN"
  tasks: Task[]                                // flat list of every checkbox item
  graph: { nodes: TaskRef[], edges: [from, to][] }
  progress: { done, total }
}
Section { id, heading, short, line, endLine, level, blocks: Block[], progress: { done, total }, node? }
Block = paragraph | heading | list | table | code | mermaid | approaches | architecture   // list items may carry a task
Task  { id, sectionId, text, checked, line, hash }   // hash = sha1(line)[0..12], echoed back on toggle
```

- **Section id** = slug of the heading path (`h2` + `h3`). **Task id** = section id + slug of the first 6 words + occurrence index.
- **Short label** (strip tab) = the first meaningful word of the heading, or an explicit `<!-- short: Graph -->` override.
- Parsing is **fence-aware**: `#`, `- [ ]` and `|` lines inside ``` / ~~~ fences are code, never headings, tasks or tables.
- **Graph nodes** are the `Task N` / `TN` sections. **Graph edges** come from a node's own text (code fences excluded) matching `depends on (Task|T)\s?\d+`, `after (Task|T)\d+`, `blocked (on|by) (Task|T)\d+`, and from a ` ```mermaid ` block if present (rendered as-is, not merged).
- **Opt-in fenced blocks:**
  - ` ```approaches `: YAML-ish list of `{ name, pros[], cons[], effort }`, rendered as side-by-side cards.
  - ` ```architecture `: lines of `A -> B : label`, rendered as an interactive node diagram (pan, zoom, click-to-highlight).
  - Unknown fences render as code.

**`review-store.mjs`**: the only writer of `<plan>.review.json`, which sits beside the plan.

```
{ version: 1,
  comments:  [{ id, anchor: { sectionId, taskId?, quote? }, kind: "comment"|"suggestion",
                body, replacement?, status: "draft"|"queued"|"resolved"|"declined", orphaned: boolean,
                resolution?: { note, at } }],
  batches:   [{ id, commentIds[], status: "pending"|"picked"|"done", snapshot, createdAt }],
  revisions: [{ id, batchId, commentId?, hunk, status: "proposed"|"accepted"|"rejected"|"conflict" }] }
```

- Writes are atomic: write to a temp file, then rename.
- An unparsable file is renamed to `.review.json.bak-<ts>` and a fresh one is started; the UI shows a one-line notice.
- **Re-anchoring:** after every plan change, comments whose `sectionId`/`taskId` vanished are re-matched by `quote` (exact, then whitespace-normalised). If unmatched they get `orphaned: true`; they stay visible in the rail and are never silently dropped.

**`serve.mjs`**: started by `plan-live serve <file>`.

- Binds `127.0.0.1` on a random port, with a 32-byte session key required on every request (query param once, then a cookie).
- Registers itself in `~/.claude/plan-live/servers/<sha1(abs path)>.json` as `{ pid, port, key, plan }`.
- One server per plan; a second `serve` for the same plan reuses the running one.
- Watches `X.md` and `X.review.json` (`fs.watch` with 100 ms debounce) and pushes `plan` / `review` events over SSE.

**HTTP API** (all JSON, all keyed):

| Method | Path | Effect |
|---|---|---|
| GET | `/api/plan` | `PlanModel` + `fileHash` |
| GET | `/api/review` | review.json contents |
| GET | `/events` | SSE stream |
| POST | `/api/comments` | create a draft |
| PATCH/DELETE | `/api/comments/:id` | edit or delete a draft |
| POST | `/api/apply` | drafts → new pending batch; snapshot the current `X.md` |
| GET | `/api/wait` | long-poll; resolves when a pending batch exists, and marks it `picked` |
| POST | `/api/resolve` | `{ commentId, status: resolved\|declined, note }` |
| POST | `/api/revisions/:id` | `{ action: accept\|reject }` |
| POST | `/api/tasks/:id/toggle` | `{ lineHash }` → flips `[ ]`/`[x]` on that line |
| GET | `/api/status` | `{ watcherConnected, pendingBatches, unresolvedInPicked }` |

**`diff.mjs`**: LCS line diff (common prefix/suffix trimmed first) between a batch's `snapshot` and the current file, producing hunks. `revert(current, hunk)` applies the inverse hunk only if the hunk's post-image still matches the file exactly; otherwise it returns `conflict`.

**`bin/plan-live.mjs`**:
- `serve <file> [--open] [--theme] [--mode]`
- `watch <file>`: long-polls `/api/wait`, prints the batch, exits 0. Exits 3 if the server is gone.
- `resolve <file> <commentId> --status resolved|declined --note "…"`
- `status <file>`
- `stop <file>`

### 3.2 Who writes `X.md`

| Writer | When | Safety |
|---|---|---|
| Claude (Edit/Write) | Always, as today | — |
| Server | Checkbox toggle | Rejected with 409 if the target line's hash changed since the page loaded; the UI reloads |
| Server | Revision Reject | Only via `diff.revert`; a mismatch marks the revision `conflict` and leaves the file untouched |

Nothing else writes the plan. The server never rewrites whole files; it changes only the targeted lines.

## 4. The review loop

1. **Comment.** Click a section, task or graph node, or select text, then press `C`. A comment is free text. A suggestion carries replacement text for the selected quote. Both are saved as `draft`.
2. **Apply.** `POST /api/apply`: all drafts become `queued` in a new `pending` batch with a snapshot of `X.md`. The button reads `Apply N comments → Claude`.
3. **Wake.**
   - `/plan-live` starts `plan-live watch <file>` as a **background Bash task**.
   - The watcher's `/api/wait` resolves, it prints the batch (anchors, quotes, bodies, suggestions) and exits.
   - Claude Code re-invokes Claude on the background task's exit, so no user typing is needed.
   - *Fallback:* the `UserPromptSubmit` hook calls `status`; if a batch is `pending` and no watcher is connected, it injects the batch into the prompt context and marks it `picked`.
4. **Revise.** The skill instructs Claude, for each comment in the batch:
   - edit `X.md` as needed, or decide to decline;
   - run `plan-live resolve … --status resolved|declined --note "<one line>"`;
   - when every comment is resolved, restart the watcher (background) and give a one-line summary in chat.
   - Suggestions: apply the replacement verbatim unless it is wrong, in which case decline with the reason.
5. **Review.**
   - When a batch reaches `done` (all its comments resolved), the server diffs `snapshot` against the current `X.md` and records each hunk as a `proposed` revision.
   - A hunk is linked to the comment whose anchor lies in its range. A hunk with no matching anchor shows as an "other change in this batch" revision.
   - The rail shows each one as a diff card. **Accept** marks it `accepted`; **Reject** calls `diff.revert`.
   - Rejected revisions are reported to Claude by the `UserPromptSubmit` hook (or the next watcher batch) as "user rejected change X for comment Y — do not re-apply".
6. **Stop guard.** The `Stop` hook queries `status`. If `unresolvedInPicked > 0` and `stop_hook_active` is false, it blocks with a reason listing the unresolved comment ids. It never blocks twice in a row.

## 5. UI

Layout per the approved mockup (`docs/mockups/plan-view.html`):

- **Sticky strip:**
  - `● 4s` live indicator (tooltip: "Updated 4s ago by Claude/you"; turns grey and reads "offline" when SSE drops);
  - section tabs with one-word labels and a progress underline (green = done, partial = active, grey = untouched), scrolling horizontally;
  - theme menu (colour dot + name; name hidden under 1100 px);
  - mode icon cycling ◐ auto → ☀ light → ☾ dark.
- **Hero:** progress ring, eyebrow (H1 text after its last " — "), display title, status chips (one per preamble `**Label:**` field, linked when the value has a URL, plus the pending-comment count), then the muted `↳ filename` line (full path on hover).
- **Main column:** one card per section. Tasks become a checklist with done/doing/todo states. Tables become hover-able tables. Mermaid, `architecture` and `approaches` blocks render visually. The dependency graph card appears when edges exist; the active task's incoming edge is animated.
- **Review rail** (right; stacks below under 1100 px): drafts, the Apply button, then "Claude revised" diff cards with Accept/Reject, then resolved and orphaned comments, collapsed.
- **Change highlight:** after an SSE `plan` event, changed blocks pulse once in the accent colour (respects `prefers-reduced-motion`).
- **Keyboard:** `C` comment, `⏎` apply, `J`/`K` next/previous section, `T` cycle theme, `D` cycle mode.

### 5.1 Theming

- Each theme is one CSS file defining about 30 tokens (`--bg --card --ink --ink-2 --muted --line --accent --ok --warn --note --font-* --r …`) in a base (native) mode block plus an opposite-mode block. Aurora and Blueprint are dark-native; Editorial is light-native.
- Signature touches are small and per-theme: Aurora's gradient glow, gradient title and glowing active node; Editorial's § marks, italic serif title and sticky-note comments; Blueprint's grid paper, corner ticks, dashed pending nodes and uppercase headings.
- **Choice order:** URL `?theme=&mode=`, then `localStorage`, then `--theme/--mode` flags, then `~/.claude/plan-live.json` `{ theme, mode }`, then the default `aurora` + `auto`.
- Auto mode follows `prefers-color-scheme` and switches live.
- Fonts are bundled as woff2; no network calls at runtime.

## 6. Plugin wiring

- **`commands/plan-live.md`:** resolve the plan path (argument, else the newest `docs/superpowers/plans/*.md`, else ask); run `plan-live serve <file> --open` in the background; run `plan-live watch <file>` in the background; print the URL.
- **`skills/plan-live/SKILL.md`:** triggered when a batch arrives from the watcher or the hook. Holds the exact procedure from §4 step 4 and states that `X.review.json` is never edited by hand.
- **`hooks/hooks.json`:**
  - `UserPromptSubmit` → `plan-live hook prompt`. Silent unless there is a pending batch with no watcher, or rejected revisions not yet reported.
  - `Stop` → `plan-live hook stop`.
  - Both hooks exit 0 in under 200 ms when no plan-live server is registered for the cwd tree. No `PreToolUse` hook.
- **`.gitignore` advice:** printed once on first serve: `*.review.json` is personal state; commit it only if you want the review history.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Server not running | Page shows "offline" and retries SSE with backoff; hooks are silent |
| Plan file deleted or renamed | SSE `gone` event; the page shows the last render greyed with a notice; the server exits after 60 s |
| Malformed markdown | Parser never throws; unknown constructs render as plain markdown blocks |
| Bad `approaches`/`architecture` block | That block renders as code with an inline "couldn't parse" note |
| Checkbox toggle against a stale line | 409, toast "Plan changed — refreshed", re-render |
| Reject conflict | Revision marked `conflict`; reported to Claude as needing a manual revert |
| Corrupt review.json | Backup plus fresh file, with a notice |
| Port in use / registry stale | Registry entries with a dead pid are pruned on read |

## 8. Testing

Node's built-in `node:test` for units; Playwright for UI.

| Area | Cases |
|---|---|
| `parse.mjs` | Synthetic fixtures mirroring real plan shapes (superpowers checkbox, free-form tables) committed in `test/fixtures/`; real-world plans kept only in gitignored `test/fixtures/private/` (tests skip when absent); ids stable across reorder and insert; rename re-anchors by quote; graph edges from reference phrases; custom fences; never throws on fuzzed input |
| `diff.mjs` | Hunks for insert/delete/modify; revert succeeds on untouched hunks, conflicts on edited ones |
| `review-store.mjs` | Full status lifecycle; atomic write; corrupt-file recovery; orphaning |
| Server API | Session key enforced; toggle 409 on a stale hash; `/api/wait` resolves on Apply, not on drafts; `watcherConnected` accurate |
| CLI + hooks | `watch` exits 0 on a batch and 3 on server loss; prompt hook injects only without a watcher; stop hook blocks once and honours `stop_hook_active`; both silent and fast with no server |
| UI (Playwright) | Fixture plan → comment → Apply → simulated Claude edit + resolve → diff card → Accept and Reject paths; live update within 1 s; strip tabs scroll and highlight; 6 theme/mode visual snapshots; computed-colour AA contrast check for every token pair used for text |

## 9. Publishing

Shipped from a fresh single-commit history (development history stays local), with MIT `LICENSE`, `THIRD_PARTY_NOTICES.md` and bundled font/Mermaid licences, after a tracked-file scan for internal company content. Installed via `/plugin marketplace add <owner>/plan-live`.

## 10. Out of scope (v1)

Sharing or publishing (claude.ai Artifact), multi-user comments, inline editing of plan text in the page, non-markdown plans, auto-generated architecture diagrams from file paths, a VS Code webview.

## 11. Harness probe results (2026-10-09, `claude --version` = 2.1.295 (Claude Code))

| Check | Desktop Code tab | Terminal CLI |
|---|---|---|
| A: `${CLAUDE_PLUGIN_ROOT}` in command | pass | not run |
| B: background exit wakes Claude | pass | not run |
| C: SessionStart context | not needed (A passed) | not run |

Decision: A pass, B pass. Tasks 1-15 proceed as written; the SessionStart fallback is not applied.
