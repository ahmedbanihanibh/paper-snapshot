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
`);
  process.exit(0);
}

// Fail loudly and early if the app isn't up — otherwise the first artboard call
// produces a confusing fetch error.
try {
  await new PaperClient().connect();
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
  onProgress: ({ state }) => process.stderr.write(`  ${state.id} (${state.kind})\n`),
});

console.error(`\n${values['dry-run'] ? 'would import' : 'imported'} ${result.imported.length} → ${result.file} / ${result.page}`);
for (const item of result.imported) console.log(`${item.id}\t${item.nodeId ?? '(dry-run)'}${item.evidenceNodeId ? `\t+evidence ${item.evidenceNodeId}` : ''}`);
