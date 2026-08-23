/**
 * Interaction spec discovery.
 *
 * Answers "which elements on this page have hover/focus/active/open states, and
 * what does each state actually change?" without a debugger session, a pointer,
 * or any permission at all.
 *
 * It cannot *render* a state — see captureInteractionStates() in the extension
 * for that, which forces the real style engine via CDP. This is the map you read
 * first so you know which states are worth the expensive capture pass.
 *
 * Usage — paste into any page's console:
 *   captureInteractionSpec()                  // whole document
 *   captureInteractionSpec($0)                // just the inspected subtree
 *   copy(JSON.stringify(captureInteractionSpec(), null, 2))
 */

/** Pseudo-classes that represent a *state* a user can put an element into. */
const STATE_PSEUDOS = [
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'target',
  'disabled', 'enabled', 'checked', 'indeterminate', 'placeholder-shown',
  'open', 'read-only', 'required', 'invalid', 'valid', 'in-range',
  'out-of-range', 'default', 'visited', 'autofill', 'popover-open',
];

/**
 * Attribute selectors that libraries use as de-facto state. Radix, Base UI and
 * Headless UI all drive their visuals off these rather than pseudo-classes, so a
 * pseudo-only scan silently misses every dropdown, dialog and accordion.
 */
const STATE_ATTRIBUTES = [/\[data-state[~^|*$]?=/, /\[data-open\b/, /\[aria-expanded=/, /\[aria-selected=/, /\[aria-checked=/, /\[data-highlighted\b/, /\[data-disabled\b/];

const STATE_PSEUDO_PATTERN = new RegExp(`:(?:${STATE_PSEUDOS.join('|')})\\b(?!-)`, 'g');

/**
 * Split on a delimiter only at bracket/paren depth zero.
 *
 * Naive splitting breaks on `:is(a, b)` and `[title="x > y"]`, which are common
 * enough in real design systems that a naive splitter mis-attributes states to
 * the wrong element.
 */
function splitAtDepth(input, isDelimiter) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quote) {
      current += character;
      if (character === quote && input[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;

    if (depth === 0 && isDelimiter(character)) {
      parts.push({ text: current, delimiter: character });
      current = '';
      continue;
    }
    current += character;
  }
  parts.push({ text: current, delimiter: null });
  return parts;
}

const splitSelectorList = (selector) =>
  splitAtDepth(selector, (character) => character === ',')
    .map((part) => part.text.trim())
    .filter(Boolean);

/**
 * Break a complex selector into its compound parts, in source order.
 * `.group:hover > .card .icon` → ['.group:hover', '.card', '.icon']
 *
 * The *last* compound is the subject — the element the rule actually styles.
 * Anything earlier carrying a state is an ancestor/sibling trigger, which is
 * exactly the group-hover shape.
 */
function toCompounds(selector) {
  return splitAtDepth(selector.replace(/\s*([>+~])\s*/g, ' $1 '), (character) => character === ' ')
    .map((part) => part.text.trim())
    .filter((text) => text && !['>', '+', '~'].includes(text));
}

const statesIn = (text) => Array.from(new Set(Array.from(text.matchAll(STATE_PSEUDO_PATTERN), (match) => match[0].slice(1))));

const attributeStatesIn = (text) =>
  STATE_ATTRIBUTES.filter((pattern) => pattern.test(text))
    .map((pattern) => text.match(new RegExp(`\\[[^\\]]*${pattern.source.replace(/^\\\[/, '')}[^\\]]*\\]`))?.[0])
    .filter(Boolean);

/** Strip state pseudos and state attributes so the selector matches the resting DOM. */
function toRestingSelector(selector) {
  let resting = selector.replace(STATE_PSEUDO_PATTERN, '');
  for (const pattern of STATE_ATTRIBUTES) {
    resting = resting.replace(new RegExp(`\\[[^\\]]*${pattern.source.replace(/^\\\[/, '')}[^\\]]*\\]`, 'g'), '');
  }
  // `.card:hover::after` → `.card::after`; keep the pseudo-element, it's a real target.
  return resting.replace(/::([a-z-]+)/g, '::$1').trim();
}

/** Flatten every style rule in the document, recursing through @media/@supports/@layer/@container. */
function collectStyleRules() {
  const collected = [];

  const walk = (rules, conditions) => {
    for (const rule of Array.from(rules ?? [])) {
      if (rule.type === CSSRule.STYLE_RULE || rule instanceof CSSStyleRule) {
        collected.push({ rule, conditions });
        continue;
      }
      // @media / @supports / @layer / @container all expose nested cssRules.
      const nested = rule.cssRules;
      if (!nested) continue;
      const condition = rule.conditionText ?? rule.media?.mediaText ?? rule.name ?? null;
      walk(nested, condition ? [...conditions, condition] : conditions);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, []);
    } catch {
      // Cross-origin sheets throw on .cssRules with no way to opt in. Recorded
      // as a coverage gap rather than swallowed, so the caller knows the scan
      // was partial — see `unreadableSheets` in the result.
      collected.unreadable = (collected.unreadable ?? 0) + 1;
    }
  }
  return collected;
}

const declarationsOf = (rule) =>
  Array.from(rule.style).map((property) => ({
    property,
    value: rule.style.getPropertyValue(property),
    priority: rule.style.getPropertyPriority(property) || undefined,
  }));

/** Stable, readable identity for an element in the report. */
function describe(element) {
  const id = element.id ? `#${element.id}` : '';
  const classes = typeof element.className === 'string' && element.className
    ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

export function captureInteractionSpec(root = document) {
  const styleRules = collectStyleRules();
  const unreadableSheets = styleRules.unreadable ?? 0;
  const scope = root === document ? document.documentElement : root;

  // element -> state -> entry
  const byElement = new Map();

  for (const { rule, conditions } of styleRules) {
    for (const selector of splitSelectorList(rule.selectorText ?? '')) {
      const states = [...statesIn(selector), ...attributeStatesIn(selector)];
      if (states.length === 0) continue;

      const compounds = toCompounds(selector);
      const subject = compounds[compounds.length - 1] ?? '';
      // A state on the subject is a self-state; a state anywhere earlier means
      // some *other* element drives this one — the group-hover case.
      const triggerCompounds = compounds.slice(0, -1).filter((compound) => statesIn(compound).length || attributeStatesIn(compound).length);
      const selfStates = [...statesIn(subject), ...attributeStatesIn(subject)];

      const restingSelector = toRestingSelector(selector);
      if (!restingSelector) continue;

      let matches;
      try {
        matches = Array.from(scope.querySelectorAll(restingSelector));
        if (scope.matches?.(restingSelector)) matches.push(scope);
      } catch {
        continue; // Selector we can't re-run (e.g. a bare pseudo-element rule).
      }
      if (matches.length === 0) continue;

      const declarations = declarationsOf(rule);
      if (declarations.length === 0) continue;

      for (const element of matches) {
        if (!byElement.has(element)) byElement.set(element, new Map());
        const elementStates = byElement.get(element);

        for (const state of states) {
          const isSelf = selfStates.includes(state);
          // Conditions are part of the identity: a hover rule inside
          // @media (min-width:500px) is a *different* spec mode from an
          // unconditional one, and merging them would silently claim a
          // breakpoint-only shadow applies at every width.
          const key = `${isSelf ? '' : 'ancestor:'}${state}${conditions.length ? `@${conditions.join('&')}` : ''}`;
          if (!elementStates.has(key)) {
            elementStates.set(key, {
              state,
              trigger: isSelf ? 'self' : (triggerCompounds.join(' ') || 'ancestor'),
              conditions: conditions.length ? conditions : undefined,
              declarations: [],
              selectors: [],
            });
          }
          const entry = elementStates.get(key);
          entry.selectors.push(selector);
          entry.declarations.push(...declarations);
        }
      }
    }
  }

  // Resolve each state's declarations against the element's resting computed
  // style, so the output is a *delta* — what actually changes — not a dump of
  // every property the rule happens to set.
  const components = [];
  for (const [element, elementStates] of byElement) {
    const resting = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const states = [];

    for (const entry of elementStates.values()) {
      const seen = new Map();
      for (const declaration of entry.declarations) seen.set(declaration.property, declaration);

      const changes = [];
      for (const { property, value, priority } of seen.values()) {
        // A shorthand like `background: #333` enumerates as every longhand, with
        // the ones it doesn't set reported as `initial`. Those carry no design
        // intent and would swamp the real delta, so they're dropped. The cost is
        // an explicit `foo: initial` authored by hand, which is vanishingly rare.
        if (value.trim() === 'initial') continue;
        const from = resting.getPropertyValue(property);
        if (from && from.trim() === value.trim()) continue;
        changes.push({ property, from: from || '(unset)', to: value, priority });
      }
      if (changes.length === 0) continue;

      states.push({
        state: entry.state,
        trigger: entry.trigger,
        conditions: entry.conditions,
        changes,
        selectors: Array.from(new Set(entry.selectors)),
      });
    }

    if (states.length === 0) continue;
    components.push({
      element,
      label: describe(element),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      visible: rect.width > 0 && rect.height > 0,
      states: states.sort((left, right) => left.state.localeCompare(right.state)),
    });
  }

  const stateNames = Array.from(new Set(components.flatMap((component) => component.states.map((state) => state.state)))).sort();

  const result = {
    url: location.href,
    scannedRules: styleRules.length,
    unreadableSheets,
    stateNames,
    components: components.sort((left, right) => right.states.length - left.states.length),
  };

  console.groupCollapsed(
    `%cInteraction spec%c ${components.length} components · ${stateNames.length} states · ${styleRules.length} rules` +
    (unreadableSheets ? ` · ⚠ ${unreadableSheets} cross-origin sheet(s) unreadable` : ''),
    'font-weight:600', 'font-weight:400;color:#888',
  );
  console.table(components.slice(0, 50).map((component) => ({
    element: component.label,
    states: component.states.map((state) => (state.trigger === 'self' ? state.state : `${state.state}↑`)).join(' '),
    changes: component.states.reduce((total, state) => total + state.changes.length, 0),
    visible: component.visible,
  })));
  console.log('↑ = driven by an ancestor (group-hover). Full result returned.');
  console.groupEnd();

  return result;
}

if (typeof window !== 'undefined') window.captureInteractionSpec = captureInteractionSpec;
