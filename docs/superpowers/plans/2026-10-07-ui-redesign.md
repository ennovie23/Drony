# DRMS UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle and re-lay-out the five DRMS pages in the "night ops desk" direction (light default, dark toggle) without changing any data or behaviour.

**Architecture:** First, new colour and type tokens in `index.css`, with temporary aliases for the old token names so unmigrated pages keep rendering. Next, a small `components/ui/` primitive set and one `TopBar` that replaces `Header` + `PageHeader`. Then each page is migrated in turn, together with the shared components it owns. A final cleanup removes the aliases and the dead files.

**Tech Stack:** React 19, Vite 8, CSS Modules, react-router-dom 7, lucide-react. Pure helpers are tested with Node's built-in `node --test` (Node 24); no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-redesign-design.md`. Read it before any task. Sections are cited as §n.

## Global Constraints

- Do not modify `src/data/mock.js`, `src/context/*`, `src/utils/*`, `src/hooks/useNow.js`, routes, or anything under `backend/`.
- No new npm dependencies. The only `package.json` change is adding `"test": "node --test tests/"`.
- Components use colour tokens only (§4.1). Raw hex values are allowed only in `index.css` and in the image scrims/boxes over camera imagery.
- Fonts: IBM Plex Sans 400/500/600 for text; IBM Plex Mono 400/500 only for numbers and IDs (§4.2).
- Sentence case everywhere. No `letter-spacing`, no `text-transform: uppercase`, no glows, no pulse animation.
- Type scale is exactly 12 / 13 / 16 / 24 / 34 px (§4.2). Exception: sidebar labels are 10.5 px (§5.2).
- Desktop only, ≥1280 px wide. No page may scroll horizontally at 1280 px.
- Display-only derivations are limited to those listed in §3: sidebar dots, Lowest battery warn below 50, battery cells attention below 30.
- Each page task ends with that page's rows of §8 ticked in the browser, in both themes.

## Review Focus

1. **Blocked or garbage `localStorage`:** the app must open in light and the toggle must still work in-session. Pinned by the `readStoredTheme` and `writeStoredTheme` tests in Task 1.
2. **Unknown or missing status words** (an unexpected severity, `null` distance, `undefined` link): `Chip` must render a muted chip or `—`, never crash or print "null"/"undefined". Pinned by the `formatStatus` and `toneFor` tests in Task 1, plus the Task 7 browser check.
3. **Zero sensors reporting** (recall FM-01, FM-02 and FM-03): Flood shows its empty states, KPIs show `—` / `0/5`, the chart has no lines, and the sidebar Flood dot disappears. Pinned by Task 7 step 6.
4. **Module mid-drop** (`DEPLOYING`, `distance: null`): the map label and dock show "Dropping" with no "null cm"; it doesn't appear in readings until deployed. Pinned by Task 8 step 5.
5. **1280 px laptop width:** Flight's three-column grid, Flood's 3-column row and the 9-column readings table must not overflow horizontally. Pinned by the 1280 px check in every page task and the final pass in Task 10.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `frontend/package.json` | add `test` script | 1 |
| `frontend/tests/*.test.js` | node:test suites for pure helpers | 1 |
| `src/components/ui/format.js` | `formatStatus` | 1 |
| `src/components/ui/tones.js` | `SEVERITY_TONE`, `BEHAVIOR_TONE`, `toneFor` | 1 |
| `src/hooks/themeStorage.js` | `readStoredTheme`, `writeStoredTheme` | 1 |
| `src/components/shared/chartScale.js` | `makeYScale` | 1 |
| `frontend/index.html` | fonts, `<title>` | 2 |
| `src/index.css` | tokens (both themes), base styles, temporary aliases | 2 |
| `src/hooks/useTheme.js` | theme state + `data-theme` + persistence | 2 |
| `src/components/shared/StatusDot.jsx` + `StatusDot.module.css` | static tone dot | 2 |
| `src/components/ui/{Card,Readout,Chip,KeyValue,Segmented,Button}.jsx` + `.module.css`, `index.js` | primitives (§6) | 3 |
| `src/components/shared/TopBar.jsx` + `.module.css` | merged header (§5.3) | 4 |
| `src/components/shared/Sidebar.jsx` + `.module.css` | slim rail (§5.2) | 4 |
| `src/App.jsx` | drop `<Header />` | 4 |
| `src/pages/Live.jsx` + `.module.css`; `CameraFeed.*`; `TacticalMap.*` | §7.1, §6.1 | 5 |
| `src/pages/FireAssessment.jsx` + `.module.css`; `MlFrame.*` | §7.2 | 6 |
| `src/pages/FloodAssessment.jsx`, `Assessment.module.css`; `LineChart.*` | §7.3 | 7 |
| `src/pages/Instrument.jsx` + `.module.css`; `DroneDock.*` | §7.4 | 8 |
| `src/pages/MapPage.jsx` + `.module.css` | §7.5 | 9 |
| delete `Header*`, `PageHeader*`, `StatusTable.jsx`, `DroneTelemetry.jsx`, `Details.module.css`, `ui.module.css` | cleanup | 10 |

Paths starting `src/` are under `frontend/`. All commands run from `frontend/`.

**Running the app for browser checks:** use the preview tool's `frontend` config from `.claude/launch.json` (port 5173). If another session already holds 5173, set `"autoPort": true` on that config.

---

### Task 1: Pure helpers with tests

**Files:**
- Modify: `frontend/package.json` (scripts)
- Create: `src/components/ui/format.js`, `src/components/ui/tones.js`, `src/hooks/themeStorage.js`, `src/components/shared/chartScale.js`
- Test: `frontend/tests/format.test.js`, `tones.test.js`, `themeStorage.test.js`, `chartScale.test.js`

**Interfaces:**
- Produces:
  - `formatStatus(word: string | null | undefined): string`: sentence case; `null`, `undefined` or `''` → `'—'`.
  - `SEVERITY_TONE: { LOW: 'ok', MODERATE: 'warn', SEVERE: 'danger' }` and `BEHAVIOR_TONE: { DECLINING: 'ok', STABLE: 'warn', GROWING: 'danger' }`.
  - `toneFor(map: object, word: string): 'ok' | 'warn' | 'danger' | 'off'`: `map[word]` or `'off'`.
  - `THEME_KEY = 'drms-theme'`.
  - `readStoredTheme(storage?: Storage): 'light' | 'dark'`.
  - `writeStoredTheme(theme, storage?): void`. The storage argument defaults to `globalThis.localStorage`; any throw is swallowed.
  - `makeYScale({ min, max, top, height, invert }): (v: number) => number`: maps `[min, max]` to `[top + height, top]`, or to `[top, top + height]` when `invert`.

- [ ] **Step 1: Add the script**

  Add `"test": "node --test tests/"` to the `scripts` block of `package.json`.

- [ ] **Step 2: Write the failing tests**

```js
// tests/format.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStatus } from '../src/components/ui/format.js';

test('sentence-cases status words', () => {
    assert.equal(formatStatus('AIRBORNE'), 'Airborne');
    assert.equal(formatStatus('BLIND ZONE'), 'Blind zone');
    assert.equal(formatStatus('NO DATA'), 'No data');
});
test('empty values render as em dash', () => {
    assert.equal(formatStatus(null), '—');
    assert.equal(formatStatus(undefined), '—');
    assert.equal(formatStatus(''), '—');
});
```

```js
// tests/tones.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEVERITY_TONE, BEHAVIOR_TONE, toneFor } from '../src/components/ui/tones.js';

test('severity and behaviour maps', () => {
    assert.equal(toneFor(SEVERITY_TONE, 'SEVERE'), 'danger');
    assert.equal(toneFor(SEVERITY_TONE, 'MODERATE'), 'warn');
    assert.equal(toneFor(BEHAVIOR_TONE, 'DECLINING'), 'ok');
});
test('unknown or missing words fall back to off', () => {
    assert.equal(toneFor(SEVERITY_TONE, 'EXTREME'), 'off');
    assert.equal(toneFor(SEVERITY_TONE, undefined), 'off');
});
```

```js
// tests/themeStorage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStoredTheme, writeStoredTheme, THEME_KEY } from '../src/hooks/themeStorage.js';

const mem = (init = {}) => {
    const d = { ...init };
    return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, d };
};
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('defaults to light', () => assert.equal(readStoredTheme(mem()), 'light'));
test('reads a stored dark', () => assert.equal(readStoredTheme(mem({ [THEME_KEY]: 'dark' })), 'dark'));
test('ignores garbage', () => assert.equal(readStoredTheme(mem({ [THEME_KEY]: 'purple' })), 'light'));
test('blocked storage falls back to light', () => assert.equal(readStoredTheme(broken), 'light'));
test('missing storage falls back to light', () => assert.equal(readStoredTheme(undefined), 'light'));
test('writes the theme', () => { const s = mem(); writeStoredTheme('dark', s); assert.equal(s.d[THEME_KEY], 'dark'); });
test('write to blocked storage does not throw', () => assert.doesNotThrow(() => writeStoredTheme('dark', broken)));
```

  `readStoredTheme(undefined)` must not fall back to `globalThis.localStorage`; that global is absent in Node. Implement the default with `arguments.length === 0 ? globalThis.localStorage : storage`, or an equivalent that treats an explicit `undefined` as "no storage".

  Read `globalThis.localStorage` *inside* the `try`. Merely accessing it throws a `SecurityError` in some browsers when storage is blocked.

```js
// tests/chartScale.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeYScale } from '../src/components/shared/chartScale.js';

test('normal: max at top', () => {
    const y = makeYScale({ min: 120, max: 210, top: 10, height: 150, invert: false });
    assert.equal(y(210), 10);
    assert.equal(y(120), 160);
});
test('inverted: min at top so falling distance rises', () => {
    const y = makeYScale({ min: 120, max: 210, top: 10, height: 150, invert: true });
    assert.equal(y(120), 10);
    assert.equal(y(210), 160);
    assert.ok(y(146) < y(188));
});
```

- [ ] **Step 3: Run the tests and verify they fail**

  Run: `npm test`
  Expected: FAIL. Every suite errors with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement the four modules**

  Write them with the signatures from **Interfaces**. Each is a few lines. `formatStatus` lower-cases the word, then upper-cases the first character.

- [ ] **Step 5: Run the tests and verify they pass**

  Run: `npm test && npm run lint`
  Expected: all tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add package.json tests src/components/ui/format.js src/components/ui/tones.js src/hooks/themeStorage.js src/components/shared/chartScale.js
git commit -m "feat(ui): add status, tone, theme-storage and chart-scale helpers with tests"
```

---

### Task 2: Tokens, fonts, theme hook, StatusDot

**Files:**
- Modify: `frontend/index.html`, `src/index.css`, `src/components/shared/Sidebar.jsx` (theme wiring only), `src/components/shared/StatusDot.jsx`
- Create: `src/hooks/useTheme.js`, `src/components/shared/StatusDot.module.css`

**Interfaces:**
- Consumes: `readStoredTheme` and `writeStoredTheme` (Task 1).
- Produces:
  - `useTheme(): [theme: 'light' | 'dark', toggleTheme: () => void]`.
  - All tokens in §4.1, under exactly those names.
  - `StatusDot({ tone?, value? })`. The `pulse` prop is removed; existing `pulse` call sites keep compiling because the prop is simply ignored until pages are migrated.

- [ ] **Step 1: Update `index.html`**

  Replace the Inter / Plex Mono link with:

  `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap`

  Set `<title>DRMS</title>` and fix the font comment.

- [ ] **Step 2: Rewrite `index.css`**

  - Light tokens on `:root`, dark tokens on `:root[data-theme='dark']`, with the values from the §4.1 table.
  - `body`: `font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 13px; line-height: 1.4; background: var(--bg); color: var(--text)`.
  - Add a `.mono` utility: Plex Mono plus `font-variant-numeric: tabular-nums`.
  - Keep the old token names as **temporary aliases** in a block commented `/* legacy aliases — removed in Task 10 */`, so unmigrated pages keep rendering:
    - `--bg-color: var(--bg)`
    - `--text-color: var(--text-strong)`
    - `--text-secondary: var(--text-muted)`
    - `--border-color: var(--line)`
    - `--icon-color: var(--text-faint)`
    - `--icon-hover: var(--text-strong)`
    - `--alert-bg: var(--bad-soft)`
    - `--video-container: var(--surface-sunken)`
    - `--map-bg: var(--surface-sunken)`
    - `--map-line: var(--line)`
    - `--panel-hover: var(--surface-sunken)`
    - `--warn: var(--attention)`
    - `--danger: var(--bad)`
    - `--fire: var(--bad)`
    - `--flood: var(--water)`
    - `--teal: var(--water)`

    `--ok` is already a new token.

- [ ] **Step 3: Implement `useTheme`**

  - Initial state comes from `readStoredTheme()`.
  - An effect sets `document.documentElement.dataset.theme` and calls `writeStoredTheme`.
  - `toggleTheme` flips the value.
  - In `Sidebar.jsx`, replace the `isLightMode` state and its effect with `const [theme, toggleTheme] = useTheme()`. Keep the markup: show Sun with "Light" when `theme === 'light'`, otherwise Moon with "Dark".

- [ ] **Step 4: Move StatusDot to its own CSS module**

  - `.dot`: 7px circle, no box-shadow.
  - `.ok`, `.warn`, `.danger`, `.off` use background `--ok`, `--attention`, `--bad`, `--text-muted`.
  - Drop `pulse` from the props and markup.

- [ ] **Step 5: Verify**

  Run: `npm test && npm run lint && npm run build`
  Expected: all pass.

  Then open `/live` in the preview:
  - The app opens in **light** with the old layouts.
  - The toggle switches to dark, and reloading keeps dark.
  - In DevTools, `localStorage.setItem('drms-theme','purple')` followed by a reload opens in light.

- [ ] **Step 6: Commit**

```bash
git add index.html src/index.css src/hooks/useTheme.js src/components/shared/Sidebar.jsx src/components/shared/StatusDot.jsx src/components/shared/StatusDot.module.css
git commit -m "feat(ui): night-ops tokens, Plex fonts, persisted light-default theme"
```

---

### Task 3: UI primitives

**Files:**
- Create: `src/components/ui/Card.jsx`, `Readout.jsx`, `Chip.jsx`, `KeyValue.jsx`, `Segmented.jsx`, `Button.jsx`, each with its own `.module.css`, plus `src/components/ui/index.js` (named re-exports).

**Interfaces:**
- Consumes: `formatStatus` (Task 1) and `toneOf` from `src/utils/status.js`.
- Produces (exact props; styling per the §6 table):
  - `Card({ title?, meta?, className?, children })`
  - `Readout({ label, value, unit?, sub?, tone?, size = 'md' })`. `size` is `'md' | 'hero'`; `tone` applies to the value colour.
  - `Chip({ value?, tone?, children? })`. Text is `children ?? formatStatus(value)`; tone is `tone ?? toneOf(value)`.
  - `KeyValue({ rows })`, where `rows` is `[{ label, value }]`. A string or number `value` renders in `.mono`; a node renders as-is.
  - `Segmented({ options, value, onChange, multi = false })`. `options` is `[{ key, label }]`. When `multi`, `value` is an object `{ [key]: boolean }`, matching the Map page's `layers` state.
  - `Button({ variant = 'default', size?, className?, ...buttonProps })`. `variant` is `'primary' | 'default' | 'danger'`; `size` is `'sm'`; `type` defaults to `"button"`.

- [ ] **Step 1: Implement the six components and the barrel**

  - Tone classes in `Chip`: `ok` → `--ok` on `--ok-soft`; `warn` → `--attention-text` on `--warn-soft`; `danger` → `--bad` on `--bad-soft`; `off` → `--text-muted` on `--surface-sunken`.
  - `Card` uses a 1px `--line` border in light and `border-color: transparent` under `:root[data-theme='dark']`. Use `:global([data-theme='dark']) .card` in the module.

- [ ] **Step 2: Verify**

  Run: `npm run lint && npm run build`
  Expected: pass. The primitives get exercised visually in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui
git commit -m "feat(ui): add Card, Readout, Chip, KeyValue, Segmented, Button primitives"
```

---

### Task 4: Shell (Sidebar + TopBar)

**Files:**
- Create: `src/components/shared/TopBar.jsx`, `TopBar.module.css`
- Modify: `src/components/shared/Sidebar.jsx`, `Sidebar.module.css`, `src/App.jsx`

**Interfaces:**
- Consumes: `useTheme` (Task 2); `useAppData()` (`drone`, `fireSnapshots`, `modules`); `StatusDot`; `SEVERITY_TONE` and `toneFor` (Task 1); `reportingSensors` from `utils/flood.js`; `useNow`; `formatStatus`.
- Produces: `TopBar({ title, subtitle?, actions? })`. Every page renders it as its first child from Task 5 on.

- [ ] **Step 1: Implement `TopBar`**

  Follow §5.3. The clock uses the exact `toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })` call from the current `Header.jsx`, suffixed with ` PHT`. The drone state text is `` `${drone.id} · ${formatStatus(drone.flight)}` ``, and the link text is `` `Link ${formatStatus(drone.link)}` ``.

- [ ] **Step 2: Restyle `Sidebar`**

  Follow §5.2: 64px wide, wordmark, icon 18px above a 10.5px label, active styling, and status dots.
  - The Fire dot uses `toneFor(SEVERITY_TONE, fireSnapshots[0]?.severity)`. Render nothing when the tone is `'off'`.
  - The Flood dot uses `--water` when `reportingSensors(modules).length > 0`.

- [ ] **Step 3: Remove `<Header />` from `App.jsx`**

  Remove the import too. Keep `Header.jsx` on disk until Task 10.

- [ ] **Step 4: Verify**

  Run: `npm run lint && npm run build`

  Then check in the preview:
  - The sidebar is slim with the five current icons.
  - Fire shows a red-orange dot, Flood a blue dot, and the active route has an amber edge.
  - Theme toggle is at the bottom.
  - Pages still render, using their old `PageHeader`.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/TopBar.jsx src/components/shared/TopBar.module.css src/components/shared/Sidebar.jsx src/components/shared/Sidebar.module.css src/App.jsx
git commit -m "feat(ui): slim sidebar with status dots and merged TopBar"
```

---

### Task 5: Live page (+ CameraFeed, TacticalMap)

**Files:**
- Modify: `src/pages/Live.jsx`, `Live.module.css`, `src/components/shared/CameraFeed.jsx`, `CameraFeed.module.css`, `TacticalMap.jsx`, `TacticalMap.module.css`

**Interfaces:**
- Consumes: `TopBar` (Task 4); `Card`, `Readout`, `Chip`, `KeyValue`, `Segmented`, `Button` (Task 3).
- Produces: restyled `CameraFeed` and `TacticalMap` with **unchanged props**. Tasks 7 and 9 rely on that.

- [ ] **Step 1: Restyle `CameraFeed`**

  Follow §6.1: delete the scanlines, corners and crosshair markup and CSS. The scrim pills show `Live · RGB` / `Live · Thermal`, `30 fps · 4K` / `30 fps · IR`, `site.coords`, and `` `Alt ${Math.round(altitudeRel)} m · Hdg ${pad3(heading)}°` ``. Detection boxes and labels are amber.

  The feed renders `children` in a top-left overlay slot, so Live can place its toggles there. This is the only prop addition.

- [ ] **Step 2: Restyle `TacticalMap`**

  Follow §6.1: keep every marker, layer, `onSelect` and `dropPoints`. Remove the overlay header and the LIVE badge.
  - Module label: `` `${m.id} · ${m.distance} cm` `` only when `DEPLOYED`; status text via `formatStatus`.
  - Drone label: `` `Alt ${Math.round(drone.altitudeRel)} m` ``.
  - Hazard labels: "Flame" and "Smoke".
  - Scale "100 m".

- [ ] **Step 3: Rebuild `Live.jsx`**

  Follow §7.1. Keep the `mode` and `showDetections` state.

- [ ] **Step 4: Verify**

  Run: `npm run lint && npm run build`

  In the preview, check every §8 Live row in light and dark:
  - RGB/Thermal changes the feed filter and pill text.
  - The detections toggle hides and shows the boxes.
  - At 1280×800 there's no horizontal scroll.
  - `/map` and `/flood` still render their maps.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Live.jsx src/pages/Live.module.css src/components/shared/CameraFeed.* src/components/shared/TacticalMap.*
git commit -m "feat(live): night-ops Live page; quieter camera feed and site map"
```

---

### Task 6: Fire page (+ MlFrame)

**Files:**
- Modify: `src/pages/FireAssessment.jsx`, `FireAssessment.module.css`, `src/components/fire/MlFrame.jsx`, `MlFrame.module.css`

**Interfaces:**
- Consumes: `TopBar`; the primitives; `SEVERITY_TONE`, `BEHAVIOR_TONE` and `toneFor` from `components/ui/tones.js`. Delete the local copies in `FireAssessment.jsx`.
- Produces: none.

- [ ] **Step 1: Restyle `MlFrame`**

  Follow §6.1. The frame tag text becomes a `tag` prop: Fire passes `"Frame 87 · latest · 14:06 PHT"`, and the default is `` `Frame ${snapshot.frame}` ``. `small` is unchanged.

- [ ] **Step 2: Rebuild `FireAssessment.jsx`**

  Follow §7.2. Keep the `selectedId` and `highlightId` state and the sorting.

  The page currently imports shared table and layout classes as `base` from `Assessment.module.css`. Move whatever Fire still needs into `FireAssessment.module.css` and drop that import, so Flood is the file's only user before Task 7 renames it.
  - Smoke chip: `tone="warn"` with `` `Plume detected · ${conf.toFixed(2)}` ``, or `tone="ok"` with "Clear air".
  - `timeAgo` output is shown through `formatStatus`, so "JUST NOW" becomes "Just now" and "3 MIN AGO" becomes "3 min ago".

- [ ] **Step 3: Verify**

  Run: `npm run lint && npm run build`

  Check every §8 Fire row in both themes:
  - Capture shows "Analysing…" and the button is disabled; a new frame then appears first in the strip and is selected.
  - Clicking frame 41 changes the image, the table, confidence 38.7 and Severity "Low" (green).
  - Row hover highlights its box and dims the others.
  - 1280 px has no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add src/pages/FireAssessment.* src/components/fire/MlFrame.*
git commit -m "feat(fire): night-ops Fire page with model result card and snapshot strip"
```

---

### Task 7: Flood page (+ LineChart invert)

**Files:**
- Modify: `src/pages/FloodAssessment.jsx`, `src/pages/Assessment.module.css` (Flood is its only remaining user after Task 6; rename it to `FloodAssessment.module.css`), `src/components/shared/LineChart.jsx`, `LineChart.module.css`

**Interfaces:**
- Consumes: `makeYScale` (Task 1); `TopBar`; the primitives; the `utils/flood.js` functions, unchanged.
- Produces: `LineChart` gains `min = 0` and `invert = false` props. Its y mapping goes through `makeYScale({ min, max: top, top: PAD.top, height: innerH, invert })`. Tick labels are computed from `[min, (min+top)/2, top]`.

- [ ] **Step 1: Add `min` and `invert` to `LineChart`**

  The tick values must still line up with the gridlines when inverted. Restyle the grid and axis text with tokens.

- [ ] **Step 2: Rebuild `FloodAssessment.jsx`**

  Follow §7.3.
  - `SERIES_COLORS` becomes `['var(--series-1)', 'var(--series-2)', 'var(--series-3)']`.
  - Call the chart with `min={120} max={210} invert`.
  - The Lowest battery `Readout` gets `tone="warn"` when `weakest.battery < 50`.
  - Null-safe values: `weakest` / `latest` null → `'—'`, and sub `'No data'`.

- [ ] **Step 3: Verify**

  Run: `npm run lint && npm run build`

  Check every §8 Flood row in both themes:
  - The FM-01 line rises left to right.
  - Selecting a sensor works from both the map marker and a table row.
  - The 9 columns fit at 1280 px.

- [ ] **Step 4: Edge check — zero sensors**

  Recall FM-01, FM-02 and FM-03 from the Flight dock: the current Flight page works for this, and so does Task 8's version. Then open `/flood`:
  - KPIs show `0/5` and `—`.
  - The chart has no lines and no crash.
  - The selected card says "No sensors reporting", and the table shows the same empty state.
  - The sidebar Flood dot is gone.

  Reload to restore the mock state.

  Fix any failure and repeat this check.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages src/components/shared/LineChart.*
git commit -m "feat(flood): night-ops Flood page; inverted distance chart"
```

---

### Task 8: Flight page (+ DroneDock)

**Files:**
- Modify: `src/pages/Instrument.jsx`, `Instrument.module.css`, `src/components/flood/DroneDock.jsx`, `DroneDock.module.css`

**Interfaces:**
- Consumes: `TopBar`; `Card`, `Readout`, `Chip`, `KeyValue`, `Button`.
- Produces: none.

- [ ] **Step 1: Restyle `DroneDock`**

  Follow §6.1: wrap it in a `Card` and use `Button` variants. Keep the logic, `window.confirm` text, hints and `DOCK_SLOTS` as they are. Labels become sentence case: "In dock (1/1)", "On the water (3)", "Slot 1", "Batt 100%", `` `Drop at ${id}` ``, "Select a point", "Cancel", "Recall", "Dropping".

- [ ] **Step 2: Restyle the drone SVG in `Instrument.jsx`**

  Follow §7.4: same geometry, rotation maths and propeller animation. Remove the `instrumentGlow` and `bodyFill` gradients, the `Stat` component and the `.connector` CSS. Battery cells use `--attention` when `t.battery < 30`.

- [ ] **Step 3: Rebuild the page layout**

  Follow §7.4: TopBar actions, the 4 cards around the centre column (`1fr minmax(380px, 460px) 1fr`) and the dock below. Keep the `demo` effect unchanged.

- [ ] **Step 4: Verify**

  Run: `npm run lint && npm run build`

  Check every §8 Flight row in both themes:
  - Demo spins the compass and jitters the values; Stop halts them.
  - Props spin.
  - 1280 px has no horizontal scroll.

- [ ] **Step 5: Edge check — module mid-drop**

  Select slot FM-04, pick DP-1 and click Drop. During the 4 s window:
  - The dock list shows a warn "Dropping" chip.
  - `/map` shows FM-04 at Bagong Silang Elementary with "Deploying" and **no** "null cm".
  - `/flood` doesn't list FM-04 yet.

  After 4 s, FM-04 appears on Flood with 192 cm.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Instrument.* src/components/flood/DroneDock.*
git commit -m "feat(flight): grouped telemetry around restyled drone view; dock as card"
```

---

### Task 9: Map page

**Files:**
- Modify: `src/pages/MapPage.jsx`, `MapPage.module.css`

**Interfaces:**
- Consumes: `TopBar`; `Card`, `Chip`, `KeyValue`, `Segmented` (with `multi`, `value={layers}`, `onChange={toggle}`).
- Produces: none. After this task nothing imports `PageHeader`, `StatusTable` or `DroneTelemetry`.

- [ ] **Step 1: Rebuild `MapPage.jsx`**

  Follow §7.5. Legend swatch classes use the same tokens as `TacticalMap`: drone `--attention` ring, path dashed `--text-muted`, home outlined `--text-strong`, module `--water`, flame `--bad`, smoke `--text-muted`, water `--water-fill`.

- [ ] **Step 2: Verify**

  Run: `npm run lint && npm run build`

  Check every §8 Map row in both themes:
  - Each layer toggle hides and shows its layer.
  - Clicking the drone, then FM-02, swaps the Selected card between the drone and sensor rows.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MapPage.*
git commit -m "feat(map): night-ops Map page with selected, position and legend cards"
```

---

### Task 10: Cleanup and full verification

**Files:**
- Delete: `src/components/shared/Header.jsx`, `Header.module.css`, `PageHeader.jsx`, `PageHeader.module.css`, `StatusTable.jsx`, `DroneTelemetry.jsx`, `Details.module.css`, `ui.module.css`
- Modify: `src/index.css` (remove the legacy alias block), plus any file still referencing an alias

- [ ] **Step 1: Confirm the dead files have no importers**

  Run: `grep -rnE "Header'|PageHeader|StatusTable|DroneTelemetry|Details.module|ui.module" src`
  Expected: no output. Fix any importer first.

- [ ] **Step 2: Delete the dead files and the alias block**

  Then run: `grep -rnE "var\(--(bg-color|text-color|text-secondary|border-color|icon-color|icon-hover|alert-bg|video-container|map-bg|map-line|panel-hover|warn|danger|fire|flood|teal)\)" src`
  Expected: no output.

- [ ] **Step 3: Costume grep (§9.5)**

  Run: `grep -rnE "letter-spacing|text-transform: *uppercase|@keyframes pulse|box-shadow: *0 0|'— |scanline|corner|crosshair" src`
  Expected: no output.

- [ ] **Step 4: Contrast pass**

  For each theme, compute the contrast of `--text`, `--text-muted`, `--text-faint`, `--attention-text`, `--bad`, `--ok` and `--water` against `--bg` and `--surface`. Use a short throwaway node script with the WCAG relative-luminance formula; don't commit it. Every pair must be ≥ 4.5:1.

  Adjust any failing token value in `index.css`, keeping its hue, and record the change in the commit message.

- [ ] **Step 5: Full pass**

  Run: `npm test && npm run lint && npm run build`

  Then, at 1280×800 and in both themes, screenshot all 5 pages and re-tick the whole of §8. Repeat the theme persistence and blocked-storage checks from Task 2 step 5.

- [ ] **Step 6: Commit**

```bash
git add -A src index.html
git commit -m "chore(ui): remove legacy header, tables and token aliases; contrast fixes"
```
