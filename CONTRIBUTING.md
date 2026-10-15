# Contributing to plan-live

Thanks for helping. Bug reports, small fixes and focused features are all welcome.

## Set up

You need Node 20 or newer.

```
git clone https://github.com/yahav10/plan-live && cd plan-live
npm install
npx playwright install chromium   # browser tests only
npm run vendor                    # copies fonts and Mermaid into ui/vendor
npm test                          # unit tests
npm run test:e2e                  # browser tests
```

Try your checkout inside Claude Code without publishing:

```
/plugin marketplace add /path/to/plan-live
/plugin install plan-live@plan-live
```

Open the bundled example with `/plan-live docs/examples/demo-plan.md`. It exercises every component.

## How the code is laid out

| Path | What lives there |
|---|---|
| `server/` | Local HTTP/SSE server, markdown parser, diff and revert, review store, batch formatting |
| `bin/plan-live.mjs` | CLI used by the slash command and the hooks |
| `hooks/`, `commands/`, `skills/` | The Claude Code plugin wiring |
| `ui/` | The browser UI: plain ES modules, no build step |
| `ui/themes/` | One CSS file per theme; every theme and mode defines the same tokens |
| `test/unit/`, `test/e2e/` | Node test runner and Playwright |
| `docs/superpowers/specs/` | Design decisions and the reasoning behind them |

The design rules worth knowing before you change anything:

- **The `.md` is the source of truth.** The server writes it only for checkbox toggles and for Reject, and it re-reads the file from disk right before every write.
- **No runtime dependencies.** `dependencies` stays empty. Build-time and test tooling goes in `devDependencies`.
- **Plan text is untrusted.** Anything that renders plan or comment text must escape it. Add a test with a hostile input when you add a render path.
- **Everything animated respects `prefers-reduced-motion`.**

## Making a change

1. Write the failing test first, and watch it fail for the right reason.
2. Make it pass with the smallest change.
3. Run `npm test` and `npm run test:e2e` before opening a pull request.
4. Keep the change focused. One concern per pull request.

If you add a theme colour, `test/unit/themes.test.mjs` checks that every text token passes WCAG AA (4.5:1) on both surfaces. Don't lower the threshold; adjust the colour.

### Screenshot baselines

The theme screenshot baselines in `test/e2e/themes.spec.mjs-snapshots/` are macOS renders (`*-darwin.png`). On Linux those tests have no baseline and will fail on a fresh checkout. Run them with `--update-snapshots` locally to check your own changes, and don't commit the resulting Linux files.

### README images

`npm run screenshots` regenerates the README images from `docs/examples/demo-plan.md`, and `npm run demo-gif` re-records the animation (it needs `ffmpeg`). Only regenerate them when the UI actually changed.

## Reporting bugs

Use the bug report template. The most useful report includes your OS, Node version, the theme and mode, and the smallest plan file that shows the problem. Please remove anything private from the plan before attaching it.

Security problems: please don't open a public issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contribution is licensed under the MIT licence of this project.
