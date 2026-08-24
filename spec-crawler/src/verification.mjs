import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { normalizeFrameRoot, importBundle, PaperClient } from './paper.mjs';
import { comparePngs, decodePng } from './visual-diff.mjs';
import { hashCanonical } from './hashes.mjs';

const STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
});

const finite = (...values) => values.find((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
const asNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function selectState(spec, selector) {
  const states = spec?.states ?? [];
  if (!selector) return states[0] ?? null;
  if (typeof selector === 'object') return selector;
  const needle = String(selector);
  return states.find((state) => state.id === needle || state.id.startsWith(needle) || state.id.includes(needle)) ?? null;
}

function readBundleState(bundleDir, selector) {
  const specPath = path.join(bundleDir, 'spec.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const state = selectState(spec, selector);
  if (!state) throw new Error(`No state matching ${selector ?? '(first state)'}`);
  if (!state.frame) throw new Error(`State ${state.id} has no captured frame`);
  const framePath = path.join(bundleDir, state.frame);
  if (!existsSync(framePath)) throw new Error(`State ${state.id} frame is missing: ${framePath}`);
  const referencePath = state.shot ? path.join(bundleDir, state.shot) : null;
  return {
    spec,
    state,
    framePath,
    html: normalizeFrameRoot(readFileSync(framePath, 'utf8')),
    referencePath,
    referencePng: referencePath && existsSync(referencePath) ? readFileSync(referencePath) : null,
  };
}

/**
 * Masks for the regions this state's capture declared volatile.
 *
 * The capture agreed to ignore these pixels; a verification that compares them
 * anyway rejects a state for varying in exactly the way it was told it would. The
 * recorded rects are CSS pixels in the subject's own frame — which is the frame an
 * element screenshot is in — so they only need scaling by the device pixel ratio
 * to land on the right pixels of the PNG.
 */
export function volatileMasks(state, deviceScaleFactor = 1) {
  const scale = Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0 ? deviceScaleFactor : 1;
  const masks = [];
  for (const region of state?.volatile ?? []) {
    for (const rect of region.rects ?? []) {
      masks.push({
        x: Math.floor(rect.x * scale),
        y: Math.floor(rect.y * scale),
        width: Math.ceil(rect.width * scale),
        height: Math.ceil(rect.height * scale),
      });
    }
  }
  return masks;
}

function renderEnvironment(spec, state, referencePng) {
  const provenance = { ...(spec?.provenance ?? {}), ...(state?.provenance ?? {}) };
  const recordedViewport = state.viewport ?? provenance.viewport ?? provenance.environment?.viewport ?? {};
  const rectWidth = asNumber(state.rect?.width ?? state.rect?.w, 800);
  const rectHeight = asNumber(state.rect?.height ?? state.rect?.h, 600);
  const viewport = {
    width: Math.max(1, Math.round(asNumber(recordedViewport.width, rectWidth))),
    height: Math.max(1, Math.round(asNumber(recordedViewport.height, rectHeight))),
  };
  let referenceSize = null;
  try { if (referencePng) referenceSize = decodePng(referencePng); } catch { /* comparison reports malformed bytes later */ }
  const inferredDpr = referenceSize && rectWidth > 0 ? referenceSize.width / rectWidth : 1;
  const deviceScaleFactor = Math.max(0.1, asNumber(finite(
    state.deviceScaleFactor,
    state.dpr,
    provenance.deviceScaleFactor,
    provenance.dpr,
    provenance.environment?.deviceScaleFactor,
  ), inferredDpr));
  const colorScheme = ['dark', 'light', 'no-preference'].includes(state.colorScheme ?? provenance.colorScheme)
    ? (state.colorScheme ?? provenance.colorScheme)
    : 'light';
  const reducedMotionValue = state.reducedMotion ?? provenance.reducedMotion ?? provenance.environment?.reducedMotion;
  const reducedMotion = reducedMotionValue === true || reducedMotionValue === 'reduce' ? 'reduce' : 'no-preference';
  return {
    viewport,
    deviceScaleFactor,
    colorScheme,
    reducedMotion,
    locale: state.locale ?? provenance.locale,
    timezoneId: state.timezoneId ?? provenance.timezoneId,
    fontsCss: state.fontsCss ?? provenance.fontsCss,
  };
}

function landmarkDefinitions(state) {
  const raw = state.semanticLandmarks ?? state.landmarks ?? state.semantics?.landmarks ?? [];
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, value]) => typeof value === 'string' ? { name, selector: value } : { name, ...value });
  return list.map((entry, index) => typeof entry === 'string'
    ? { name: entry, selector: entry, required: true }
    : { name: entry.name ?? entry.selector ?? entry.role ?? `landmark-${index + 1}`, required: entry.required !== false, ...entry });
}

function documentHtml(html) {
  const content = String(html).replace(/^\s*<!doctype\b[^>]*>\s*/i, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style id="spec-verification-reset">html,body{margin:0;padding:0;min-width:0;min-height:0;background:transparent;}</style></head><body>${content}</body></html>`;
}

async function inspectRenderedRoot(page, state) {
  const definitions = landmarkDefinitions(state);
  return page.evaluate((landmarks) => {
    const ignored = new Set(['STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'BASE', 'NOSCRIPT', 'TEMPLATE']);
    const root = Array.from(document.body.children).find((element) => !ignored.has(element.tagName));
    if (!root) return { missingRoot: true, landmarks: [] };
    root.setAttribute('data-spec-verification-root', '');
    const rect = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    const clipsX = !['visible', 'clip'].includes(style.overflowX);
    const clipsY = !['visible', 'clip'].includes(style.overflowY);
    const descendants = Array.from(root.querySelectorAll('*'));
    const clippedDescendants = descendants.filter((element) => {
      const child = element.getBoundingClientRect();
      return (clipsX && (child.left < rect.left - 0.5 || child.right > rect.right + 0.5))
        || (clipsY && (child.top < rect.top - 0.5 || child.bottom > rect.bottom + 0.5));
    });
    const resolveLandmark = (definition) => {
      let matches = [];
      if (definition.selector) {
        try { matches = Array.from(root.querySelectorAll(definition.selector)); } catch { matches = []; }
      } else if (definition.role) {
        matches = [root, ...descendants].filter((element) => element.getAttribute('role') === definition.role);
      } else if (definition.text) {
        matches = [root, ...descendants].filter((element) => element.textContent?.includes(definition.text));
      }
      if (definition.text) matches = matches.filter((element) => element.textContent?.includes(definition.text));
      return { name: definition.name, required: definition.required !== false, count: matches.length, found: matches.length > 0 };
    };
    const fontFamilies = [...new Set([root, ...descendants].map((element) => getComputedStyle(element).fontFamily).filter(Boolean))];
    return {
      missingRoot: false,
      geometry: {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight,
        clientWidth: root.clientWidth, clientHeight: root.clientHeight,
      },
      overflow: {
        x: root.scrollWidth > root.clientWidth + 0.5,
        y: root.scrollHeight > root.clientHeight + 0.5,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      },
      clipping: { clipped: clippedDescendants.length > 0, descendantCount: clippedDescendants.length },
      landmarks: landmarks.map(resolveLandmark),
      fonts: { status: document.fonts?.status ?? 'unsupported', families: fontFamilies },
    };
  }, definitions);
}

/**
 * Default Playwright renderer. A caller may inject page/context/browser,
 * playwright itself, or a complete `render` dependency in verifyStandaloneState.
 */
export async function renderStandaloneHtml({ html, state, spec, environment }, options = {}) {
  let browser = options.browser;
  let context = options.context;
  let page = options.page;
  let ownsBrowser = false;
  let ownsContext = false;
  try {
    if (!page) {
      if (!context) {
        if (!browser) {
          const playwright = options.playwright ?? await import('playwright-core');
          const launch = options.launch ?? ((launchOptions) => playwright.chromium.launch(launchOptions));
          browser = await launch({ headless: true, ...(options.launchOptions ?? {}) });
          ownsBrowser = true;
        }
        context = await browser.newContext({
          viewport: environment.viewport,
          deviceScaleFactor: environment.deviceScaleFactor,
          colorScheme: environment.colorScheme,
          reducedMotion: environment.reducedMotion,
          ...(environment.locale ? { locale: environment.locale } : {}),
          ...(environment.timezoneId ? { timezoneId: environment.timezoneId } : {}),
          ...(options.contextOptions ?? {}),
        });
        ownsContext = true;
      }
      page = await context.newPage();
    }
    await page.setContent(documentHtml(html), { waitUntil: 'load' });
    if (environment.fontsCss) await page.addStyleTag({ content: environment.fontsCss });
    if (typeof page.emulateMedia === 'function') {
      await page.emulateMedia({ colorScheme: environment.colorScheme, reducedMotion: environment.reducedMotion });
    }
    await page.evaluate(async () => {
      if (!document.fonts?.ready) return;
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]);
    });
    const inspection = await inspectRenderedRoot(page, state);
    if (inspection.missingRoot) throw new Error(`State ${state.id} normalized HTML has no content root`);
    const root = page.locator('[data-spec-verification-root]').first();
    const png = await root.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    return { png, ...inspection, environment };
  } finally {
    if (ownsContext) await context.close();
    if (ownsBrowser) await browser.close();
  }
}

function structuralChecks(state, rendered, tolerance = 0.5) {
  const expected = {
    width: asNumber(state.rect?.width ?? state.rect?.w, rendered.geometry?.width),
    height: asNumber(state.rect?.height ?? state.rect?.h, rendered.geometry?.height),
  };
  const actual = { width: rendered.geometry?.width ?? null, height: rendered.geometry?.height ?? null };
  const geometry = {
    expected,
    actual,
    delta: {
      width: actual.width === null ? null : actual.width - expected.width,
      height: actual.height === null ? null : actual.height - expected.height,
    },
  };
  geometry.pass = geometry.delta.width !== null && geometry.delta.height !== null
    && Math.abs(geometry.delta.width) <= tolerance && Math.abs(geometry.delta.height) <= tolerance;
  const overflow = { ...(rendered.overflow ?? {}), pass: rendered.overflow ? !rendered.overflow.x && !rendered.overflow.y : false };
  const clipping = { ...(rendered.clipping ?? {}), pass: rendered.clipping ? !rendered.clipping.clipped : false };
  const landmarks = (rendered.landmarks ?? []).map((entry) => ({ ...entry, pass: !entry.required || entry.found }));
  const semanticsPass = landmarks.every((entry) => entry.pass);
  return { geometry, overflow, clipping, landmarks, semanticsPass, pass: geometry.pass && overflow.pass && clipping.pass && semanticsPass };
}

function artifactWriter(outDir, stateId, supplied) {
  if (supplied) return supplied;
  return (name, data) => {
    mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, `${stateId}-${name}`);
    writeFileSync(filePath, data);
    return filePath;
  };
}

function errorResult(kind, stateId, cause) {
  return {
    kind,
    state: stateId ?? null,
    status: STATUS.ERROR,
    error: { name: cause?.name ?? 'Error', message: cause instanceof Error ? cause.message : String(cause) },
    artifacts: {},
  };
}

/** Render and verify one captured frame without attaching to an existing app. */
export async function verifyStandaloneState(bundleDir, stateSelector, options = {}) {
  let stateId = typeof stateSelector === 'object' ? stateSelector?.id : stateSelector;
  try {
    const input = readBundleState(bundleDir, stateSelector);
    stateId = input.state.id;
    if (!input.referencePng) {
      return {
        kind: 'standalone', state: stateId, status: STATUS.PENDING,
        reason: 'reference screenshot unavailable', artifacts: {},
      };
    }
    const environment = renderEnvironment(input.spec, input.state, input.referencePng);
    const render = options.render ?? ((request) => renderStandaloneHtml(request, options));
    const rendered = await render({ html: input.html, state: input.state, spec: input.spec, environment });
    const candidatePng = rendered?.png ?? rendered?.screenshot ?? rendered?.image;
    if (!candidatePng) {
      return { kind: 'standalone', state: stateId, status: STATUS.PENDING, reason: 'renderer returned no screenshot', environment, artifacts: {} };
    }

    const declaredMasks = volatileMasks(input.state, environment.deviceScaleFactor);
    const comparison = comparePngs(input.referencePng, candidatePng, {
      threshold: options.threshold ?? 2,
      pixelThreshold: options.pixelThreshold,
      masks: [...(options.masks ?? []), ...declaredMasks],
      regions: options.regions,
    });
    const checks = structuralChecks(input.state, rendered, options.geometryTolerance ?? 0.5);
    const status = comparison.pass && checks.pass ? STATUS.ACCEPTED : STATUS.REJECTED;
    const outDir = options.outDir ?? path.join(bundleDir, 'verify', 'standalone');
    const writeArtifact = artifactWriter(outDir, stateId, options.writeArtifact);
    const artifacts = {
      reference: input.referencePath,
      candidate: writeArtifact('candidate.png', candidatePng),
      diff: writeArtifact('diff.png', comparison.diffPng),
    };
    const report = {
      kind: 'standalone', state: stateId, status, environment,
      comparison: { ...comparison, diffPng: undefined },
      // An accepted verdict that quietly skipped pixels is the same false success
      // this pipeline exists to remove. Say which regions were excluded and why.
      volatile: (input.state.volatile ?? []).map((region) => ({
        selector: region.selector, reason: region.reason, maskedRects: (region.rects ?? []).length,
      })),
      checks,
      fonts: rendered.fonts ?? null,
      artifacts,
    };
    report.reportHash = hashCanonical({
      kind: report.kind, state: report.state, status: report.status,
      environment: report.environment, comparisonHash: comparison.reportHash, checks: report.checks, fonts: report.fonts,
    });
    artifacts.report = writeArtifact('report.json', `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, candidatePng: Buffer.from(candidatePng), diffPng: comparison.diffPng };
  } catch (cause) {
    return errorResult('standalone', stateId, cause);
  }
}

/** Object-form convenience API for dependency-injected callers. */
export async function verifyStandalone(input, stateSelector, options) {
  if (typeof input === 'string') return verifyStandaloneState(input, stateSelector, options ?? {});
  if (!input || typeof input !== 'object') throw new TypeError('verifyStandalone expects a bundle directory or options object');
  return verifyStandaloneState(input.bundleDir ?? input.bundle, input.state ?? input.stateId, input);
}

function imagePartCandidates(value) {
  if (!value) return [];
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(imagePartCandidates);
  if (typeof value !== 'object') return [];
  const direct = value.type === 'image' || value.data || value.base64 || value.url ? [value] : [];
  return [
    ...direct,
    ...imagePartCandidates(value.content),
    ...imagePartCandidates(value.images),
    ...(value.image ? imagePartCandidates(value.image) : []),
  ];
}

/** Extract PNG bytes from image-only or mixed MCP tool content. */
export function extractMcpImage(result) {
  for (const candidate of imagePartCandidates(result)) {
    if (Buffer.isBuffer(candidate)) return candidate;
    if (candidate instanceof Uint8Array) return Buffer.from(candidate.buffer, candidate.byteOffset, candidate.byteLength);
    const data = typeof candidate === 'string' ? candidate : candidate.data ?? candidate.base64 ?? candidate.url;
    const mimeType = typeof candidate === 'object' ? candidate.mimeType ?? candidate.mediaType : null;
    if (mimeType && mimeType !== 'image/png') continue;
    if (typeof data !== 'string') continue;
    const match = data.match(/^data:image\/png;base64,(.+)$/s);
    try {
      const bytes = Buffer.from(match ? match[1] : data, 'base64');
      if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return bytes;
    } catch { /* try the next content part */ }
  }
  return null;
}

function unavailableResult(stateId, cause, ids = {}) {
  return {
    kind: 'paper-round-trip', state: stateId ?? null, status: STATUS.UNAVAILABLE,
    reason: cause instanceof Error ? cause.message : String(cause),
    file: ids.file ?? null, page: ids.page ?? null, fileId: ids.fileId ?? null,
    pageId: ids.pageId ?? null, nodeId: ids.nodeId ?? null, artifacts: {},
  };
}

/** Import one state into Paper, screenshot the resulting node, and verify it. */
export async function verifyPaperRoundTrip(bundleDir, stateSelector, options = {}) {
  let input;
  try { input = readBundleState(bundleDir, stateSelector); } catch (cause) { return errorResult('paper-round-trip', stateSelector, cause); }
  const stateId = input.state.id;
  if (!input.referencePng) return { kind: 'paper-round-trip', state: stateId, status: STATUS.PENDING, reason: 'reference screenshot unavailable', artifacts: {} };

  let client = options.client;
  if (!client) {
    try { client = await new PaperClient(options.endpoint).connect(); } catch (cause) { return unavailableResult(stateId, cause); }
  }

  let imported;
  try {
    const result = await importBundle(bundleDir, {
      only: stateId,
      limit: 1,
      fileId: options.fileId,
      client,
      ledger: options.ledger,
      ledgerPath: options.ledgerPath,
      onConflict: options.onConflict ?? 'conflict',
    });
    imported = { result, record: result.imported[0] };
  } catch (cause) {
    return unavailableResult(stateId, cause);
  }

  const ids = {
    file: imported.result.file,
    page: imported.result.page,
    fileId: imported.result.fileId ?? options.fileId ?? null,
    pageId: imported.result.pageId ?? null,
    nodeId: imported.record?.nodeId ?? null,
  };
  if (!imported.record) return errorResult('paper-round-trip', stateId, new Error('Paper import returned no state record'));
  if (imported.record.action === 'conflict') {
    return { kind: 'paper-round-trip', state: stateId, status: STATUS.REJECTED, reason: 'Paper import ledger conflict', ...ids, import: imported.record, artifacts: {} };
  }
  if (imported.record.fitStatus === 'failed' || imported.record.fitToContent === null) {
    return { kind: 'paper-round-trip', state: stateId, status: STATUS.REJECTED, reason: 'Paper artboard fitToContent failed', ...ids, import: imported.record, artifacts: {} };
  }

  let screenshotResponse;
  try {
    screenshotResponse = await client.call('get_screenshot', {
      nodeId: ids.nodeId,
      ...(options.scale ? { scale: options.scale } : {}),
      ...(ids.fileId ? { fileId: ids.fileId } : {}),
    });
  } catch (cause) {
    return unavailableResult(stateId, cause, ids);
  }
  const paperPng = extractMcpImage(screenshotResponse);
  if (!paperPng) return unavailableResult(stateId, new Error('Paper get_screenshot returned no PNG image content'), ids);

  let standalone = options.standaloneResult;
  if (!standalone && options.standalone !== false) {
    const verify = options.verifyStandalone ?? verifyStandaloneState;
    standalone = await verify(bundleDir, stateId, { ...options.standaloneOptions, threshold: options.threshold, masks: options.masks, regions: options.regions });
  }

  let sourceComparison;
  let standaloneComparison = null;
  try {
    sourceComparison = comparePngs(input.referencePng, paperPng, {
      threshold: options.threshold ?? 2,
      pixelThreshold: options.pixelThreshold,
      masks: options.masks,
      regions: options.regions,
    });
    const standalonePng = options.standalonePng ?? standalone?.candidatePng ?? standalone?.image;
    if (standalonePng) standaloneComparison = comparePngs(standalonePng, paperPng, {
      threshold: options.threshold ?? 2,
      pixelThreshold: options.pixelThreshold,
      masks: options.masks,
      regions: options.regions,
    });
  } catch (cause) {
    return errorResult('paper-round-trip', stateId, cause);
  }

  const standaloneRequired = options.standalone !== false;
  const standaloneReady = !standaloneRequired || standaloneComparison !== null;
  const standaloneAccepted = !standaloneRequired
    || options.standalonePng
    || standalone?.status === STATUS.ACCEPTED;
  const status = !standaloneReady
    ? STATUS.PENDING
    : sourceComparison.pass && (!standaloneComparison || standaloneComparison.pass) && standaloneAccepted
      ? STATUS.ACCEPTED
      : STATUS.REJECTED;
  const outDir = options.outDir ?? path.join(bundleDir, 'verify', 'paper');
  const writeArtifact = artifactWriter(outDir, stateId, options.writeArtifact);
  const artifacts = {
    source: input.referencePath,
    paper: writeArtifact('paper.png', paperPng),
    sourceDiff: writeArtifact('source-diff.png', sourceComparison.diffPng),
  };
  if (standaloneComparison) artifacts.standaloneDiff = writeArtifact('standalone-diff.png', standaloneComparison.diffPng);
  const report = {
    kind: 'paper-round-trip', state: stateId, status, ...ids,
    import: imported.record,
    source: { ...sourceComparison, diffPng: undefined },
    standalone: standaloneComparison ? { ...standaloneComparison, diffPng: undefined } : { status: standalone?.status ?? STATUS.PENDING },
    dimensions: {
      source: sourceComparison.referenceSize,
      paper: sourceComparison.candidateSize,
      standalone: standaloneComparison?.referenceSize ?? null,
    },
    artifacts,
  };
  report.reportHash = hashCanonical({
    kind: report.kind, state: report.state, status: report.status,
    fileId: report.fileId, pageId: report.pageId, nodeId: report.nodeId,
    frameDigest: imported.record.frameDigest,
    sourceHash: sourceComparison.reportHash,
    standaloneHash: standaloneComparison?.reportHash ?? null,
  });
  artifacts.report = writeArtifact('report.json', `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, paperPng };
}

export async function verifyPaper(input, stateSelector, options) {
  if (typeof input === 'string') return verifyPaperRoundTrip(input, stateSelector, options ?? {});
  if (!input || typeof input !== 'object') throw new TypeError('verifyPaper expects a bundle directory or options object');
  return verifyPaperRoundTrip(input.bundleDir ?? input.bundle, input.state ?? input.stateId, input);
}

export const verifyStandaloneCapture = verifyStandaloneState;
export const verifyPaperState = verifyPaperRoundTrip;
export const verifyPaperRoundTripState = verifyPaperRoundTrip;
export const verificationStatuses = STATUS;
