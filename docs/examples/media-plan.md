# Images and Animation — Example Plan — rev 1 (2026-10-19)

**Owner:** Example

Plans can carry pictures and small animations. Open this file with `/plan-live docs/examples/media-plan.md` to see both.

## A picture from the plan's folder

![Comment, Apply, Claude edits, Diff to review](pipeline.svg "An image beside the plan, loaded from this folder")

## An animation

Press the play button on the block below. It runs sandboxed: it cannot touch the page, your cookies or the network, and it takes its colours from the current theme.

```embed height=200
<style>
  .stage { height: 100%; display: grid; place-items: center; font: 600 14px var(--font-body, system-ui); }
  .row { display: flex; gap: 14px; align-items: center; }
  .dot { width: 18px; height: 18px; border-radius: 50%; background: var(--accent, #0071e3); animation: beat 1.4s ease-in-out infinite; }
  .dot:nth-child(2) { animation-delay: .2s; } .dot:nth-child(3) { animation-delay: .4s; }
  .cap { margin-top: 14px; color: var(--muted, #6e6e73); font-weight: 500; text-align: center; }
  @keyframes beat { 0%, 100% { transform: scale(.7); opacity: .45; } 50% { transform: scale(1.15); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
<div class="stage"><div><div class="row"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div><div class="cap">A sample animation. Comment on it and Claude can rewrite it.</div></div></div>
```

## Plan

### Task 1: Try it

- [ ] **Step 1: Open this plan**
- [ ] **Step 2: Run the animation**
- [ ] **Step 3: Switch theme and watch it follow**
