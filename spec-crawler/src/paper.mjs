/**
 * Push a spec bundle into Paper.
 *
 * Talks to the Paper MCP desktop app over its local HTTP transport and uses
 * `write_html`, so frames land as real design nodes without touching the
 * clipboard, focusing the app, or driving ⌘V. The clipboard path in bundle.mjs
 * remains for one-off manual pastes; this is the batch route.
 */

import { readFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hashCanonical, sha256 } from './hashes.mjs';

const DEFAULT_ENDPOINT = process.env.PAPER_MCP_URL ?? 'http://127.0.0.1:29979/mcp';

export class PaperClient {
  #sessionId = null;

  constructor(endpoint = DEFAULT_ENDPOINT) {
    this.endpoint = endpoint;
  }

  async #rpc(method, params) {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.#sessionId) headers['mcp-session-id'] = this.#sessionId;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    this.#sessionId ??= response.headers.get('mcp-session-id');

    const body = await response.text();
    // The transport may answer as SSE; the payload is the single data frame.
    const frame = body.split('\n').find((line) => line.startsWith('data:'));
    const message = JSON.parse(frame ? frame.slice(5).trim() : body);
    if (message.error) throw new Error(`${method}: ${message.error.message ?? JSON.stringify(message.error)}`);
    return message.result;
  }

  async connect() {
    await this.#rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'spec-crawler', version: '0.1.0' },
    });
    return this;
  }

  async call(name, args = {}) {
    const result = await this.#rpc('tools/call', { name, arguments: args });
    const content = Array.isArray(result?.content) ? result.content : [];
    const texts = content.filter((part) => part?.type === 'text').map((part) => String(part.text ?? ''));
    if (result?.isError) throw new Error(`${name}: ${texts.filter(Boolean).join('\n') || 'tool error'}`);

    // Keep the original compatibility surface for the overwhelmingly common
    // single-text response. Mixed, image-only, and multi-text responses retain
    // every MCP content part instead of silently discarding all but one string.
    if (content.length === 1 && content[0]?.type === 'text') {
      const text = texts[0];
      try { return text ? JSON.parse(text) : text; } catch { return text; }
    }
    if (content.length === 0) return result;

    const parsedTexts = texts.map((text) => {
      try { return JSON.parse(text); } catch { return text; }
    });
    return {
      ...result,
      content: content.map((part) => ({ ...part })),
      text: texts.join('\n'),
      texts,
      parsedTexts,
      images: content.filter((part) => part?.type === 'image').map((part) => ({ ...part })),
    };
  }

  info(args = {}) {
    return this.call('get_basic_info', args);
  }
}

/**
 * Neutralise the captured surface's page positioning.
 *
 * An overlay is serialized exactly as it sat on the page — typically
 * `position: absolute; top: 139px; left: 535px`. Dropped into an artboard those
 * coordinates are measured from the artboard instead of the viewport, so the
 * content renders far outside its frame and the artboard looks empty while its
 * subtree is perfectly correct.
 *
 * Only the outermost element is touched; interior positioning is real layout
 * and must survive untouched. The bundle file itself is never modified — this
 * is applied on the way into Paper.
 */
function splitCssDeclarations(style) {
  const declarations = [];
  let start = 0;
  let quote = null;
  let depth = 0;
  let escaped = false;
  for (let index = 0; index < style.length; index += 1) {
    const character = style[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ';' && depth === 0) {
      declarations.push(style.slice(start, index));
      start = index + 1;
    }
  }
  declarations.push(style.slice(start));
  return declarations;
}

export function normalizeFrameRoot(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  // Frames may begin with animation CSS, comments, or a doctype. These are
  // preserved byte-for-byte while normalization targets the first content root.
  const prelude = html.match(/^(?:\s*(?:<!doctype\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->))*\s*/i)?.[0] ?? '';
  const source = html.slice(prelude.length);
  const openingTag = source.match(/^<([a-z][\w:-]*)\b([^>]*)>/i);
  if (!openingTag) return html;

  const [full, originalTagName, originalAttributes] = openingTag;
  let attributes = originalAttributes;
  const styleMatch = attributes.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  if (styleMatch) {
    const declarations = splitCssDeclarations(styleMatch[2])
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((declaration) => {
        const property = declaration.split(':')[0]?.trim().toLowerCase();
        return !/^(top|left|right|bottom|inset|inset-block|inset-inline|inset-block-start|inset-block-end|inset-inline-start|inset-inline-end)$/.test(property ?? '');
      })
      .map((declaration) => {
        const [property, ...rest] = declaration.split(':');
        if (!/^\s*position\s*$/i.test(property)) return declaration;
        const value = rest.join(':').trim().toLowerCase().replace(/\s*!important\s*$/, '');
        // Keeping a containing block is essential: static would change the
        // coordinate system of every positioned descendant.
        return ['absolute', 'fixed', 'sticky'].includes(value) ? 'position: relative' : declaration;
      });
    attributes = attributes.replace(styleMatch[0], ` style=${styleMatch[1]}${declarations.join('; ')}${styleMatch[1]}`);
  }

  let tagName = originalTagName;
  let tail = source.slice(full.length);
  if (originalTagName.toLowerCase() === 'body') {
    tagName = 'div';
    const matches = [...tail.matchAll(/<\/body\s*>/gi)];
    const closing = matches.at(-1);
    if (closing) tail = `${tail.slice(0, closing.index)}</div>${tail.slice(closing.index + closing[0].length)}`;
  }
  return `${prelude}<${tagName}${attributes}>${tail}`;
}

/**
 * PNG intrinsic size, straight from the IHDR chunk.
 *
 * Paper resolves an <img> to a Rectangle with an image fill, and a percentage
 * width with no height gives it no aspect ratio to work from — the rectangle
 * collapses to a couple of pixels. Both dimensions have to be explicit.
 */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * An evidence card for one captured state.
 *
 * The component artboard shows *what* the surface looks like. This shows how it
 * was reached: the annotated viewport with trigger and surface outlined, the
 * anchor expressed as side/align/gap, and the state matrix summary. Embedded as
 * a data URI so the Paper file is self-contained — an implementing agent reading
 * the design does not also need the bundle directory on disk.
 */
function evidenceHtml(bundleDir, state) {
  // For a virtualized section the cropped band IS the subject; the viewport
  // shot buries it in the rest of the app.
  const shotRel = state.virtualized
    ? (state.shots?.surface ?? state.shots?.context ?? state.shot)
    : (state.shots?.context ?? state.shots?.surface ?? state.shot);
  const shotPath = shotRel ? path.join(bundleDir, shotRel) : null;
  let image = null;
  let imageSize = null;
  if (shotPath && existsSync(shotPath)) {
    const bytes = readFileSync(shotPath);
    image = `data:image/png;base64,${bytes.toString('base64')}`;
    const natural = pngSize(bytes);
    if (natural) {
      const width = 720;
      imageSize = { width, height: Math.round((natural.height / natural.width) * width) };
    }
  }

  const anchor = state.anchor
    ? `${state.anchor.side} / ${state.anchor.align} · gap ${state.anchor.gap}px`
    : 'not recorded';
  const evidence = state.roleEvidence ?? {};
  const rows = [
    ['kind', `${state.kind}`],
    ['trigger', state.trigger?.label ? `"${state.trigger.label}"` : '—'],
    ['anchor', anchor],
    ['size', state.rect ? `${Math.round(state.rect.width ?? state.rect.w ?? 0)} × ${Math.round(state.rect.height ?? state.rect.h ?? 0)}` : '—'],
    ['detected', state.detectedBy ?? '—'],
    ['role evidence', `haspopup=${evidence.triggerHasPopup ?? '—'} · inner=${evidence.innerRole ?? '—'} · container=${evidence.containerRole ?? '—'}`],
    ['css states', state.cssStates ? `${state.cssStates.components} components · ${(state.cssStates.stateNames ?? []).join(', ') || 'none'}` : '—'],
    ['path', (state.path ?? []).length ? state.path.map((k) => k.split('|')[2] || k).join(' → ') : 'root'],
    ...(state.virtualized ? [['virtualized', state.virtualized.note]] : []),
    ...(state.notes ? [['notes', state.notes]] : []),
  ];

  // Motion is part of the spec, not a footnote: a static frame pair says what the
  // two states look like, never how one becomes the other.
  const motion = state.animation?.nodes?.length
    ? (() => {
      const node = state.animation.nodes
        .filter((entry) => Object.keys(entry.properties ?? {}).length)
        .sort((a, b) => Object.keys(b.properties).length - Object.keys(a.properties).length)[0];
      if (!node) return null;
      const easing = String(node.fit.easing ?? '');
      return {
        summary: node.fit.type === 'spring'
          ? `spring · stiffness ${node.fit.stiffness} · damping ${node.fit.damping}`
          : `${Math.round(node.fit.duration ?? 0)}ms · ${easing.length > 46 ? `${easing.slice(0, 43)}…` : easing}`,
        properties: Object.entries(node.properties).map(([key, value]) => `${key} ${value.from}→${value.to} (${value.durationMs}ms)`).join(' · '),
        confidence: node.agreement,
      };
    })()
    : null;

  if (motion) {
    rows.push(['motion', motion.summary]);
    rows.push(['motion props', motion.properties]);
    rows.push(['motion check', motion.confidence]);
  }

  return `<div style="display: flex; flex-direction: column; gap: 14px; padding: 20px; background-color: #0F1011; border-radius: 12px; font-family: Inter, system-ui, sans-serif;">
  <div style="display: flex; flex-direction: column; gap: 4px;">
    <div style="font-size: 15px; font-weight: 600; color: #F7F8F8;">${escapeHtml(state.id)}</div>
    <div style="font-size: 12px; color: #8A8F98;">how this surface is wired up</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 6px;">
    ${rows.map(([key, value]) => `<div style="display: flex; gap: 10px; font-size: 12px; line-height: 18px;"><div style="width: 108px; color: #8A8F98; flex-shrink: 0;">${escapeHtml(key)}</div><div style="color: #E6E6E6;">${escapeHtml(value)}</div></div>`).join('\n    ')}
  </div>
  ${image ? `<img src="${image}" style="width: ${imageSize?.width ?? 720}px; height: ${imageSize?.height ?? 405}px; border-radius: 8px; border: 1px solid #23252A;" />` : '<div style="font-size: 12px; color: #8A8F98;">no screenshot captured</div>'}
</div>`;
}

/**
 * Resize an artboard to its content's real height.
 *
 * Artboards clip their content, and `height: "fit-content"` is not honoured on
 * them — an oversized fixed height leaves dead space, an undersized one silently
 * cuts the bottom off. Since `get_screenshot` on the artboard is the obvious way
 * to read one of these, a clipped artboard hands an implementing agent a
 * truncated image and no hint that anything is missing. Measuring the child that
 * was just written is the only reliable size.
 */
export async function fitToContent(client, nodeId, fileId) {
  try {
    const tree = await client.call('get_tree_summary', { nodeId, depth: 1, ...(fileId ? { fileId } : {}) });
    const contentText = Array.isArray(tree?.content)
      ? tree.content.filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('\n')
      : '';
    const summary = typeof tree === 'string' ? tree : tree?.summary ?? tree?.text ?? tree?.texts?.join('\n') ?? contentText;
    // Child rows look like: `  Frame "Frame" (2TX-0) 760×294`
    const heights = Array.from(summary.matchAll(/\)\s+\d+(?:\.\d+)?×(\d+(?:\.\d+)?)/g))
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);
    // First match is the artboard itself; the rest are its children.
    const content = Math.max(...heights.slice(1), 0);
    if (!content) return null;
    await client.call('update_styles', { updates: [{ nodeIds: [nodeId], styles: { height: `${Math.ceil(content)}px` } }], ...(fileId ? { fileId } : {}) });
    return content;
  } catch (cause) {
    // Surfaced rather than swallowed: this failing silently is exactly how every
    // artboard kept a wrong fixed height across several imports.
    console.error(`  ! could not resize ${nodeId}: ${cause instanceof Error ? cause.message.split('\n')[0] : cause}`);
    return null;
  }
}

const IMPORT_LEDGER_VERSION = 1;
const DEFAULT_LEDGER_NAME = '.paper-import-ledger.json';

/** Durable idempotency ledger for Paper imports. */
export class ImportLedger {
  constructor(filePath, { fs = { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } } = {}) {
    this.filePath = filePath;
    this.fs = fs;
    this.document = { version: IMPORT_LEDGER_VERSION, entries: {} };
    if (!filePath || !fs.existsSync(filePath)) return;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (cause) {
      throw new SyntaxError(`Malformed Paper import ledger at ${filePath}: ${cause.message}`, { cause });
    }
    if (parsed?.version !== IMPORT_LEDGER_VERSION || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      throw new TypeError(`Invalid Paper import ledger at ${filePath}`);
    }
    this.document = parsed;
  }

  key({ bundleKey, bundleDigest, stateId, target }) {
    return hashCanonical({
      bundleKey: bundleKey ?? bundleDigest,
      stateId,
      target: {
        fileId: target.fileId ?? null,
        pageId: target.pageId ?? null,
        file: target.fileId ? null : target.file ?? null,
        page: target.pageId ? null : target.page ?? null,
      },
    });
  }

  inspect(input, { onConflict = 'conflict' } = {}) {
    const key = this.key(input);
    const existing = this.document.entries[key] ?? null;
    if (!existing) return { key, action: 'create', existing: null };
    if (existing.frameDigest === input.frameDigest) {
      return { key, action: existing.status === 'rejected' ? 'update' : 'skip', existing };
    }
    return { key, action: onConflict === 'update' ? 'update' : 'conflict', existing };
  }

  commit(key, record) {
    this.document.entries[key] = { ...record };
    if (!this.filePath) return;
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    this.fs.writeFileSync(temporary, `${JSON.stringify(this.document, null, 2)}\n`);
    this.fs.renameSync(temporary, this.filePath);
  }
}

export const PaperImportLedger = ImportLedger;

function targetIdentity(target, explicitFileId) {
  return {
    fileId: explicitFileId ?? target?.fileId ?? target?.file?.id ?? target?.id ?? null,
    pageId: target?.pageId ?? target?.page?.id ?? null,
    file: target?.fileName ?? target?.file?.name ?? (typeof target?.file === 'string' ? target.file : null) ?? '(unknown file)',
    page: target?.pageName ?? target?.page?.name ?? (typeof target?.page === 'string' ? target.page : null) ?? '(unknown page)',
  };
}

function artboardId(value) {
  return value?.nodeId ?? value?.id ?? value;
}

async function createStateArtboard(client, state, html, fileId) {
  const width = Math.max(64, Math.round(state.rect?.width ?? state.rect?.w ?? 800));
  const height = Math.max(64, Math.round(state.rect?.height ?? state.rect?.h ?? 600));
  const artboard = await client.call('create_artboard', {
    name: `${state.id} (${state.kind})`,
    styles: {
      display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`,
      padding: '0px', backgroundColor: 'transparent',
    },
    ...(fileId ? { fileId } : {}),
  });
  const nodeId = artboardId(artboard);
  if (!nodeId) throw new Error(`Paper did not return a node id for ${state.id}`);
  await client.call('write_html', { html, targetNodeId: nodeId, mode: 'insert-children', ...(fileId ? { fileId } : {}) });
  return { nodeId, width, height };
}

async function replaceArtboardContent(client, nodeId, html, styles, fileId) {
  const children = await client.call('get_children', { nodeId, ...(fileId ? { fileId } : {}) });
  const list = Array.isArray(children) ? children : children?.children ?? [];
  const childIds = list.map((child) => child?.id ?? child?.nodeId).filter(Boolean);
  if (childIds.length) await client.call('delete_nodes', { nodeIds: childIds, ...(fileId ? { fileId } : {}) });
  await client.call('update_styles', { updates: [{ nodeIds: [nodeId], styles }], ...(fileId ? { fileId } : {}) });
  await client.call('write_html', { html, targetNodeId: nodeId, mode: 'insert-children', ...(fileId ? { fileId } : {}) });
}

async function updateStateArtboard(client, nodeId, state, html, fileId) {
  if (!nodeId) throw new Error(`Cannot update ${state.id}: the ledger has no Paper node id`);
  const width = Math.max(64, Math.round(state.rect?.width ?? state.rect?.w ?? 800));
  const height = Math.max(64, Math.round(state.rect?.height ?? state.rect?.h ?? 600));
  await replaceArtboardContent(client, nodeId, html, {
    width: `${width}px`, height: `${height}px`, padding: '0px', backgroundColor: 'transparent',
  }, fileId);
  return { nodeId, width, height };
}

/**
 * Create one artboard per captured state and write its frame into it.
 *
 * @param {string} bundleDir
 * @param {{only?: string, limit?: number, fileId?: string, dryRun?: boolean, onProgress?: Function, client?: object, ledger?: ImportLedger, ledgerPath?: string, onConflict?: 'conflict'|'update'}} options
 */
export async function importBundle(bundleDir, options = {}) {
  const {
    only, limit = Infinity, fileId, dryRun = false, evidence = false,
    onProgress = () => {}, onConflict = 'conflict',
  } = options;
  if (!['conflict', 'update'].includes(onConflict)) throw new TypeError('onConflict must be "conflict" or "update"');

  const specPath = path.join(bundleDir, 'spec.json');
  const specSource = readFileSync(specPath, 'utf8');
  const spec = JSON.parse(specSource);
  const bundleDigest = spec.hashes?.artifact ?? sha256(specSource);
  const bundleKey = spec.provenance?.bundleId ?? spec.bundleId ?? hashCanonical({ path: path.resolve(bundleDir) });
  let states = spec.states ?? [];
  if (only) {
    const needle = String(only);
    states = states.filter((state) => state.id === needle || state.id.startsWith(needle) || state.id.includes(needle));
    if (states.length === 0) throw new Error(`No state matching "${needle}".`);
  }
  states = states.slice(0, limit);
  const preparedStates = states.map((state) => {
    if (!state.frame) throw new Error(`State ${state.id} has no captured frame`);
    const framePath = path.join(bundleDir, state.frame);
    if (!existsSync(framePath)) throw new Error(`State ${state.id} frame is missing: ${framePath}`);
    const html = normalizeFrameRoot(readFileSync(framePath, 'utf8'));
    return { state, html, frameDigest: sha256(html) };
  });

  const client = options.client ?? await new PaperClient().connect();
  const infoArgs = fileId ? { fileId } : {};
  const target = typeof client.info === 'function' ? await client.info(infoArgs) : await client.call('get_basic_info', infoArgs);
  const targetId = targetIdentity(target, fileId);
  const ledger = options.ledger ?? new ImportLedger(options.ledgerPath ?? path.join(bundleDir, DEFAULT_LEDGER_NAME));
  const imported = [];
  const skipped = [];
  const conflicts = [];
  const updated = [];

  for (const { state, html, frameDigest } of preparedStates) {
    const ledgerInput = { bundleKey, bundleDigest, stateId: state.id, frameDigest, target: targetId };
    const decision = ledger.inspect(ledgerInput, { onConflict });
    onProgress({ state, target: targetId.file, action: decision.action });

    if (decision.action === 'skip') {
      const record = {
        id: state.id, nodeId: decision.existing.nodeId, kind: state.kind, level: state.level,
        action: 'skip', skipped: true, frameDigest, fitToContent: decision.existing.fitToContent ?? null,
        fitStatus: decision.existing.fitStatus ?? 'unknown', status: decision.existing.status ?? 'accepted',
        evidenceNodeId: decision.existing.evidenceNodeId,
      };
      imported.push(record);
      skipped.push(record);
      continue;
    }
    if (decision.action === 'conflict') {
      const record = {
        id: state.id, nodeId: decision.existing.nodeId, kind: state.kind, level: state.level,
        action: 'conflict', conflict: true, frameDigest, existingFrameDigest: decision.existing.frameDigest,
        status: 'conflict',
      };
      imported.push(record);
      conflicts.push(record);
      continue;
    }
    if (dryRun) {
      imported.push({
        id: state.id, nodeId: decision.existing?.nodeId, kind: state.kind, level: state.level,
        bytes: Buffer.byteLength(html), dryRun: true, action: decision.action, frameDigest,
      });
      continue;
    }

    const written = decision.action === 'update'
      ? await updateStateArtboard(client, decision.existing?.nodeId, state, html, fileId)
      : await createStateArtboard(client, state, html, fileId);
    const fitHeight = await fitToContent(client, written.nodeId, fileId);
    const record = {
      id: state.id,
      nodeId: written.nodeId,
      kind: state.kind,
      level: state.level,
      action: decision.action,
      updated: decision.action === 'update',
      frameDigest,
      fitToContent: fitHeight,
      fitStatus: fitHeight === null ? 'failed' : 'fitted',
      status: fitHeight === null ? 'rejected' : 'accepted',
    };

    if (evidence) {
      const cardHtml = evidenceHtml(bundleDir, state);
      let cardId = decision.action === 'update' ? decision.existing?.evidenceNodeId : null;
      if (cardId) {
        await replaceArtboardContent(client, cardId, cardHtml, {
          width: '760px', height: '600px', padding: '0px', backgroundColor: 'transparent',
        }, fileId);
      } else {
        const card = await client.call('create_artboard', {
          name: `${state.id} — evidence`,
          styles: { display: 'flex', flexDirection: 'column', width: '760px', height: '600px', padding: '0px', backgroundColor: 'transparent' },
          ...(fileId ? { fileId } : {}),
        });
        cardId = artboardId(card);
        await client.call('write_html', { html: cardHtml, targetNodeId: cardId, mode: 'insert-children', ...(fileId ? { fileId } : {}) });
      }
      record.evidenceFitToContent = await fitToContent(client, cardId, fileId);
      record.evidenceNodeId = cardId;
    }

    ledger.commit(decision.key, {
      bundleKey,
      bundleDigest,
      stateId: state.id,
      frameDigest,
      target: targetId,
      nodeId: record.nodeId,
      evidenceNodeId: record.evidenceNodeId,
      fitToContent: record.fitToContent,
      fitStatus: record.fitStatus,
      status: record.status,
    });
    imported.push(record);
    if (record.updated) updated.push(record);
  }

  return {
    file: targetId.file,
    page: targetId.page,
    fileId: targetId.fileId,
    pageId: targetId.pageId,
    imported,
    skipped,
    conflicts,
    // Surfaced as its own list because every caller so far read only `imported`
    // and `conflicts`. A state whose fitToContent failed keeps the fallback
    // artboard height, so its frame is CLIPPED — and it was being printed and
    // counted exactly like a healthy one. A truncated artboard hands the next
    // agent a screenshot with no hint that anything is missing.
    rejected: imported.filter((record) => record.status === 'rejected'),
    updated,
    bundleKey,
    bundleDigest,
    ledgerPath: ledger.filePath ?? null,
    dryRun,
  };
}
