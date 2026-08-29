import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createRuntimeIdentity,
  digestSerializerSource,
  extractSerializerSource,
} from '../../src/runtime-identity.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spec-crawler-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const packageRoot = path.join(root, 'spec-crawler');
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'fixture-crawler', version: '9.8.7' }));
  await writeFile(path.join(packageRoot, 'src', 'a.mjs'), 'export const a = 1;\n');
  await writeFile(path.join(packageRoot, 'src', 'z.mjs'), 'export const z = 2;\n');
  await writeFile(path.join(root, 'background.js'), [
    'const ignored = 1;',
    'async function elementSerializer(selector) {',
    '  return { selector };',
    '}',
    'const ignoredToo = 2;',
    '',
  ].join('\n'));
  return { root, packageRoot };
}

test('runtime identity separates deterministic software identity from volatile instance identity', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const common = {
    packageRoot,
    repoRoot: root,
    sourceFiles: ['src/z.mjs', 'src/a.mjs'],
    gitCommit: 'abc123',
    mcpClientName: 'fixture-mcp',
  };

  const first = createRuntimeIdentity({
    ...common,
    randomUUID: () => 'instance-one',
    pid: 101,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const second = createRuntimeIdentity({
    ...common,
    sourceFiles: ['src/a.mjs', 'src/z.mjs', 'src/a.mjs'],
    randomUUID: () => 'instance-two',
    pid: 202,
    now: () => new Date('2026-01-02T00:00:00.000Z'),
  });

  assert.deepEqual(first.deterministic, second.deterministic);
  assert.equal(first.deterministic.package.name, 'fixture-crawler');
  assert.equal(first.deterministic.package.version, '9.8.7');
  assert.deepEqual(first.deterministic.sourceFiles, ['src/a.mjs', 'src/z.mjs']);
  assert.equal(first.deterministic.gitCommit, 'abc123');
  assert.deepEqual(first.mcpClient, { name: 'fixture-mcp', version: '9.8.7' });
  assert.deepEqual(first.instance, {
    uuid: 'instance-one',
    pid: 101,
    startedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.notDeepEqual(first.instance, second.instance);
});

test('source fingerprint changes for crawler source or serializer changes, not volatile values', async (t) => {
  const { root, packageRoot } = await fixture(t);
  const options = {
    packageRoot,
    repoRoot: root,
    sourceFiles: ['src/a.mjs', 'src/z.mjs'],
    gitCommit: null,
  };

  const baseline = createRuntimeIdentity(options);
  await writeFile(path.join(packageRoot, 'src', 'z.mjs'), 'export const z = 3;\n');
  const sourceChanged = createRuntimeIdentity(options);
  assert.notEqual(sourceChanged.deterministic.sourceFingerprint, baseline.deterministic.sourceFingerprint);

  await writeFile(path.join(packageRoot, 'src', 'z.mjs'), 'export const z = 2;\n');
  await writeFile(path.join(root, 'background.js'), [
    'async function elementSerializer(selector) {',
    '  return { changed: selector };',
    '}',
    '',
  ].join('\n'));
  const serializerChanged = createRuntimeIdentity(options);
  assert.notEqual(serializerChanged.deterministic.serializerDigest, baseline.deterministic.serializerDigest);
  assert.notEqual(serializerChanged.deterministic.sourceFingerprint, baseline.deterministic.sourceFingerprint);
});

test('serializer digest covers only the extracted serializer and rejects a missing serializer', () => {
  const source = [
    'const before = 1;',
    'async function elementSerializer(target) {',
    '  return target;',
    '}',
    'const after = 2;',
  ].join('\n');
  const extracted = 'async function elementSerializer(target) {\n  return target;\n}';

  assert.equal(extractSerializerSource(source), extracted);
  assert.equal(digestSerializerSource(source), digestSerializerSource(`const unrelated = true;\n${extracted}\n`));
  assert.throws(() => extractSerializerSource('const nope = true;'), /elementSerializer/);
});
