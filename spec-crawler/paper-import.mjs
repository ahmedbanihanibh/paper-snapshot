#!/usr/bin/env node
/**
 * Push a spec bundle into the open Paper file.
 *
 *   node paper-import.mjs --bundle ./spec-bundle --only 002
 *   node paper-import.mjs --bundle ./spec-bundle            # everything
 *
 * Requires the Paper MCP desktop app to be running with a file open.
 */

import { parseArgs } from 'node:util';
import { importBundle, PaperClient } from './src/paper.mjs';

const { values } = parseArgs({
  options: {
    bundle: { type: 'string', default: './spec-bundle' },
    only: { type: 'string' },
    limit: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    evidence: { type: 'boolean', default: false },
    'file-id': { type: 'string' },
    update: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`paper-import — push captured frames into Paper as design nodes

  --bundle <dir>   bundle directory (default ./spec-bundle)
  --only <id>      import a single state (id, prefix, or substring)
  --limit <n>      import at most n states
  --dry-run        list what would be imported, write nothing
  --evidence       also create an evidence artboard per state (annotated
                   screenshot + anchor + role evidence + css state summary)
  --file-id <id>   target a specific open Paper file
  --update          update a changed ledger entry instead of reporting conflict
`);
  process.exit(0);
}

// Fail loudly and early if the app isn't up — otherwise the first artboard call
// produces a confusing fetch error.
let client;
try {
  client = await new PaperClient().connect();
} catch (cause) {
  console.error('Could not reach the Paper MCP app at http://127.0.0.1:29979/mcp');
  console.error('Open the Paper MCP app and load a file, then retry.');
  console.error(`  (${cause instanceof Error ? cause.message : cause})`);
  process.exit(1);
}

const result = await importBundle(values.bundle, {
  only: values.only,
  limit: values.limit ? Number(values.limit) : Infinity,
  dryRun: values['dry-run'],
  evidence: values.evidence,
  fileId: values['file-id'],
  onConflict: values.update ? 'update' : 'conflict',
  client,
  onProgress: ({ state, action }) => process.stderr.write(`  ${state.id} (${state.kind})${action ? ` [${action}]` : ''}\n`),
});

console.error(`\n${values['dry-run'] ? 'would process' : 'processed'} ${result.imported.length} → ${result.file} / ${result.page}`);
for (const item of result.imported) {
  // A rejected state is one whose artboard could not be fitted to its content, so
  // it kept the fallback height and its frame is clipped. It used to print exactly
  // like a successful one and the process still exited 0.
  const flag = item.status === 'rejected' ? `\tREJECTED (${item.fitStatus ?? 'fit failed'} — artboard clipped)` : '';
  console.log(`${item.id}\t${item.nodeId ?? '(dry-run)'}\t${item.action ?? 'create'}${item.evidenceNodeId ? `\t+evidence ${item.evidenceNodeId}` : ''}${flag}`);
}
if (result.rejected.length) {
  console.error(`\n${result.rejected.length} artboard(s) could not be fitted to their content and are clipped: ${result.rejected.map((item) => item.id).join(', ')}`);
  console.error('Re-run to retry them — the ledger has recorded them as rejected, so they will be updated rather than duplicated.');
}
if (result.conflicts.length || result.rejected.length) process.exitCode = 1;
