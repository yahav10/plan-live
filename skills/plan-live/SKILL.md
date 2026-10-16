---
name: plan-live
description: Use when a background plan-live watcher exits printing "plan-live review batch", when prompt context contains a plan-live review batch or plan-live review outcomes, or when the user asks to open a plan as a live page.
---

# plan-live review batches

The user commented on a plan in the live page and pressed Apply. The batch text lists each comment with its id, anchor, quoted text and, for suggestions, the replacement.

## Procedure

1. Read only what the comments need. Each comment has a `context: lines A-B` line and the batch header has a plan outline. Read those lines with the Read tool (`offset` and `limit`), not the whole plan. Read the whole plan when a comment affects other sections, when its context says `not found`, or when the batch has no context lines.
   Line numbers are as of when Apply was pressed. They shift after you edit, so re-read the range (or search for the quoted text) before each edit.
2. For each comment, in order:
   - **comment**: make the change it asks for in the `.md` with Edit, or decide it is wrong.
   - **suggestion**: replace the quoted text with the replacement exactly, unless that would make the plan wrong.
   - Then run the resolve command printed in the batch, with `--status resolved` and a one-line `--note` saying what changed, or `--status declined` and a one-line reason. Every comment must end resolved or declined.
3. Edit only the plan `.md`. Never edit `*.review.json`: the plan-live server owns it.
4. After the last resolve, restart the watcher in the background (Bash, `run_in_background: true`) with the watch command printed in the batch.
5. Reply in chat with one line: how many comments were resolved and declined, and that the diffs are on the page to accept or reject.

## Review outcomes

When context contains "plan-live: review outcomes":
- "rejected your change … do not re-apply it": the server already reverted it. Leave it reverted.
- "could not undo …": revert that change by hand in the `.md`, then tell the user it is done.

## Opening a plan

If the user asks to open or view a plan live, run the `/plan-live` command steps: start `serve` and `watch` in the background and give the URL.
