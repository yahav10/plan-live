# Checkout Bug — Remediation Plan — rev 2 (2026-01-15)

**Ticket:** https://example.com/browse/SHOP-42

## The bug, in one screen

| hop | where | what |
|---|---|---|
| 1 | cart.js:12 | id only |
| 2 | api.ts:40 | split at first space |

## Decisions (Alex, 2026-01-15)

| # | decision | consequence |
|---|---|---|
| D1 | Guard at the API | no client change |

## Rollout

1. Deploy api
2. Deploy web
