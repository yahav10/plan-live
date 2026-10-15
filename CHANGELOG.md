# Changelog

All notable changes to plan-live. Versions follow [semver](https://semver.org).

## 0.3.1

- Task sections are labelled `T1`, `T2`… in the pill, the jump panel and the spine, matching the dependency graph. The filter also matches the full heading, so `task` and `t2` both work.
- New demo GIF and a jump panel screenshot in the README.

## 0.3.0

- The row of numbered section tabs is replaced by one section pill: it names the section you are in, shows a ring that fills as you scroll, and slides its title when you cross into a new section.
- Click the pill or press `Ctrl`/`⌘` + `K` for a jump panel with a filter. Arrow keys and `Enter` jump, `Esc` closes. The panel keeps its filter when the plan changes underneath it.
- Optional **Reading spine** along the left edge, one tick per section, remembered between sessions.
- Fixed: jumping to the last section left the indicator on the previous one.
- Short labels for numbered headings (`1. Goal`) read `1 Goal` in review notes.

## 0.2.2

- Section tabs in the top bar show the number and name for numbered headings (`1 Goal`, `10 Rollout`) instead of a bare number.

## 0.2.1

Security release. Upgrading is recommended.

- Plan paths in the `resolve` and `watch` commands are single-quoted, so a filename containing `$(…)` or backticks cannot expand when Claude runs the command.
- Every response carries a strict Content-Security-Policy, `Referrer-Policy: no-referrer`, `nosniff` and frame denial. Exported HTML carries its own CSP.
- The session key is removed from the address bar after the page loads. Other URL parameters such as `theme` and `mode` are kept.
- Bundled Mermaid upgraded from 11.4.1 to 12.2.0, which clears all `npm audit` advisories.
- External links in plans now use `rel="noopener noreferrer"`.

## 0.2.0

- Motion: smooth scrolling, staggered entrance, progress ring and strip underlines that sweep, checkbox pop, comments that slide in, theme cross-fade, per-theme flair. All of it is disabled under reduced motion.
- Export menu: Markdown, standalone HTML, PDF via print, copy as Markdown, plan model JSON, tasks CSV, review notes (Markdown and JSON), and SVG or PNG for every diagram.
- Fixed the dependency graph glow being clipped at the edge of the SVG.
- Fixed a graph with cyclic edges producing an empty column and a `NaN` size.
- Mermaid labels are plain SVG so diagrams can be exported as PNG.
- README rewritten, with a demo animation and a bundled example plan.

## 0.1.1

- Lockfile committed; manifest versions aligned.

## 0.1.0

First release. Live HTML view of markdown plans, comment and Apply review loop with accept and reject, three themes in light and dark.
