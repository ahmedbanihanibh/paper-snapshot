#!/usr/bin/env node
/**
 * CLI for the deterministic passes (Tier 1 + Tier 2).
 *
 * Tier 3 needs judgement, so it lives in the MCP server where an agent drives
 * it. Use this when you just want the whole page swept without a model in the
 * loop.
 *
 *   node index.mjs --url linear.app --limit 20 --out ./spec-bundle
 */

import { parseArgs } from 'node:util';
import { SpecDriver } from './src/driver.mjs';
import { Bundle } from './src/bundle.mjs';
import { crawlOverlays, DEFAULT_DENY } from './src/crawl.mjs';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    goto: { type: 'string' },
    endpoint: { type: 'string', default: 'http://localhost:9222' },
    out: { type: 'string', default: './spec-bundle' },
    limit: { type: 'string' },
    deny: { type: 'string', default: DEFAULT_DENY },
    'css-only': { type: 'boolean', default: false },
    'debug-inert': { type: 'boolean', default: false },
    depth: { type: 'string', default: '1' },
    'no-scan-states': { type: 'boolean', default: false },
    scope: { type: 'string' },
    exclude: { type: 'string' },
    'exclude-area': { type: 'string' },
    shots: { type: 'string', default: 'context' },
    regions: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`spec-crawler — capture a web app's design spec

  --url <regex>      tab to attach to, e.g. "linear.app"
  --goto <url>       navigate that tab to this page first (scope a run to one page)
  --endpoint <url>   CDP endpoint (default http://localhost:9222)
  --out <dir>        bundle output (default ./spec-bundle)
  --limit <n>        max triggers to visit
  --deny <regex>     trigger labels to skip
  --css-only         Tier 1 only; clicks nothing
  --debug-inert      screenshot every trigger that produced nothing
  --depth <n>        1 = overlays only, 2 = also inside them, 3 = one deeper
  --no-scan-states   skip the per-surface CSS state scan
  --scope <selector>   crawl only inside this region, e.g. "main"
  --exclude <sel>      never click inside these, e.g. "nav, aside"
  --exclude-area x1,y1,x2,y2   never click inside this box (for apps with no landmarks)
  --shots <mode>       minimal | context (default) | all — context adds trigger +
                       full-viewport shots so a code agent can see the wiring
  --regions            list candidate regions with trigger counts, then exit

Start the browser first:
  open -na 'Microsoft Edge' --args --remote-debugging-port=9222 --user-data-dir="$HOME/.spec-crawler-edge"
`);
  process.exit(0);
}

const driver = await SpecDriver.attach(values.endpoint, values.url);
console.error(`attached  ${driver.page.url()}`);
if (values.goto) {
  console.error(`navigate  ${values.goto}`);
  await driver.goto(values.goto);
}

await driver.establishBaseline();

if (values.regions) {
  console.error('regions   (pass one as --scope, or others as --exclude)\n');
  for (const r of await driver.regions()) {
    console.error(`  ${String(r.selector).padEnd(28)} ${String(r.triggers).padStart(4)} triggers  ${r.rect.width}x${r.rect.height} at ${r.rect.x},${r.rect.y}  ${r.label}`);
  }
  await driver.close();
  process.exit(0);
}

const excludeArea = values['exclude-area'] ? values['exclude-area'].split(',').map(Number) : null;
if (values.scope || values.exclude || excludeArea) {
  driver.setRegion({ include: values.scope ?? null, exclude: values.exclude ?? null, excludeArea });
  console.error(`region    scope=${values.scope ?? '(page)'} exclude=${values.exclude ?? '(none)'} area=${excludeArea ? excludeArea.join(',') : '(none)'}`);
}

// The CLI is one deterministic sweep per invocation, so it starts from clean.
const bundle = new Bundle(values.out, { url: driver.page.url() }, { fresh: true });

console.error('tier 1    scanning stylesheets…');
const cssSpec = await driver.cssSpec();
bundle.setCssSpec(cssSpec);
console.error(`tier 1    ${cssSpec.components.length} components, ${cssSpec.stateNames.length} states, ${cssSpec.unreadableSheets} unreadable sheets`);

if (!values['css-only']) {
  console.error('tier 2    crawling overlays…');
  const report = await crawlOverlays(driver, bundle, {
    deny: values.deny,
    limit: values.limit ? Number(values.limit) : Infinity,
    debugInert: values['debug-inert'],
    depth: Math.max(1, Number(values.depth) || 1),
    scanStates: !values['no-scan-states'],
    shots: values.shots,
    region: (values.scope || values.exclude || excludeArea) ? { include: values.scope ?? null, exclude: values.exclude ?? null, excludeArea } : null,
    onProgress: ({ level, trigger, captured }) => {
      process.stderr.write(`\r  L${level} captured ${captured} — ${String(trigger).slice(0, 44).padEnd(46)}`);
    },
  });
  process.stderr.write('\n');
  bundle.setCrawlReport(report);
  const perLevel = Object.entries(report.byLevel).map(([level, count]) => `L${level}:${count}`).join(' ') || 'none';
  console.error(`tier 2    ${report.captured} captured (${perLevel}), ${report.duplicates} duplicates, ${report.inert} inert, ${report.navigations.length} routes, ${report.failures.length} failures`);
  if (report.truncated) console.error(`          ${report.truncated}`);
}

const specPath = bundle.write();
await driver.close();
console.error(`\nbundle    ${specPath}`);
console.log(specPath);
