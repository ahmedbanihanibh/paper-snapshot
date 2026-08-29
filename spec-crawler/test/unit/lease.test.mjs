import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  FileLeaseManager,
  LeaseConflictError,
  bundleLeaseKey,
  cdpTargetLeaseKey,
  leaseDirectoryName,
} from '../../src/lease.mjs';

async function leaseRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spec-crawler-leases-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function metadata(lease) {
  return JSON.parse(await readFile(path.join(lease.path, 'owner.json'), 'utf8'));
}

test('lease keys use path-safe SHA-256 directory names and do not expose resources', () => {
  const bundle = bundleLeaseKey('../../private/bundle', { cwd: '/workspace/project' });
  const target = cdpTargetLeaseKey('http://localhost:9222/', 'page/../../secret?id=1');

  for (const key of [bundle, target]) {
    const name = leaseDirectoryName(key);
    assert.match(name, /^(bundle|cdp-target)-[a-f0-9]{64}$/);
    assert.equal(name.includes('..'), false);
    assert.equal(name.includes('secret'), false);
    assert.equal(path.basename(name), name);
  }
});

test('bundle keys canonicalize existing symlink aliases to one resource', async (t) => {
  const root = await leaseRoot(t);
  const realDirectory = path.join(root, 'real');
  const aliasDirectory = path.join(root, 'alias');
  const { mkdir, symlink } = await import('node:fs/promises');
  await mkdir(path.join(realDirectory, 'bundle'), { recursive: true });
  await symlink(realDirectory, aliasDirectory, 'dir');

  assert.equal(
    bundleLeaseKey(path.join(realDirectory, 'bundle')).hash,
    bundleLeaseKey(path.join(aliasDirectory, 'bundle')).hash,
  );
});

test('lease manager rejects invalid owner pids before creating malformed leases', async (t) => {
  const root = await leaseRoot(t);
  assert.throws(() => new FileLeaseManager({ rootDir: root, pid: 0 }), /pid/i);
});

test('a real second process cannot acquire a live lease', { timeout: 10_000 }, async (t) => {
  const root = await leaseRoot(t);
  const moduleUrl = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/lease.mjs')).href;
  const script = `
    import { FileLeaseManager, bundleLeaseKey } from ${JSON.stringify(moduleUrl)};
    const manager = new FileLeaseManager({ rootDir: ${JSON.stringify(root)}, heartbeatIntervalMs: 0 });
    const lease = await manager.acquire(bundleLeaseKey('/shared/bundle'));
    process.stdout.write('ready\\n');
    process.stdin.resume();
    process.stdin.on('end', async () => { await lease.release(); });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { if (!child.killed) child.kill('SIGKILL'); });

  let stdout = '';
  for await (const chunk of child.stdout) {
    stdout += chunk;
    if (stdout.includes('ready\n')) break;
  }
  assert.match(stdout, /ready/);

  const contender = new FileLeaseManager({ rootDir: root, heartbeatIntervalMs: 0 });
  await assert.rejects(contender.acquire(bundleLeaseKey('/shared/bundle')), (error) => {
    assert.ok(error instanceof LeaseConflictError);
    assert.equal(error.code, 'ERR_LEASE_CONFLICT');
    assert.equal(error.owner.pid, child.pid);
    return true;
  });

  child.stdin.end();
  await once(child, 'exit');
});

test('an old heartbeat never permits stealing from a live pid', async (t) => {
  const root = await leaseRoot(t);
  const manager = new FileLeaseManager({
    rootDir: root,
    pid: 4001,
    hostname: 'same-host',
    processAlive: () => true,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    heartbeatIntervalMs: 0,
  });
  const lease = await manager.acquire(bundleLeaseKey('/bundle'));
  const ownerPath = path.join(lease.path, 'owner.json');
  const owner = await metadata(lease);
  owner.heartbeatAt = '2000-01-01T00:00:00.000Z';
  await writeFile(ownerPath, `${JSON.stringify(owner)}\n`);
  await utimes(ownerPath, new Date(0), new Date(0));

  const contender = new FileLeaseManager({
    rootDir: root,
    pid: 4002,
    hostname: 'same-host',
    processAlive: () => true,
    now: () => new Date('2099-01-01T00:00:00.000Z'),
    heartbeatIntervalMs: 0,
  });
  await assert.rejects(contender.acquire(bundleLeaseKey('/bundle')), { code: 'ERR_LEASE_CONFLICT' });
  assert.equal((await metadata(lease)).ownerToken, lease.ownerToken);
  await lease.release();
});

test('a same-host dead pid lease is conservatively recovered', async (t) => {
  const root = await leaseRoot(t);
  const deadOwner = new FileLeaseManager({
    rootDir: root,
    pid: 5001,
    hostname: 'same-host',
    processAlive: () => true,
    heartbeatIntervalMs: 0,
    randomUUID: () => 'dead-owner-token',
  });
  const abandoned = await deadOwner.acquire(cdpTargetLeaseKey('http://localhost:9222', 'target-1'));

  const recovering = new FileLeaseManager({
    rootDir: root,
    pid: 5002,
    hostname: 'same-host',
    processAlive: (pid) => pid !== 5001,
    heartbeatIntervalMs: 0,
    randomUUID: () => 'new-owner-token',
  });
  const recovered = await recovering.acquire(cdpTargetLeaseKey('http://localhost:9222', 'target-1'));

  assert.equal(recovered.ownerToken, 'new-owner-token');
  assert.equal((await metadata(recovered)).pid, 5002);
  assert.equal(await abandoned.release(), false);
  assert.equal(await recovered.release(), true);
});

test('release is owner-token safe and idempotent', async (t) => {
  const root = await leaseRoot(t);
  const manager = new FileLeaseManager({ rootDir: root, heartbeatIntervalMs: 0 });
  const lease = await manager.acquire(bundleLeaseKey('/bundle'));
  const ownerPath = path.join(lease.path, 'owner.json');
  const impostor = { ...(await metadata(lease)), ownerToken: 'different-owner' };
  await writeFile(ownerPath, `${JSON.stringify(impostor)}\n`);

  assert.equal(await lease.release(), false);
  assert.equal((await stat(lease.path)).isDirectory(), true);

  impostor.ownerToken = lease.ownerToken;
  await writeFile(ownerPath, `${JSON.stringify(impostor)}\n`);
  assert.equal(await lease.release(), true);
  assert.equal(await lease.release(), false);
});

test('heartbeat updates only a currently owned lease', async (t) => {
  const root = await leaseRoot(t);
  let now = new Date('2026-01-01T00:00:00.000Z');
  const manager = new FileLeaseManager({
    rootDir: root,
    now: () => now,
    heartbeatIntervalMs: 0,
  });
  const lease = await manager.acquire(bundleLeaseKey('/bundle'));
  now = new Date('2026-01-01T00:00:10.000Z');

  assert.equal(await lease.heartbeat(), true);
  assert.equal((await metadata(lease)).heartbeatAt, now.toISOString());

  const ownerPath = path.join(lease.path, 'owner.json');
  const changed = { ...(await metadata(lease)), ownerToken: 'other-token' };
  await writeFile(ownerPath, `${JSON.stringify(changed)}\n`);
  assert.equal(await lease.heartbeat(), false);
  await rm(lease.path, { recursive: true, force: true });
});

test('a symlink at a lease location is never followed or recovered', async (t) => {
  const root = await leaseRoot(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'spec-crawler-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const key = bundleLeaseKey('/bundle');
  const leasePath = path.join(root, leaseDirectoryName(key));
  const { symlink } = await import('node:fs/promises');
  await symlink(outside, leasePath, 'dir');

  const manager = new FileLeaseManager({ rootDir: root, processAlive: () => false, heartbeatIntervalMs: 0 });
  await assert.rejects(manager.acquire(key), { code: 'ERR_LEASE_CONFLICT' });
  assert.equal((await stat(outside)).isDirectory(), true);
});
