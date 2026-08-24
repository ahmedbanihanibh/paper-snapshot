#!/usr/bin/env node
/**
 * Run a declarative scenario file.
 *
 *   node scenario-run.mjs --file scenarios/issue-row.json --dry-run
 *   node scenario-run.mjs --file scenarios/issue-row.json --endpoint http://localhost:9222
 *
 * The structured report goes to stdout as JSON and nothing else does, so this is
 * safe to pipe. Progress goes to stderr. Exit code is the verdict: a run whose
 * report says `ok: false` never exits 0, because a scenario that "succeeded"
 * with a failed step is exactly the silent-no-op failure this toolkit exists to
 * prevent.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { runScenario } from './src/scenario.mjs';
import { ScenarioValidationError } from './src/scenario-schema.mjs';

export const EXIT = Object.freeze({
  OK: 0,
  RUN_FAILED: 1,
  INVALID_SCENARIO: 2,
  USAGE: 3,
});

const USAGE = `scenario-run — execute a declarative scenario

  --file <path>       scenario JSON (required)
  --dry-run           validate and plan; never touches a browser
  --out <path>        also write the report JSON here
  --endpoint <url>    CDP endpoint, overrides target.endpoint
  --url <regex>       tab to attach to, overrides target.urlPattern
  --help

Exit codes: 0 ok · 1 run failed · 2 invalid scenario · 3 usage
`;

function fail(stderr, message, code) {
  stderr.write(`${message}\n`);
  return code;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        file: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        out: { type: 'string' },
        endpoint: { type: 'string' },
        url: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    return fail(stderr, `${error.message}\n\n${USAGE}`, EXIT.USAGE);
  }

  if (values.help) {
    stderr.write(USAGE);
    return EXIT.OK;
  }
  if (!values.file) return fail(stderr, `--file is required.\n\n${USAGE}`, EXIT.USAGE);

  const filePath = path.resolve(values.file);
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fail(stderr, `Cannot read scenario ${filePath}: ${error.message}`, EXIT.USAGE);
  }

  let report;
  try {
    report = await runScenario(raw, {
      dryRun: values['dry-run'],
      endpoint: values.endpoint ?? null,
      urlPattern: values.url ?? null,
      onProgress: (record) => {
        const mark = record.status === 'ok' ? 'ok' : record.status;
        stderr.write(`  [${mark}] ${record.phase}/${record.id} (${record.action})`
          + `${record.error ? ` — ${record.error.message}` : ''}\n`);
      },
    });
  } catch (error) {
    if (error instanceof ScenarioValidationError) {
      stderr.write(`${filePath} is not a valid scenario:\n`);
      for (const violation of error.violations) {
        stderr.write(`  ${violation.path || '(root)'}: ${violation.message} [${violation.code}]\n`);
      }
      stdout.write(`${JSON.stringify({ ok: false, error: 'invalid-scenario', file: filePath, violations: error.violations }, null, 2)}\n`);
      return EXIT.INVALID_SCENARIO;
    }
    stderr.write(`Scenario run threw: ${error.stack ?? error.message}\n`);
    stdout.write(`${JSON.stringify({ ok: false, error: 'run-threw', file: filePath, message: error.message }, null, 2)}\n`);
    return EXIT.RUN_FAILED;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  stdout.write(serialized);
  if (values.out) {
    const outPath = path.resolve(values.out);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, serialized);
    stderr.write(`report written to ${outPath}\n`);
  }
  return report.ok ? EXIT.OK : EXIT.RUN_FAILED;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
