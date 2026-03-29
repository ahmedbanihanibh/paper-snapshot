# Migration Plan: SolidJS Architecture (react-grab inspired)

## Overview
Migrate from single `background.js` (1900+ lines) to a proper monorepo with SolidJS, Vite, tsup build system inspired by react-grab.

## Architecture Comparison

| Current | Target |
|---------|--------|
| Single background.js | Monorepo with packages |
| All functions injected via executeScript | Persistent content scripts (MAIN world) |
| No build system | Vite + tsup + Tailwind |
| No reactivity | SolidJS signals/stores |
| DOM-based overlay | Canvas-based overlay (OffscreenCanvas) |
| Slow executeScript round-trips | Direct in-page execution |
| No plugin system | Plugin registry with hooks |

## Package Structure
```
packages/
  core/              # Main library (SolidJS)
    src/
      index.ts       # Entry + init()
      core/
        index.tsx     # Main event loop
        store.ts      # SolidJS store (state machine)
      components/
        renderer.tsx  # Main UI renderer
        overlay.tsx   # Canvas overlay
        toolbar.tsx   # Floating toolbar
        preview.tsx   # Preview panel (our addition)
        recording.tsx # Recording mode UI (our addition)
      plugins/
        capture.ts    # Static capture plugin
        record.ts     # Interaction recording plugin
        copy-jsx.ts   # Copy as React JSX
        copy-html.ts  # Copy as HTML
      utils/
        serializer.ts       # DOM serializer (from Paper Snapshot)
        style-simplifier.ts  # CSS deduplication
        html-to-jsx.ts      # HTML→JSX converter
        interaction-recorder.ts # Recording engine
        react-generator.ts   # React component generator
      types.ts
      constants.ts
      styles.css      # Tailwind
  web-extension/      # Chrome/Edge extension wrapper
    src/
      manifest.json
      background/service-worker.ts
      content/bridge.ts    # Isolated world
      content/main.ts      # Main world (loads core)
    vite.config.ts
```

## Migration Phases

### Phase 1: Project Setup (scaffold)
- [x] Create monorepo with pnpm workspaces
- [x] Set up Vite + tsup build configs
- [x] Set up Tailwind CSS
- [x] Create Chrome manifest v3
- [x] Set up SolidJS with babel-preset-solid

### Phase 2: Core State Machine
- [ ] Port element picker to SolidJS store
- [ ] Implement canvas overlay for element highlighting
- [ ] Create toolbar component
- [ ] Set up plugin registry

### Phase 3: Serialization
- [ ] Port DOM serializer from Paper Snapshot
- [ ] Port style simplifier
- [ ] Port HTML-to-JSX converter
- [ ] Create capture plugin

### Phase 4: Recording
- [ ] Port interaction recorder
- [ ] Create recording mode UI
- [ ] Port React component generator
- [ ] Create record plugin

### Phase 5: Preview & Copy
- [ ] Create preview panel with tabs
- [ ] Create timeline player for recordings
- [ ] Implement clipboard copy (JSX + HTML)
- [ ] Add zoom controls

### Phase 6: Extension Integration
- [ ] Service worker for toggle/state
- [ ] Bridge content script
- [ ] Main world content script
- [ ] Icon and badge management

## Key Decisions
- Use SolidJS (not React) for minimal bundle + fine-grained reactivity
- Use Canvas for overlays (no DOM pollution)
- Use multi-world content scripts (persistent, no executeScript lag)
- Keep Paper Snapshot's serializer logic (proven, 1:1 identical output)
- Add plugin system for extensibility
