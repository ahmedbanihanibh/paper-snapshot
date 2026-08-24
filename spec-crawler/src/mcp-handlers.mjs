/**
 * The MCP handler map, and the session state it operates on.
 *
 * Everything here used to live at module scope in `mcp.mjs` beside the transport,
 * which made two things impossible: constructing the handlers in a test without
 * spawning a process, and running two tool calls without them interleaving
 * browser mutations. Both are fixed by the same move — the state belongs to a
 * `CrawlerRuntime`, and every stateful handler enters through
 * `runtime.invokeExclusive`, which serialises them against each other and against
 * shutdown.
 *
 * The five capture handlers are now thin: `captureState` from `src/capture.mjs`
 * owns the measure/serialize/screenshot/commit ordering, the undo stack and the
 * drift check. What is left here is the part that differs — which subject, which
 * action, which extra evidence — and the legacy response shape.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { SpecDriver } from './driver.mjs';
import { Bundle, copyFrameToPaper } from './bundle.mjs';
import { classify, crawlOverlays, DEFAULT_DENY, keyedList } from './crawl.mjs';
import { importBundle, PaperClient } from './paper.mjs';
import { captureAnimation } from './animation.mjs';
import { filmstrip, landmarks, probe } from './filmstrip.mjs';
import { resolveComponentAt, driveStateMatrix } from './capture-intent.mjs';
import { captureState, pointerStateAction, pointerStateHoldsButton } from './capture.mjs';
import { captureDrag } from './gesture.mjs';
import { captureReveal } from './reveal.mjs';
import { runScenario } from './scenario.mjs';
import { ScenarioValidationError } from './scenario-schema.mjs';
import { DEFAULT_ENDPOINT, DEFAULT_OUT } from './mcp-tools.mjs';

/** A successful tool result: one text block, JSON unless already a string. */
export const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

/**
 * A failed tool result.
 *
 * `code` and `stage` ride both the JSON payload and the result object, because
 * the two are read by different consumers: an agent reads the text, a wrapper
 * (or a test) reads the fields.
 */
export function errorResult(message, { code = null, stage = null, ...rest } = {}) {
  const payload = { error: message, ...(code ? { code } : {}), ...(stage ? { stage } : {}), ...rest };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
    ...(code ? { code } : {}),
    ...(stage ? { stage } : {}),
  };
}

/** Map a `captureState` failure onto a tool error result, keeping its evidence. */
const captureFailure = (result, hint) => errorResult(result.message, {
  code: result.code,
  stage: result.stage,
  ...(result.evidence ? { evidence: result.evidence } : {}),
  ...(result.cleanupErrors ? { cleanupErrors: result.cleanupErrors } : {}),
  ...(hint ? { hint } : {}),
});

const freshExplorer = () => ({ tried: new Set(), dryRounds: 0, seenStates: new Set(), lastCaptureCount: 0 });

const EXPECT_REQUIRED = 'ERR_TARGET_EXPECT_REQUIRED';

/**
 * The handler map plus the session it drives.
 *
 * @param {object} options
 * @param {import('./runtime.mjs').CrawlerRuntime} options.runtime
 * @param {{endpoint?: string, outDir?: string}} [options.defaults]
 * @param {Function} [options.getClientInfo] returns the initialize handshake's client, once known
 * @param {string} [options.transport]
 */
export function createHandlers({
  runtime,
  defaults = {},
  getClientInfo = () => null,
  transport = 'mcp-stdio',
} = {}) {
  if (!runtime || typeof runtime.invokeExclusive !== 'function') {
    throw new TypeError('createHandlers requires a CrawlerRuntime.');
  }

  const defaultEndpoint = defaults.endpoint ?? DEFAULT_ENDPOINT;
  const defaultOut = defaults.outDir ?? DEFAULT_OUT;

  const requireDriver = () => {
    if (!runtime.driver) {
      const error = new Error('Not attached. Call browser_attach first (start Edge with --remote-debugging-port=9222).');
      error.code = 'ERR_NOT_ATTACHED';
      throw error;
    }
    return runtime.driver;
  };

  const requireBundle = () => {
    if (!runtime.bundle) {
      runtime.bundle = new Bundle(defaultOut, { url: runtime.driver?.baselineUrl });
    }
    return runtime.bundle;
  };

  const explorer = () => {
    if (!runtime.explorer) runtime.explorer = freshExplorer();
    return runtime.explorer;
  };

  const markTried = async (label) => {
    const stateKey = await runtime.driver.currentStateKey().catch(() => 'unknown');
    explorer().tried.add(`${stateKey}::${label}`);
  };

  /** New surfaces after an interaction, shaped for an agent to act on next. */
  async function surfacesAfter(active) {
    await active.settle();
    const roots = await active.harvestSurfaces();
    return {
      url: active.page.url(),
      newSurfaces: roots.map(({ hash, ...rest }) => rest),
    };
  }

  const requireExpect = (tool, expect) => (typeof expect === 'string' && expect.trim().length > 0
    ? null
    : errorResult(
      `${tool} requires the "expect" parameter. A coordinate is not an identity: a virtualised list recycles its `
      + `nodes, so (x, y) can be re-occupied by a different element between the moment you looked at the page and the `
      + `moment this call runs. Pass expect as a substring of the target's label, its tag name, or a CSS selector it `
      + `must match, and the capture refuses rather than confidently describing the wrong component.`,
      { code: EXPECT_REQUIRED, stage: 'precondition', parameter: 'expect' },
    ));

  /* ------------------------------------------------------------- handlers */

  const raw = {
    async browser_attach({ urlPattern, endpoint, outDir, navigateTo, fresh = false }) {
      if (runtime.driver) await runtime.driver.close();
      const driver = await SpecDriver.attach(endpoint ?? defaultEndpoint, urlPattern);
      runtime.driver = driver;
      if (navigateTo) await driver.goto(navigateTo);
      runtime.explorer = freshExplorer();
      // Re-attaching mid-session is normal — it is how you get back to a page
      // after following a link. It must not cost you the captures made so far.
      //
      // Flush the outgoing bundle FIRST: the replacement resumes its numbering
      // from spec.json on disk, so replacing an unflushed bundle rewinds the id
      // counter and later captures silently overwrite earlier manifest entries.
      // Measured 2026-08-11: three states minted as 015, two fell out of the
      // manifest (their frame files survived; the ids did not).
      try { runtime.bundle?.write(); } catch { /* a bundle that cannot flush should not block re-attach */ }
      runtime.bundle = new Bundle(outDir ?? defaultOut, { url: driver.page.url() }, { fresh });
      await driver.establishBaseline();
      return text({
        attached: true,
        url: driver.page.url(),
        title: await driver.page.title(),
        bundleDir: runtime.bundle.outDir,
      });
    },

    page_describe: async () => text(await requireDriver().describe()),

    list_regions: async () => text(await requireDriver().regions()),

    set_region: async ({ include, exclude }) => text({
      region: requireDriver().setRegion({ include: include ?? null, exclude: exclude ?? null }),
      note: 'Applies to crawl_overlays and frontier for the rest of this session.',
    }),

    capture_css_spec: async ({ specId }) => {
      const spec = await requireDriver().cssSpec(specId);
      requireBundle().setCssSpec(spec);
      return text(spec);
    },

    crawl_overlays: async ({ limit, deny, depth, scanStates, shots }) =>
      text(await crawlOverlays(requireDriver(), requireBundle(), {
        limit: limit ?? Infinity,
        deny: deny ?? DEFAULT_DENY,
        depth: Math.max(1, depth ?? 1),
        scanStates: scanStates ?? true,
        shots: shots ?? 'context',
      })),

    async click({ specId }) {
      const active = requireDriver();
      await markTried(`click:${specId}`);
      if (!await active.clickById(specId)) throw new Error(`No element with spec id ${specId}. Re-run page_describe — the DOM may have changed.`);
      return text(await surfacesAfter(active));
    },

    async press({ keys }) {
      const active = requireDriver();
      await markTried(`press:${keys}`);
      await active.page.keyboard.press(keys);
      return text(await surfacesAfter(active));
    },

    async hover({ specId }) {
      const active = requireDriver();
      await markTried(`hover:${specId}`);
      const handle = await active.page.$(`[data-spec-id="${specId}"]`);
      if (!handle) throw new Error(`No element with spec id ${specId}.`);
      await handle.hover();
      return text(await surfacesAfter(active));
    },

    async frontier({ scopeId }) {
      const active = requireDriver();
      const memory = explorer();
      const stateKey = await active.currentStateKey();
      const isNewState = !memory.seenStates.has(stateKey);
      if (isNewState) memory.seenStates.add(stateKey);

      // Dryness must mean "this round produced nothing", not "I have stood here
      // before". The loop resets to baseline after every capture, so keying it on
      // state novelty alone declares a productive run dry after three captures.
      const captureCount = requireBundle().states.length;
      const progressed = isNewState || captureCount > memory.lastCaptureCount;
      memory.lastCaptureCount = captureCount;
      memory.dryRounds = progressed ? 0 : memory.dryRounds + 1;

      const triggers = keyedList(await active.triggers(DEFAULT_DENY, scopeId ?? null));
      const untried = triggers.filter((trigger) => !memory.tried.has(`${stateKey}::click:${trigger.id}`));

      return text({
        stateKey,
        isNewState,
        dryRounds: memory.dryRounds,
        statesSeen: memory.seenStates.size,
        captured: requireBundle().states.length,
        region: active.region ?? null,
        untried: untried.map(({ id, label, role, hasPopup, tag, rect }) => ({ id, label, role, hasPopup, tag, rect })),
        triedHere: triggers.length - untried.length,
        exhausted: untried.length === 0,
        advice: untried.length === 0
          ? 'Nothing untried in this state. reset, or navigate somewhere else.'
          : (memory.dryRounds >= 3 ? 'Three rounds without a new state — consider stopping.' : 'Pick an untried interaction and act.'),
      });
    },

    async novelty({ specId }) {
      const active = requireDriver();
      const hash = await active.structuralHash(specId ?? null);
      const seen = requireBundle().seen(hash);
      return text({ hash: hash ? `${hash.slice(0, 60)}…` : null, alreadyCaptured: seen, stateKey: await active.currentStateKey() });
    },

    async force_state({ specId, states }) {
      const active = requireDriver();
      const session = await active.page.context().newCDPSession(active.page);
      await session.send('DOM.enable');
      await session.send('CSS.enable');
      const { root } = await session.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-spec-id="${specId}"]` });
      if (!nodeId) throw new Error(`No element with spec id ${specId}.`);
      await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states });
      return text({ forced: states, specId, note: 'State is applied in the real style engine. capture_state now, then reset to clear.' });
    },

    async capture_component({ specId: requestedId, name, withAnimation = true }) {
      let specId = requestedId;
      const active = requireDriver();
      const store = requireBundle();

      // Identify the trigger by its reload-stable key *before* resetting: reset
      // escalates to a full reload when a surface will not dismiss, and every
      // spec-id the caller holds dies with the old document.
      const before = keyedList(await active.triggers(DEFAULT_DENY));
      const wanted = before.find((candidate) => candidate.id === specId);

      // Start closed, by an absolute criterion rather than by comparing against a
      // baseline that may itself have been recorded with something open.
      // Capturing an *opening* transition requires the surface to be shut first —
      // otherwise the baseline already contains it, the harvest finds nothing new,
      // and the tool reports a working trigger as dead.
      const cleanedBy = await active.ensureClean();

      const after = keyedList(await active.triggers(DEFAULT_DENY));
      const trigger = (wanted && after.find((candidate) => candidate.key === wanted.key))
        ?? after.find((candidate) => candidate.id === specId)
        ?? wanted
        ?? { id: specId, label: name ?? specId, rect: null, hasPopup: null, role: null };
      specId = trigger.id;

      // Motion first: recording has to straddle the click, and the click is what
      // opens the surface. Doing it in this order means one interaction produces
      // both the animation spec and the surface, instead of opening it twice.
      const animation = withAnimation
        ? await captureAnimation(active, { triggerId: specId }).catch((cause) => ({ error: String(cause?.message ?? cause) }))
        : null;

      // Capture the acceptance test at the same time as the spec. An implementer
      // in another session cannot produce a reference for an app they may not be
      // able to reach, so it has to be recorded here or it never exists.
      let referenceFilmstrip = null;
      if (withAnimation && animation && !animation.error) {
        await active.ensureClean().catch(() => {});
        const strip = await filmstrip(active, {
          triggerId: specId,
          onFrame: () => landmarks(active, `[data-spec-id="${specId}"]`),
        }).catch(() => null);
        if (strip) {
          referenceFilmstrip = {
            durationMs: strip.durationMs,
            frames: strip.frames.map((frame) => ({ progress: frame.progress, atMs: frame.atMs, ...frame.sample })),
          };
        }
      }
      if (!withAnimation && !await active.clickById(specId)) throw new Error(`No element with spec id ${specId}.`);
      await active.settle();

      const roots = await active.harvestSurfaces();
      if (roots.length === 0) throw new Error('That trigger opened nothing. Check page_describe, or the surface may need a precondition.');
      const surface = roots.filter((r) => r.portalled || r.role).sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0] ?? roots[0];

      const classified = classify(surface, trigger);
      const result = await captureState({
        driver: active,
        bundle: store,
        name: name ?? trigger.label ?? surface.role ?? 'component',
        specId: surface.id,
        tier: 4,
        level: 0,
        path: [],
        kind: classified.kind,
        // The overlay's own hash is the identity the Tier 2 crawler already uses,
        // and a component captured twice on purpose must still be written.
        hash: surface.hash,
        dedupe: false,
        annotate: { triggerId: specId, surfaceId: surface.id, anchor: null },
        cssSpec: true,
        state: {
          roleEvidence: classified.roleEvidence,
          detectedBy: surface.revealed ? 'revealed' : 'mounted',
          trigger: { label: trigger.label, role: trigger.role, hasPopup: trigger.hasPopup },
          rect: surface.rect,
          animation,
          referenceFilmstrip,
        },
      });

      await active.reset().catch(() => {});
      if (!result.ok) return captureFailure(result, 'The surface opened but could not be committed; the trigger and animation are unaffected.');
      return text({
        ...result.record,
        cleanedBy,
        animationSummary: animation?.nodes?.[0]?.fit ?? animation?.error ?? null,
      });
    },

    async verify_animation({ specId, keys, subjectSelector, name, checklist, nodeMap }) {
      const active = requireDriver();
      const store = requireBundle();
      const strip = await filmstrip(active, {
        triggerId: specId,
        keys,
        onFrame: async () => ({
          ...(await landmarks(active, subjectSelector ?? '#subject')),
          ...(nodeMap ? { nodes: await probe(active, nodeMap) } : {}),
        }),
      });

      const folder = `filmstrip-${String(name ?? specId ?? keys ?? 'run').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const frames = strip.frames.map((frame) => ({
        progress: frame.progress,
        atMs: frame.atMs,
        ...frame.sample,
        shot: store.addDebugShot(`${folder}/${String(Math.round(frame.progress * 100)).padStart(3, '0')}`, frame.png),
      }));

      // Coverage against the captured checklist. Reported first, because an
      // implementation that animates two of four nodes otherwise passes every
      // frame-level check that happens to be run on the two it did implement.
      let coverage = null;
      if (checklist) {
        const spec = JSON.parse(readFileSync(checklist, 'utf8'));
        const required = (spec.requiredNodes ?? []).map((entry) => entry.node);
        const mapped = Object.keys(nodeMap ?? {});
        const missing = required.filter((node) => !mapped.includes(node));
        coverage = {
          status: missing.length ? 'INCOMPLETE' : 'complete',
          required: required.length,
          mapped: mapped.length,
          missing,
          detail: missing.length
            ? (spec.requiredNodes ?? []).filter((entry) => missing.includes(entry.node))
              .map((entry) => `${entry.node}: animates ${entry.animate.map((a) => a.property).join(', ')} — not implemented`)
            : [],
        };
      }

      return text({
        coverage,
        durationMs: strip.durationMs,
        frames,
        hint: 'Compare against the same run on the original. Position matters as much as size: a clone can match width, height and internal offsets at every frame while its top edge travels a different path.',
      });
    },

    capture_animation: async ({ specId, keys, maxMs }) =>
      text(await captureAnimation(requireDriver(), { triggerId: specId, keys, maxMs: maxMs ?? 2000 })),

    async capture_hover_reveal({ specId, dwellMs, name, capture = false }) {
      const active = requireDriver();
      const reveal = await captureReveal(active, { targetId: specId, dwellMs: dwellMs ?? 900 });

      let record = null;
      if (capture) {
        const subject = reveal.menu ?? reveal.tooltip ?? reveal.affordance ?? reveal.surfaces[0];
        if (subject) {
          const result = await captureState({
            driver: active,
            bundle: requireBundle(),
            name: name ?? subject.label ?? 'hover-reveal',
            specId: subject.id,
            tier: 3,
            level: 0,
            path: [],
            kind: subject.role ?? (subject.insideTarget ? 'affordance' : 'tooltip'),
            notes: `Revealed after ${reveal.dwellMs}ms of pointer rest. ${subject.insideTarget ? 'Lives inside the target.' : 'Portals outside the target.'}`,
            // The revealed surface's own id is its identity here, as it was before
            // this handler used the shared capture path.
            hash: subject.id,
            dedupe: false,
            annotate: { triggerId: specId, surfaceId: subject.id, anchor: null, label: name ?? 'reveal' },
            cssSpec: true,
            state: { trigger: { label: `hover ${specId}` }, rect: subject.rect },
          });
          if (!result.ok) return captureFailure(result, 'The reveal was observed but could not be committed. Re-read `evidence`; the surfaces list below the error is still valid.');
          record = result.record;
        }
      }

      return text({
        ...reveal,
        captured: record?.id ?? null,
        hint: 'insideTarget means an affordance that lives in the row; the rest portal elsewhere and must be implemented as portalled elements. For a submenu, call again with the id of an item inside the surface just revealed.',
      });
    },

    async capture_drag({ fromId, toId, steps, name }) {
      const active = requireDriver();
      const store = requireBundle();
      const drag = await captureDrag(active, { fromId, toId, steps: steps ?? 10 });
      const folder = `gesture-${String(name ?? fromId).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const frames = drag.phases.map((phase) => ({
        ...phase,
        shot: store.addDebugShot(`${folder}/${phase.label.replace('%', 'pct')}`, drag.shots[phase.label]),
      }));
      return text({
        from: drag.from,
        to: drag.to,
        dragOverlay: drag.dragOverlay,
        frames,
        hint: 'Surfaces listed under dragOverlay exist only while the button is down — that is the overlay and the insertion indicator. Implement them as portalled elements, not as styles on the source row.',
      });
    },

    async capture_state({ name, specId, notes }) {
      const active = requireDriver();
      const store = requireBundle();
      const result = await captureState({
        driver: active,
        bundle: store,
        name,
        specId: specId ?? null,
        notes,
        tier: 3,
        kind: 'agent-captured',
        path: [],
      });

      if (!result.ok) return captureFailure(result);
      if (result.duplicate) {
        return text({ duplicate: true, existingId: result.existingId, message: 'Already captured; nothing written.' });
      }
      return text({ ...result.record, bundleDir: store.outDir });
    },

    async capture_at({ x, y, name, why, path: reachedBy, expect = null, push = false }) {
      const missing = requireExpect('capture_at', expect);
      if (missing) return missing;

      const active = requireDriver();
      const store = requireBundle();
      const found = await resolveComponentAt(active, x, y, { expect });
      if (!found || found.error) {
        return errorResult(found?.error ?? `Nothing at (${x}, ${y}).`, {
          code: found?.code ?? 'ERR_TARGET_NOT_FOUND',
          stage: 'target',
          ...(found?.reason ? { reason: found.reason } : {}),
          ...(found?.resolvedLabel ? { resolvedLabel: found.resolvedLabel } : {}),
        });
      }

      const result = await captureState({
        driver: active,
        bundle: store,
        name,
        specId: found.specId,
        x,
        y,
        expect,
        why,
        reachedBy,
        tier: 3,
        kind: 'agent-captured',
        path: [],
      });

      if (!result.ok) return captureFailure(result);
      if (result.duplicate) {
        return text({
          duplicate: true,
          existingId: result.existingId,
          resolved: found,
          message: 'This exact structure and state is already captured.',
        });
      }

      let paper = null;
      if (push) {
        store.write();
        paper = await importBundle(store.outDir, { only: result.record.id, limit: 1, dryRun: false });
      }
      return text({
        ...result.record,
        resolved: found,
        measured: result.measured ?? null,
        subgridResolved: result.subgridResolved ?? 0,
        paper,
      });
    },

    async capture_state_matrix({ x, y, name, why, path: reachedBy, expect = null, push = false }) {
      const missing = requireExpect('capture_state_matrix', expect);
      if (missing) return missing;

      const active = requireDriver();
      const store = requireBundle();
      const found = await resolveComponentAt(active, x, y, { expect });
      if (!found || found.error) {
        return errorResult(found?.error ?? `Nothing at (${x}, ${y}).`, {
          code: found?.code ?? 'ERR_TARGET_NOT_FOUND',
          stage: 'target',
          ...(found?.reason ? { reason: found.reason } : {}),
          ...(found?.resolvedLabel ? { resolvedLabel: found.resolvedLabel } : {}),
        });
      }

      const matrix = await driveStateMatrix(active, found.specId);
      const captured = [];
      const skipped = [];

      for (const state of matrix.states) {
        if (!state.changed) { skipped.push({ state: state.state, reason: state.note }); continue; }
        // Re-enter the state: driveStateMatrix restored the pointer when it
        // finished. The action runs inside the transaction, so the held button of
        // an `active` frame is released by the cleanup stack even on a throw.
        const result = await captureState({
          driver: active,
          bundle: store,
          name: `${name}-${state.state}`,
          specId: found.specId,
          x,
          y,
          expect,
          action: pointerStateAction(state.state),
          pointerHeld: pointerStateHoldsButton(state.state),
          why: `${why ?? name} — state: ${state.state.toUpperCase()}.`,
          reachedBy: `${reachedBy ?? ''} ${state.note}`.trim(),
          tier: 3,
          kind: 'agent-captured',
          path: [],
        });

        if (!result.ok) {
          skipped.push({ state: state.state, reason: result.message, code: result.code, stage: result.stage });
          continue;
        }
        if (result.duplicate) {
          skipped.push({ state: state.state, reason: 'structurally identical to a state already captured' });
          continue;
        }
        captured.push(result.record);
      }

      let paper = null;
      if (push && captured.length) {
        store.write();
        paper = await importBundle(store.outDir, { limit: Infinity, dryRun: false });
      }
      return text({
        component: found,
        captured: captured.map((r) => ({ id: r.id, name: r.name })),
        skipped,
        availableStateAttributes: matrix.availableStateAttributes,
        note: Object.keys(matrix.availableStateAttributes).length
          ? 'This component carries state attributes, so it expresses state through JS, not CSS :hover. States beyond pointer reach (selection, keyboard cursor) must be driven by you, then captured with capture_at.'
          : 'No state attributes found; pointer states are likely the whole matrix.',
        paper,
      });
    },

    reset: async () => text({ method: await requireDriver().reset() }),

    bundle_write: async () => {
      const active = requireBundle();
      const specPath = active.write();
      return text({ specPath, stateCount: active.states.length, states: active.states.map((state) => ({ id: state.id, name: state.name, kind: state.kind })) });
    },

    paper_status: async () => {
      const client = await new PaperClient().connect();
      return text(await client.info());
    },

    paper_import: async ({ only, limit, dryRun }) => {
      const active = requireBundle();
      active.write();
      return text(await importBundle(active.outDir, { only, limit: limit ?? Infinity, dryRun: dryRun ?? false }));
    },

    paper_copy: async ({ stateId }) => {
      const active = requireBundle();
      active.write();
      const state = copyFrameToPaper(active.outDir, stateId);
      return text({ copied: state.id, name: state.name, next: 'Switch to Paper and press Cmd-V.' });
    },

    /* ------------------------------------------------------------- added */

    async scenario_run({ file, scenario, dryRun = false, endpoint, urlPattern, out }) {
      if (!file && !scenario) {
        return errorResult('scenario_run needs either `file` (a path to scenario JSON) or `scenario` (the object inline).', {
          code: 'ERR_SCENARIO_INPUT', stage: 'precondition', parameter: 'file',
        });
      }

      let input = scenario ?? null;
      let sourcePath = null;
      if (!input) {
        sourcePath = path.resolve(file);
        try {
          input = JSON.parse(readFileSync(sourcePath, 'utf8'));
        } catch (cause) {
          return errorResult(`Cannot read scenario ${sourcePath}: ${cause.message}`, {
            code: 'ERR_SCENARIO_UNREADABLE', stage: 'precondition', file: sourcePath,
          });
        }
      }

      let report;
      try {
        report = await runScenario(input, {
          dryRun: Boolean(dryRun),
          endpoint: endpoint ?? null,
          urlPattern: urlPattern ?? null,
          // Reuse the live session when there is one, so a scenario does not open
          // a second connection to the same tab — and, critically, so runScenario
          // does not own (and therefore close) a driver this server still holds.
          ...(runtime.driver && !dryRun ? { driver: runtime.driver } : {}),
        });
      } catch (cause) {
        if (cause instanceof ScenarioValidationError) {
          return errorResult(`${sourcePath ?? 'scenario'} is not a valid scenario.`, {
            code: 'ERR_SCENARIO_INVALID', stage: 'validate', violations: cause.violations,
          });
        }
        throw cause;
      }

      let reportPath = null;
      if (out) {
        reportPath = path.resolve(out);
        mkdirSync(path.dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      }
      return text({ ...report, file: sourcePath, reportPath, usedAttachedDriver: Boolean(runtime.driver && !dryRun) });
    },
  };

  /**
   * Read-only self-report. Deliberately outside the exclusive section: it must
   * still answer while a long capture holds the mutex, and it touches nothing.
   */
  const runtime_handshake = async ({ challenge } = {}) => {
    const status = runtime.readStatus();
    const identity = status.identity ?? runtime.identity;
    const driver = runtime.driver ?? null;
    const bundle = runtime.bundle ?? null;
    const client = getClientInfo() ?? identity?.mcpClient ?? null;

    let url = null;
    let title = null;
    if (driver) {
      try { url = driver.page.url(); } catch { url = null; }
      try { title = await driver.page.title(); } catch { title = null; }
    }

    return text({
      ok: true,
      // Echoed verbatim, including absence — an omitted challenge reports null
      // rather than an empty string, so a caller can tell the two apart.
      challenge: challenge === undefined ? null : challenge,
      transport,
      server: identity?.deterministic?.package?.name ?? 'spec-crawler',
      source: {
        package: identity?.deterministic?.package ?? null,
        sourceFingerprint: identity?.deterministic?.sourceFingerprint ?? null,
        serializerDigest: identity?.deterministic?.serializerDigest ?? null,
        gitCommit: identity?.deterministic?.gitCommit ?? null,
        sourceFileCount: identity?.deterministic?.sourceFiles?.length ?? null,
      },
      instance: identity?.instance ?? null,
      mcpClient: client,
      attachment: { attached: Boolean(driver), url, title },
      bundle: { dir: bundle?.outDir ?? null, stateCount: bundle?.states?.length ?? 0 },
      runtime: {
        state: status.state,
        activeOperation: status.activeOperation,
        queuedOperations: status.queuedOperations,
        slots: status.slots,
        leases: status.leases,
      },
      attests: 'This response was produced by this spec-crawler MCP server process. That is a routing fact, not an integrity proof: every field above is this process describing itself, and a CDP port being open is not evidence that any call went through here.',
    });
  };

  /* --------------------------------------------------- exclusive wrapping */

  const handlers = { runtime_handshake };
  for (const [name, handler] of Object.entries(raw)) {
    // One entry point, one critical section. Nesting would deadlock the mutex, so
    // nothing below this line may call invokeExclusive again.
    handlers[name] = (args) => runtime.invokeExclusive(name, () => handler(args ?? {}));
  }

  return handlers;
}
