# Mini Plan — rev 1 (2026-10-08)

**Ticket:** https://example.com/browse/MINI-1

**Repo:** plan-live

Intro paragraph with `code` and **bold**.

## Goals
- Ship the viewer
- Keep markdown canonical

### Task 1: Parser
- [x] Write the failing test
- [ ] Implement parse

### Task 2: Server
Depends on Task 1.
- [ ] Serve the model

### Task 3: UI
After T2 and blocked by T1.
- [ ] Render sections

## Options
```approaches
name: Local server
effort: M
pick: yes
+ Live reload
- One more process
name: Static HTML
effort: S
+ Simplest
- Not live
```

## Architecture
```architecture
Browser -> Server : SSE
Server -> Plan : fs.watch
Claude -> Plan : Edit
```

## Notes
```bash
# not a heading
- [ ] not a task
| not | a table |
```

| a | b |
|---|---|
| 1 | 2 |
