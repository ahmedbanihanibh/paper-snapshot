import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { SpecDriver } from '../../src/driver.mjs';
import * as pageAgent from '../../src/page-agent.mjs';
import { waitForStable } from '../../src/stability.mjs';
import { SurfaceResolver } from '../../src/surface.mjs';
import { TargetLease, TargetLeaseError } from '../../src/target.mjs';
import { anchorOf, classify } from '../../src/crawl.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(path.join(HERE, 'fixtures/foundation.html'), 'utf8');
const executableCandidates = [
  process.env.SPEC_BROWSER_EXECUTABLE,
  chromium.executablePath(),
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));
const browserOptions = executablePath ? { headless: true, executablePath } : null;

let browser;
let page;
test.before(async () => {
  if (!browserOptions) return;
  browser = await chromium.launch(browserOptions);
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
});
test.after(async () => {
  await browser?.close();
});
test.beforeEach(async () => {
  if (page) await page.setContent(fixture, { waitUntil: 'load' });
});

const browserTest = (name, fn) => test(name, { skip: !browserOptions }, fn);

browserTest('TargetLease rejects a same-coordinate recycled row', async () => {
  const lease = await TargetLease.acquire(page, {
    x: 100,
    y: 40,
    expect: 'Issue',
    assignedSpecId: 'leased-row',
  });
  assert.equal(lease.snapshot.label, 'Issue ABC-123');

  await page.evaluate(() => {
    const replacement = document.createElement('div');
    replacement.id = 'target';
    replacement.setAttribute('role', 'row');
    replacement.setAttribute('data-list-key', 'issue-999');
    replacement.setAttribute('data-spec-id', 'leased-row');
    replacement.textContent = 'Issue XYZ-999';
    Object.assign(replacement.style, {
      position: 'fixed', left: '20px', top: '20px', width: '300px', height: '40px',
    });
    document.getElementById('target').replaceWith(replacement);
  });

  await assert.rejects(lease.revalidate(), (error) => {
    assert.ok(error instanceof TargetLeaseError);
    assert.equal(error.code, 'ERR_TARGET_RECYCLED');
    assert.ok(error.evidence.mismatches.includes('label-digest'));
    return true;
  });
});

browserTest('SurfaceResolver chooses the inner dialog over its viewport wrapper', async () => {
  await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);
  const ids = await page.evaluate((attribute) => ({
    wrapper: document.getElementById('portal-wrapper').getAttribute(attribute),
    dialog: document.getElementById('dialog').getAttribute(attribute),
  }), pageAgent.ID_ATTRIBUTE);
  const driver = new SpecDriver({ close: async () => {} }, page);
  const [wrapper] = await driver.describeByIds([ids.wrapper]);
  const trigger = {
    hasPopup: 'dialog',
    rect: { x: 20, y: 20, width: 300, height: 40 },
  };

  const resolution = await new SurfaceResolver(driver, { classify, anchorOf }).resolve([wrapper], { trigger });

  assert.equal(resolution.surface.id, ids.dialog);
  assert.equal(resolution.surface.role, 'dialog');
  assert.ok(resolution.candidates.some((candidate) => candidate.id === ids.wrapper));
});

browserTest('shared subgrid resolver preserves named lines and gaps then restores exact style text', async () => {
  await page.evaluate(pageAgent.tagElements, pageAgent.ID_ATTRIBUTE);
  const before = await page.$eval('#subgrid', (element) => element.getAttribute('style'));
  const specId = await page.$eval('#subgrid', (element) => element.getAttribute('data-spec-id'));

  const transaction = await page.evaluate(pageAgent.resolveSubgrids, {
    attribute: pageAgent.ID_ATTRIBUTE,
    targetSpecId: specId,
    token: 'browser-test',
  });
  const resolved = await page.$eval('#subgrid', (element) => ({
    columns: element.style.gridTemplateColumns,
    gap: element.style.columnGap,
    marker: element.getAttribute('data-spec-subgrid-token'),
  }));

  assert.match(resolved.columns, /\[icon\]/);
  assert.match(resolved.columns, /\[title\]/);
  assert.equal(resolved.gap, '12px');
  assert.equal(resolved.marker, 'browser-test-0');

  await page.evaluate(pageAgent.restoreSubgrids, { records: transaction.records });
  const after = await page.$eval('#subgrid', (element) => ({
    style: element.getAttribute('style'),
    marker: element.hasAttribute('data-spec-subgrid-token'),
  }));
  assert.equal(after.style, before);
  assert.equal(after.marker, false);
});

browserTest('stability waits for a finite animation and diagnoses an infinite animation timeout', async () => {
  await page.$eval('#animation-target', (element) => {
    element.className = 'finite';
    setTimeout(() => element.getAnimations()[0]?.finish(), 140);
  });
  const finite = await waitForStable(page, {
    scope: '#animation-target', quietWindowMs: 20, pollIntervalMs: 10,
    consecutiveSamples: 2, timeoutMs: 2_000,
  });
  assert.equal(finite.stable, true, JSON.stringify(finite));
  assert.ok(finite.elapsedMs >= 90);

  await page.$eval('#animation-target', (element) => element.className = 'infinite');
  const infinite = await waitForStable(page, {
    scope: '#animation-target', quietWindowMs: 20, pollIntervalMs: 10,
    consecutiveSamples: 2, timeoutMs: 120,
  });
  assert.equal(infinite.stable, false);
  assert.equal(infinite.timedOut, true);
  assert.ok(infinite.diagnostics.blockers.includes('animations'));
  assert.ok(infinite.diagnostics.animations.length > 0);
});

browserTest('stability waits for document fonts readiness', async () => {
  await page.route('**/slow.woff2', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 160));
    await route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.from('not-a-real-font') });
  });
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '@font-face { font-family: SlowFixture; src: url("/slow.woff2"); } #font-target { font-family: SlowFixture; }';
    document.head.appendChild(style);
    const target = document.createElement('div');
    target.id = 'font-target';
    target.textContent = 'Font target';
    document.body.appendChild(target);
    document.fonts.load('16px SlowFixture').catch(() => {});
  });

  const evidence = await waitForStable(page, {
    scope: '#font-target', quietWindowMs: 20, pollIntervalMs: 10,
    consecutiveSamples: 2, timeoutMs: 1_000,
  });

  assert.equal(evidence.stable, true);
  assert.equal(evidence.diagnostics.fontsReady, true);
  assert.ok(evidence.elapsedMs >= 120);
  await page.unroute('**/slow.woff2');
});

browserTest('stability waits for subtree image load and decode', async () => {
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZsAAAAASUVORK5CYII=', 'base64');
  await page.route('**/slow.png', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 160));
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'image-target';
    const image = document.createElement('img');
    image.src = '/slow.png';
    container.appendChild(image);
    document.body.appendChild(container);
  });

  const evidence = await waitForStable(page, {
    scope: '#image-target', quietWindowMs: 20, pollIntervalMs: 10,
    consecutiveSamples: 2, timeoutMs: 1_000,
  });

  assert.equal(evidence.stable, true);
  assert.equal(evidence.diagnostics.images.pending, 0);
  assert.equal(evidence.diagnostics.images.total, 1);
  assert.ok(evidence.elapsedMs >= 120);
  await page.unroute('**/slow.png');
});
