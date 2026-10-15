# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub:
[Report a vulnerability](https://github.com/yahav10/plan-live/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get a reply within a few days. Please give a reasonable time to fix the problem before you disclose it.

## Supported versions

Only the latest release receives fixes.

## Threat model

plan-live is a local tool. It starts an HTTP server on `127.0.0.1` on a random port, serves a browser UI for one markdown plan, and writes to that plan only for checkbox toggles and rejected changes.

What it defends against:

- **Other web pages and other hosts.** Every request needs a random per-session key, and requests with a foreign `Host` or `Origin` are refused.
- **Malicious plan or comment text.** Text is escaped before it is rendered, Mermaid runs in strict mode, and responses carry a strict Content-Security-Policy.
- **Path traversal.** Static files are served only from the plugin's `ui/` folder.
- **Shell injection through a plan filename.** The plan path in the commands Claude is asked to run is single-quoted.

What is out of scope:

- An attacker who already runs code as you on your machine, or who can read your Claude Code session.
- Text you write in a comment. It is passed to Claude as your instruction, on purpose.
- Plans you open from a source you don't trust: treat the plan like any other file Claude reads.

The session key lives in the registry file `~/.claude/plan-live/servers/*.json` (readable only by you) and is removed from the address bar after the page loads.
