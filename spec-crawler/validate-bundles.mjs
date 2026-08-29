#!/usr/bin/env node
/**
 * Validate one or many capture bundles on disk.
 *
 *   node validate-bundles.mjs specs/issue-row specs/sidebar
 *   node validate-bundles.mjs --json specs/*
 *
 * A screenshot cannot verify a capture and neither can a directory listing. This
 * reads `spec.json` through the same normalizer the writer uses, then checks
 * that every artifact the manifest claims actually exists with the bytes it
 * claims. It reports *every* violation rather than stopping at the first,
 * because "fix one, re-run, find the next" is how a corrupted bundle survives
 * three rounds of triage.
 */

import { parseArgs } from 'node:util';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { normalizeManifest } from './src/manifest.mjs';
import { assertSafeRelativePath, describeArtifact } from './src/artifact-store.mjs';

export const EXIT = Object.freeze({ OK: 0, INVALID: 1, USAGE: 3 });

const USAGE = `validate-bundles — check capture bundles against their manifests

  <dir>...        one or more bundle directories (each containing spec.json)
  --json          emit the structured report instead of the human summary
  --help

Exit codes: 0 every bundle is valid · 1 at least one violation · 3 usage
`;

const REFERENCE_FIELDS = ['frame', 'jsx', 'shot', 'states', 'contract', 'checklist'];

function referencedPaths(state) {
  const references = [];
  for (const field of REFERENCE_FIELDS) {
    if (state[field] !== undefined && state[field] !== null) references.push([field, state[field]]);
  }
  for (const [kind, value] of Object.entries(state.shots ?? {})) {
    if (value !== undefined && value !== null) references.push([`shots.${kind}`, value]);
  }
  return references;
}

/**
 * @returns {{dir: string, ok: boolean, stateCount: number, violations: {path: string, code: string, message: string}[]}}
 */
export function validateBundleDir(dir) {
  const resolved = path.resolve(dir);
  const violations = [];
  const add = (violationPath, code, message) => violations.push({ path: violationPath, code, message });

  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
    add('', 'not-a-directory', `${resolved} is not a directory`);
    return { dir: resolved, ok: false, stateCount: 0, violations };
  }

  const manifestPath = path.join(resolved, 'spec.json');
  if (!existsSync(manifestPath)) {
    add('spec.json', 'missing-manifest', 'bundle has no spec.json');
    return { dir: resolved, ok: false, stateCount: 0, violations };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    add('spec.json', 'malformed-manifest', `spec.json is not valid JSON: ${error.message}`);
    return { dir: resolved, ok: false, stateCount: 0, violations };
  }

  let manifest;
  try {
    manifest = normalizeManifest(parsed);
  } catch (error) {
    add('spec.json', 'invalid-manifest', error.message);
    return { dir: resolved, ok: false, stateCount: 0, violations };
  }

  const seenIds = new Set();
  const seenPaths = new Set();

  for (const [index, state] of manifest.states.entries()) {
    const statePath = `states[${index}]`;
    const label = state.id ?? `#${index}`;

    if (!state.frame) add(`${statePath}.frame`, 'missing-frame', `state ${label} has no frame reference`);
    if (!Array.isArray(state.artifacts) || state.artifacts.length === 0) {
      add(`${statePath}.artifacts`, 'missing-artifacts', `state ${label} carries no artifact descriptors`);
      continue;
    }

    const byPath = new Map();
    for (const [descriptorIndex, descriptor] of state.artifacts.entries()) {
      const descriptorPath = `${statePath}.artifacts[${descriptorIndex}]`;
      if (!descriptor || typeof descriptor !== 'object') {
        add(descriptorPath, 'bad-descriptor', 'artifact descriptor must be an object');
        continue;
      }
      if (typeof descriptor.id !== 'string' || descriptor.id.length === 0) {
        add(`${descriptorPath}.id`, 'bad-descriptor', 'artifact id must be a non-empty string');
        continue;
      }
      if (seenIds.has(descriptor.id)) add(`${descriptorPath}.id`, 'duplicate-artifact-id', `artifact id ${descriptor.id} is used more than once`);
      seenIds.add(descriptor.id);

      try {
        assertSafeRelativePath(descriptor.path);
      } catch (error) {
        add(`${descriptorPath}.path`, 'unsafe-path', error.message);
        continue;
      }
      if (seenPaths.has(descriptor.path)) add(`${descriptorPath}.path`, 'duplicate-artifact-path', `artifact path ${descriptor.path} is used more than once`);
      seenPaths.add(descriptor.path);
      byPath.set(descriptor.path, descriptor);

      const absolute = path.join(resolved, descriptor.path);
      if (!existsSync(absolute)) {
        add(`${descriptorPath}.path`, 'missing-artifact', `referenced artifact is missing on disk: ${descriptor.path}`);
        continue;
      }
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        add(`${descriptorPath}.path`, 'unsafe-artifact', `referenced artifact is not a regular file: ${descriptor.path}`);
        continue;
      }

      let actual;
      try {
        actual = describeArtifact({ id: descriptor.id, kind: descriptor.kind, path: descriptor.path, data: readFileSync(absolute) });
      } catch (error) {
        add(`${descriptorPath}`, 'unreadable-artifact', `${descriptor.path}: ${error.message}`);
        continue;
      }
      if (actual.sha256 !== descriptor.sha256) {
        add(`${descriptorPath}.sha256`, 'hash-mismatch',
          `${descriptor.path} hashes to ${actual.sha256}, manifest claims ${descriptor.sha256 ?? '(none)'}`);
      }
      if (descriptor.bytes !== undefined && actual.bytes !== descriptor.bytes) {
        add(`${descriptorPath}.bytes`, 'size-mismatch',
          `${descriptor.path} is ${actual.bytes} bytes, manifest claims ${descriptor.bytes}`);
      }
    }

    for (const [field, relativePath] of referencedPaths(state)) {
      if (!byPath.has(relativePath)) {
        add(`${statePath}.${field}`, 'undeclared-reference',
          `state ${label} references ${relativePath} but no artifact descriptor covers it`);
      }
    }
  }

  return { dir: resolved, ok: violations.length === 0, stateCount: manifest.states.length, violations };
}

export function validateBundleDirs(dirs) {
  const bundles = dirs.map((dir) => validateBundleDir(dir));
  return {
    ok: bundles.every((bundle) => bundle.ok),
    bundles,
    violationCount: bundles.reduce((total, bundle) => total + bundle.violations.length, 0),
  };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { json: { type: 'boolean', default: false }, help: { type: 'boolean', default: false } },
    }));
  } catch (error) {
    stderr.write(`${error.message}\n\n${USAGE}`);
    return EXIT.USAGE;
  }

  if (values.help) {
    stderr.write(USAGE);
    return EXIT.OK;
  }
  if (positionals.length === 0) {
    stderr.write(`At least one bundle directory is required.\n\n${USAGE}`);
    return EXIT.USAGE;
  }

  const report = validateBundleDirs(positionals);

  if (values.json) {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const bundle of report.bundles) {
      if (bundle.ok) {
        stdout.write(`ok       ${bundle.dir} (${bundle.stateCount} state${bundle.stateCount === 1 ? '' : 's'})\n`);
        continue;
      }
      stdout.write(`INVALID  ${bundle.dir} — ${bundle.violations.length} violation${bundle.violations.length === 1 ? '' : 's'}\n`);
      for (const violation of bundle.violations) {
        stdout.write(`           ${violation.path || '(root)'}: ${violation.message} [${violation.code}]\n`);
      }
    }
  }

  return report.ok ? EXIT.OK : EXIT.INVALID;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
