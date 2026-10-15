const anchorText = a => `§ ${a.sectionId}${a.taskId && a.quote ? ` › task "${a.quote}"` : ''}`;

const shellQuote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function formatBatch({ batch, comments, plan, cli }) {
  const byId = new Map(comments.map(c => [c.id, c]));
  const items = batch.commentIds.map(id => byId.get(id)).filter(Boolean);
  const run = `node "${cli}"`;
  const out = [
    `plan-live review batch ${batch.id} for ${plan} — ${items.length} comment${items.length === 1 ? '' : 's'}.`,
    'For each comment: edit the plan as needed (or decide to decline), then run:',
    `  ${run} resolve ${shellQuote(plan)} <id> --status resolved|declined --note "<one line>"`,
    `When every comment is resolved, restart the watcher in the background: ${run} watch ${shellQuote(plan)}`,
    '',
  ];
  for (const c of items) {
    out.push(`[${c.id}] ${c.kind} on ${anchorText(c.anchor)}${c.orphaned ? ' (anchor no longer found in the plan)' : ''}`);
    if (c.anchor.quote && !c.anchor.taskId) out.push(`  quote: "${c.anchor.quote}"`);
    if (c.kind === 'suggestion') {
      out.push(`  replace: "${c.anchor.quote ?? ''}"`);
      out.push(`  with:    "${c.replacement}"`);
    }
    out.push(...c.body.split('\n').map(l => `  > ${l}`), '');
  }
  return out.join('\n').trimEnd();
}

export function formatRejections({ revisions, comments, plan }) {
  const lines = [`plan-live: review outcomes for ${plan}`];
  for (const r of revisions) {
    const who = r.commentId ?? 'an unlinked change';
    const change = `"${r.hunk.bLines.join(' / ') || '(deletion)'}"`;
    if (r.status === 'rejected') lines.push(`- The user rejected your change for ${who} (${change}); it was reverted; do not re-apply it.`);
    if (r.status === 'conflict') lines.push(`- The user rejected ${change} but plan-live could not undo ${r.id} automatically; revert it by hand in the plan.`);
  }
  return lines.join('\n');
}
