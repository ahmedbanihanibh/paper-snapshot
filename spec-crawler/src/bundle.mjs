/**
 * The spec bundle — the artifact everything else produces and consumes.
 *
 * Layout:
 *   <out>/spec.json          index of every captured state
 *   <out>/frames/<id>.html   Paper-pasteable HTML (inline computed styles)
 *   <out>/shots/<id>.png     screenshot of that state
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { animationContract, animationChecklist } from './contract.mjs';

export class Bundle {
  #states = [];
  #hashes = new Set();

  /**
   * @param {string} outDir
   * @param {object} meta
   * @param {{fresh?: boolean}} [options]  `fresh: true` wipes an existing bundle.
   *
   * Resuming is the default because the destructive one was a trap. Constructing
   * a Bundle over a directory that already held captures used to delete them —
   * which is exactly what happens when a session re-attaches mid-run to get back
   * to a page. Two captures were lost that way, silently, and the only symptom
   * was `bundle_write` reporting zero states afterwards.
   *
   * So an existing bundle is now loaded and appended to. Numbering continues
   * from what is already there, and the dedupe set is rebuilt from the recorded
   * hashes so a resumed run still recognises a state it captured before the
   * interruption. Wiping is still available, but it has to be asked for.
   */
  constructor(outDir, meta = {}, { fresh = false } = {}) {
    this.outDir = path.resolve(outDir);
    this.meta = meta;

    const specPath = path.join(this.outDir, 'spec.json');
    const existing = !fresh && existsSync(specPath)
      ? (() => { try { return JSON.parse(readFileSync(specPath, 'utf8')); } catch { return null; } })()
      : null;

    if (existing?.states?.length) {
      this.#states = existing.states;
      for (const state of existing.states) if (state.hash) this.#hashes.add(state.hash);
      this.resumed = existing.states.length;
    } else {
      // Nothing to preserve: artifacts are numbered per run, so leaving a
      // half-written previous run in place produces a directory where spec.json
      // lists six states next to thirteen screenshots under colliding names.
      // Only our own subdirectories are cleared — anything else is left alone.
      for (const dir of ['frames', 'shots', 'jsx', 'states', 'debug', 'contracts']) {
        rmSync(path.join(this.outDir, dir), { recursive: true, force: true });
      }
      this.resumed = 0;
    }

    mkdirSync(path.join(this.outDir, 'frames'), { recursive: true });
    mkdirSync(path.join(this.outDir, 'shots'), { recursive: true });
  }

  /** True if a structurally identical state was already captured. */
  seen(hash) {
    return hash ? this.#hashes.has(hash) : false;
  }

  /**
   * @param {object} state             {name, tier, kind, trigger, rect, hash, notes}
   * @param {{paperHtml:string, jsx?:string}} frame
   * @param {Buffer|{surface?:Buffer, context?:Buffer, trigger?:Buffer, before?:Buffer}} [shots]
   *        A bare Buffer is treated as the surface shot. The named form carries
   *        the evidence a code agent needs to reconstruct wiring: `trigger` is
   *        what you click, `before` is the page at rest, `context` is the whole
   *        viewport with the surface open — which is the only artifact that
   *        shows anchoring, backdrop and stacking.
   */
  add(state, frame, shots, cssStates) {
    const images = Buffer.isBuffer(shots) ? { surface: shots } : (shots ?? {});
    const id = `${String(this.#states.length + 1).padStart(3, '0')}-${slug(state.name)}`;
    if (state.hash) this.#hashes.add(state.hash);

    const paperHtml = frame?.paperHtml ?? '';
    const framePath = path.join('frames', `${id}.html`);
    writeFileSync(path.join(this.outDir, framePath), paperHtml, 'utf8');

    // The JSX variant is the same capture aimed at code rather than at Paper.
    let jsxPath;
    if (frame?.jsx) {
      jsxPath = path.join('jsx', `${id}.jsx`);
      mkdirSync(path.join(this.outDir, 'jsx'), { recursive: true });
      writeFileSync(path.join(this.outDir, jsxPath), frame.jsx, 'utf8');
    }

    const shotPaths = {};
    for (const [kind, buffer] of Object.entries(images)) {
      if (!buffer) continue;
      const suffix = kind === 'surface' ? '' : `@${kind}`;
      const rel = path.join('shots', `${id}${suffix}.png`);
      writeFileSync(path.join(this.outDir, rel), buffer);
      shotPaths[kind] = rel;
    }
    const shotPath = shotPaths.surface;

    // The surface's own state matrix lives beside its frame rather than in
    // spec.json, which would otherwise balloon past readability.
    let statesPath;
    if (cssStates) {
      statesPath = path.join('states', `${id}.json`);
      mkdirSync(path.join(this.outDir, 'states'), { recursive: true });
      writeFileSync(path.join(this.outDir, statesPath), JSON.stringify(cssStates, null, 2), 'utf8');
    }

    // Any state carrying motion also carries its own implementation contract.
    // The capture and the implementation are routinely done by different agents
    // in different sessions, so knowledge that lives only in a skill is lost —
    // and the failure mode is silent, since the endpoints still measure right.
    let contractPath;
    const contract = animationContract({ id, ...state });
    if (contract) {
      contractPath = path.join('contracts', `${id}.md`);
      mkdirSync(path.join(this.outDir, 'contracts'), { recursive: true });
      writeFileSync(path.join(this.outDir, contractPath), contract, 'utf8');
      // The enforceable twin of the prose contract.
      const checklist = animationChecklist({ id, ...state });
      if (checklist) writeFileSync(path.join(this.outDir, 'contracts', `${id}.checklist.json`), JSON.stringify(checklist, null, 2), 'utf8');
    }

    const record = { id, ...state, frame: framePath, jsx: jsxPath, shot: shotPath, shots: shotPaths, states: statesPath, contract: contractPath, bytes: paperHtml.length };
    this.#states.push(record);
    return record;
  }

  /** Attach the Tier 1 CSS-state report; it describes states rather than capturing frames. */
  setCssSpec(cssSpec) {
    this.cssSpec = cssSpec;
  }

  /** Screenshot of a trigger that produced nothing, for diagnosis. */
  addDebugShot(label, shot) {
    if (!shot) return undefined;
    mkdirSync(path.join(this.outDir, 'debug'), { recursive: true });
    const rel = path.join('debug', `${slug(label)}.png`);
    writeFileSync(path.join(this.outDir, rel), shot);
    return rel;
  }

  /** Attach the Tier 2 crawl report, including why each trigger came up empty. */
  setCrawlReport(report) {
    this.crawlReport = report;
  }

  get states() { return this.#states; }

  write() {
    const spec = {
      ...this.meta,
      capturedAt: new Date().toISOString(),
      stateCount: this.#states.length,
      states: this.#states,
      crawlReport: this.crawlReport,
      cssSpec: this.cssSpec,
    };
    writeFileSync(path.join(this.outDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8');
    return path.join(this.outDir, 'spec.json');
  }
}

const slug = (value) => String(value ?? 'state').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'state';

/**
 * Put a captured frame on the macOS clipboard in Paper's paste format.
 *
 * Paper recognises `<x-paper-html>`-wrapped markup on the text/html flavour —
 * the same envelope the extension's copyToClipboardForPaper() uses. Written via
 * AppleScript because NSPasteboard's HTML flavour has no `pbcopy` equivalent.
 */
export function copyFrameToPaper(bundleDir, stateId) {
  const spec = JSON.parse(readFileSync(path.join(bundleDir, 'spec.json'), 'utf8'));
  // Ids look like "002-create-issue", so all three of "002", "create-issue"
  // and the full id are things someone will reasonably type.
  const needle = String(stateId);
  const state = spec.states.find((candidate) => candidate.id === needle)
    ?? spec.states.find((candidate) => candidate.id.startsWith(needle))
    ?? spec.states.find((candidate) => candidate.id.endsWith(needle))
    ?? spec.states.find((candidate) => candidate.id.includes(needle));

  if (!state) {
    throw new Error(`No state matching "${needle}". Available:\n${spec.states.map((s) => `  ${s.id}`).join('\n')}`);
  }

  const framePath = path.join(bundleDir, state.frame);
  if (!existsSync(framePath)) throw new Error(`Frame file missing: ${framePath}`);

  const html = `<x-paper-html>${readFileSync(framePath, 'utf8')}</x-paper-html>`;
  const hex = Buffer.from(html, 'utf8').toString('hex').toUpperCase();
  execFileSync('osascript', ['-e', `set the clipboard to «data HTML${hex}»`]);
  return state;
}
