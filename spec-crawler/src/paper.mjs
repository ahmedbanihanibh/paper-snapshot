/**
 * Push a spec bundle into Paper.
 *
 * Talks to the Paper MCP desktop app over its local HTTP transport and uses
 * `write_html`, so frames land as real design nodes without touching the
 * clipboard, focusing the app, or driving ⌘V. The clipboard path in bundle.mjs
 * remains for one-off manual pastes; this is the batch route.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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
    const text = result?.content?.find((part) => part.type === 'text')?.text;
    if (result?.isError) throw new Error(`${name}: ${text ?? 'tool error'}`);
    try {
      return text ? JSON.parse(text) : result;
    } catch {
      return text ?? result;
    }
  }

  info() {
    return this.call('get_basic_info');
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
export function normalizeFrameRoot(html) {
  // A Paper frame is `capturedAnimationsStyle + rawHtml`, so any surface with
  // @keyframes begins with a <style> block. Matching the literal first tag finds
  // that block, neutralises nothing, and the panel keeps its viewport offsets —
  // which then render it outside its own artboard. Skip leading style/comment
  // nodes and operate on the first *content* element.
  const prelude = html.match(/^(?:\s*(?:<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->))*\s*/i)?.[0] ?? '';
  const body = html.slice(prelude.length);

  const openingTag = body.match(/^<([a-z][\w-]*)\b([^>]*)>/i);
  if (!openingTag) return html;

  const [full, tagName, attributes] = openingTag;
  const styleMatch = attributes.match(/\sstyle="([^"]*)"/i);
  if (!styleMatch) return html;

  const declarations = styleMatch[1]
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const property = declaration.split(':')[0]?.trim().toLowerCase();
      // Offsets and their logical equivalents are what displace the content.
      return !/^(top|left|right|bottom|inset|inset-block|inset-inline|inset-block-start|inset-block-end|inset-inline-start|inset-inline-end)$/.test(property ?? '');
    })
    .map((declaration) => {
      const [property, ...rest] = declaration.split(':');
      if (!/^\s*position\s*$/i.test(property)) return declaration;
      const value = rest.join(':').trim().toLowerCase();
      // `relative` keeps it a containing block for absolutely-positioned
      // descendants, which `static` would silently reparent to the artboard.
      return ['absolute', 'fixed', 'sticky'].includes(value) ? 'position: relative' : declaration;
    });

  const nextAttributes = attributes.replace(styleMatch[0], ` style="${declarations.join('; ')}"`);
  // Reassemble rather than string-replacing into the original: the same opening
  // tag text can legitimately appear again deeper in the document.

  // Paper's write_html drops every inline style on a <body> root when it maps
  // the tag into a frame — measured 2026-08-11: the imported wrapper kept only
  // height/overflow/position, so the page GROUND (body's background-color,
  // lch(2.595 0.4 272) on Linear) vanished and every transparent surface —
  // the sidebar above all — composited over the artboard's white. Demote a
  // body root to a <div> so its ground survives the import.
  if (tagName.toLowerCase() === 'body') {
    const rest = body.slice(full.length);
    const closing = rest.lastIndexOf('</body>');
    const inner = closing === -1 ? rest : rest.slice(0, closing) + '</div>' + rest.slice(closing + '</body>'.length);
    return prelude + `<div${nextAttributes}>` + inner;
  }
  return prelude + `<${tagName}${nextAttributes}>` + body.slice(full.length);
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
    const summary = typeof tree === 'string' ? tree : tree?.summary ?? '';
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

/**
 * Create one artboard per captured state and write its frame into it.
 *
 * @param {string} bundleDir
 * @param {{only?: string, limit?: number, fileId?: string, dryRun?: boolean, onProgress?: Function}} options
 */
export async function importBundle(bundleDir, options = {}) {
  const { only, limit = Infinity, fileId, dryRun = false, evidence = false, onProgress = () => {} } = options;

  const spec = JSON.parse(readFileSync(path.join(bundleDir, 'spec.json'), 'utf8'));
  let states = spec.states ?? [];
  if (only) {
    const needle = String(only);
    states = states.filter((state) => state.id === needle || state.id.startsWith(needle) || state.id.includes(needle));
    if (states.length === 0) throw new Error(`No state matching "${needle}".`);
  }
  states = states.slice(0, limit);

  const client = await new PaperClient().connect();
  const target = await client.info();
  const imported = [];

  for (const state of states) {
    const html = normalizeFrameRoot(readFileSync(path.join(bundleDir, state.frame), 'utf8'));
    onProgress({ state, target: target.fileName });
    if (dryRun) { imported.push({ id: state.id, bytes: html.length, dryRun: true }); continue; }

    // create_artboard requires whole pixel values — passing "fit-content" here
    // yields a zero-height artboard that renders nothing, even though its
    // children are correct. Size it from the capture, then relax the height
    // once the content is in, which is the flow Paper's own guidance describes.
    const width = Math.max(64, Math.round(state.rect?.width ?? state.rect?.w ?? 800));
    const height = Math.max(64, Math.round(state.rect?.height ?? state.rect?.h ?? 600));

    const artboard = await client.call('create_artboard', {
      name: `${state.id} (${state.kind})`,
      styles: {
        display: 'flex',
        flexDirection: 'column',
        width: `${width}px`,
        height: `${height}px`,
        padding: '0px',
        // Paper artboards default to white. Any area the surface doesn't cover
        // then reads as a white band, which looks like a capture bug.
        backgroundColor: 'transparent',
      },
      ...(fileId ? { fileId } : {}),
    });

    const nodeId = artboard?.nodeId ?? artboard?.id ?? artboard;
    await client.call('write_html', {
      html,
      targetNodeId: nodeId,
      mode: 'insert-children',
      ...(fileId ? { fileId } : {}),
    });

    await fitToContent(client, nodeId, fileId);

    const record = { id: state.id, nodeId, kind: state.kind, level: state.level };

    if (evidence) {
      const card = await client.call('create_artboard', {
        name: `${state.id} — evidence`,
        styles: { display: 'flex', flexDirection: 'column', width: '760px', height: '600px', padding: '0px', backgroundColor: 'transparent' },
        ...(fileId ? { fileId } : {}),
      });
      const cardId = card?.nodeId ?? card?.id ?? card;
      await client.call('write_html', { html: evidenceHtml(bundleDir, state), targetNodeId: cardId, mode: 'insert-children', ...(fileId ? { fileId } : {}) });
      await fitToContent(client, cardId, fileId);
      record.evidenceNodeId = cardId;
    }

    imported.push(record);
  }

  return { file: target.fileName, page: target.pageName, imported };
}
