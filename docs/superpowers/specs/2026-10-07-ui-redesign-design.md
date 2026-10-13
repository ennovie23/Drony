# DRMS UI Redesign — Design Spec

**Date:** 2026-10-07
**Branch:** `frontend`
**Scope:** `frontend/` presentation layer only

## 1. Goal

Redesign the DRMS (Disaster Response Management System) interface so it no longer reads as "AI slop" or a SaaS template, and instead looks like software built for a DRRMO operator running a single-drone fire and flood mission in Bagong Silang, Caloocan.

**Audience:** a capstone panel *and* real responders. The bar is "would hold up in front of an operator", which also makes it credible to the panel.

**What is wrong today (all five confirmed by the user):**

1. Monospace for everything, plus all-caps, letter-spaced labels.
2. "Hacker HUD" costume: glows, pulsing dots, `— SECTION` tags, scanlines, corner brackets, crosshair.
3. Generic layout: big title, stat row, panels in a grid, repeated on every page, with two stacked headers.
4. Neon accents (orange, sky, teal, green) competing on near-black.
5. Nothing that feels built for the job.

**Success criteria**

- Every value and interaction on today's five pages is still on its page (Section 8 is the checklist).
- None of the costume patterns remain (Section 9, check 5).
- Both themes pass WCAG AA contrast for text.
- `npm run lint` and `npm run build` pass.

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Direction | **"Night ops desk"**: calm, muted, no glow. Colour carries meaning only. |
| D2 | Data | **Strict.** Use only what `useAppData()` and `jsnSpec` / `dropPoints` provide today. No invented fields: no alarm levels, gauge heights, event log, or operator name. |
| D3 | Sidebar | **Slim** (~64px): icon above label, using the **current lucide icons**: `Radio`, `Flame`, `Waves`, `Drone`, `Map`, `Sun`/`Moon`. |
| D4 | Flight page | **Keep the drone top-view illustration** (spinning props, counter-rotating compass ring) as the centrepiece, restyled. |
| D5 | Themes | **Light is the default**; the toggle switches to dark. The choice persists. |
| D6 | Approach | New tokens + six shared primitives + one merged top bar + page-by-page layout rework. No new dependencies. |

## 3. Constraints and non-goals

**Unchanged:** `src/data/mock.js`, `src/context/*`, `src/utils/*` (`flood.js`, `format.js`, `status.js`), `src/hooks/useNow.js`, the backend, and the routes (`/live`, `/fire`, `/flood`, `/flight`, `/map`, `*` → `/live`).

**Out of scope:** phone or tablet layouts (desktop and laptop only, ≥1280px wide), new features, the data layer, and backend wiring.

**Allowed derivations:** display formatting of existing values (sentence case, units, `toFixed`) and reuse of existing util functions. Beyond that, exactly these presentation rules, computed from existing fields:

- the Fire and Flood sidebar dots (Section 5.2)
- the Lowest battery readout turns `warn` below 50% (Section 7.3)
- Flight battery cells turn `--attention` below 30% (Section 7.4)

No new data fields.

## 4. Foundations

### 4.1 Colour tokens (`src/index.css`)

Light values sit on `:root`. Dark values sit on `:root[data-theme='dark']`. Components use tokens only, never raw hex. The one exception is the camera and snapshot overlays, which sit on imagery and use fixed dark scrims and amber boxes in both themes.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | page background | `#F3F1EC` | `#1B1D20` |
| `--surface` | cards | `#FFFFFF` | `#212428` |
| `--surface-sunken` | map background, tracks | `#E9E6DE` | `#202326` |
| `--rail` | sidebar | `#E9E6DF` | `#16181A` |
| `--line` | borders and dividers | `#DDD9D0` | `#2C2F33` |
| `--text` | body | `#3A3B3E` | `#D8D5CE` |
| `--text-strong` | headings, numbers | `#141517` | `#F2EFE8` |
| `--text-muted` | labels, secondary | `#5B5F64` | `#9A9DA2` |
| `--text-faint` | tertiary (units, captions) | `#6F7378` | `#7F8389` |
| `--attention` | fill: active nav edge, primary button, detection boxes | `#E6A52A` | `#F5B83D` |
| `--attention-text` | attention as text or icon | `#9A6410` | `#F5B83D` |
| `--on-attention` | text on an attention fill | `#141517` | `#1B1D20` |
| `--bad` / `--bad-soft` | severe, growing, recall, errors | `#B9442A` / `#F8E4DE` | `#E8806A` / `#3A2420` |
| `--ok` / `--ok-soft` | good, fixed, valid, airborne | `#2E7A47` / `#E0EFE4` | `#8FCB9B` / `#1F3226` |
| `--warn-soft` | soft background for attention chips | `#F6EAD2` | `#3A2C12` |
| `--water` | flood sensors, creek | `#2C6A91` | `#7FB7D9` |
| `--water-fill` | creek area on maps | `#8DB6CF` | `#3E6E8C` |
| `--series-1..3` | chart series | `#2C6A91`, `#7A5FB0`, `#9A7B3C` | `#7FB7D9`, `#B9A6E0`, `#C9B48A` |

The old tokens (`--bg-color`, `--text-color`, `--fire`, `--flood`, `--teal`, etc.) are removed. All references are migrated.

### 4.2 Typography

- Load **IBM Plex Sans** (400, 500, 600) and **IBM Plex Mono** (400, 500) in `index.html`. Remove Inter.
- Plex Sans for all text. **Plex Mono only for numbers and IDs** (readouts, table cells with numbers, `DRMS-01`, `FM-01`, coordinates, clock).
- **Sentence case** for every label, title, and button ("Battery", "Capture snapshot"). IDs keep their own casing. Status words coming from data (`AIRBORNE`, `SEVERE`, `VALID`) are shown in sentence case through one helper, `formatStatus(word)`, which lives in the new `src/components/ui/format.js` (presentation only).
- No `letter-spacing` and no `text-transform: uppercase`.
- Type scale (px): **12** labels and captions · **13** body and tables · **16** page title · **24** readouts · **34** single hero number per page.
- `<title>` becomes `DRMS`.

### 4.3 Status tones

`utils/status.js` → `toneOf()` is unchanged. Tones map to tokens as follows:

| Tone | Text | Soft background |
|---|---|---|
| `ok` | `--ok` | `--ok-soft` |
| `warn` | `--attention-text` | `--warn-soft` |
| `danger` | `--bad` | `--bad-soft` |
| `off` | `--text-muted` | `--surface-sunken` |

No pulsing anywhere. `StatusDot` loses its `pulse` prop and the `pulse` keyframes are deleted.

### 4.4 Theme

- New hook `src/hooks/useTheme.js` returns `[theme, toggleTheme]`. It sets `document.documentElement.dataset.theme`.
- Initial value: `localStorage['drms-theme']` if it is `'light'` or `'dark'`, otherwise `'light'`. Reads and writes are wrapped in `try/catch` so it falls back to light when storage is unavailable.
- The Sidebar consumes it. The theme logic is removed from `Sidebar.jsx`.

## 5. Shell

### 5.1 Layout

`App.jsx` keeps the structure Sidebar + column(main). The global `<Header />` is removed from `App.jsx`. Each page renders its own `TopBar` as the first child, so page-specific actions live with the page.

### 5.2 Sidebar (`components/shared/Sidebar.jsx`)

- Width 64px. Background `--rail`, right border `--line`.
- Wordmark "DRMS" at the top (600, 13px, `--text-strong`).
- Five `NavLink`s with the same routes, labels, and icons as today. Each shows an 18px icon (stroke 1.75) above a 10.5px label.
- Active state: `--surface` background, inset 2px left edge in `--attention`, icon colour `--attention-text`, label `--text-strong`.
- Status dots (7px, top-right of the item):
  - **Fire:** `SEVERITY_TONE[fireSnapshots[0].severity]` (`LOW → ok`, `MODERATE → warn`, `SEVERE → danger`), the same map the Fire page already uses. `toneOf()` can't be used because `SEVERE` isn't in its lists. The map moves to `components/ui/tones.js` and both places import it.
  - **Flood:** `--water` when `reportingSensors(modules).length > 0`; no dot otherwise.
- Theme toggle at the bottom: `Sun` icon labelled "Light" when light, `Moon` labelled "Dark" when dark (same pattern as today).

### 5.3 TopBar (`components/shared/TopBar.jsx`) — replaces `Header` and `PageHeader`

Props: `title`, `subtitle`, `actions` (node). It's one row with padding 11px 20px and a bottom border `--line`.

- **Left:** `title` (16px, 600, `--text-strong`) followed by `subtitle` (14px, `--text-faint`).
- **Right, every page, in this order:**
  1. the page's `actions`
  2. drone state: a `StatusDot` with the `drone.flight` tone, then "DRMS-01 · Airborne"
  3. link: "Link Good" with a `StatusDot` tone
  4. clock: `HH:MM:SS PHT` in mono, from `useNow()` (same formatting as the current Header)

`Header.jsx`, `Header.module.css`, `PageHeader.jsx`, and `PageHeader.module.css` are deleted.

## 6. Shared components (`src/components/ui/`)

These replace `ui.module.css`, `Details.module.css`, `StatusTable.jsx`, and `DroneTelemetry.jsx`. Each component has its own `.module.css`.

| Component | Props | Notes |
|---|---|---|
| `Card` | `title?`, `meta?` (node), `children`, `className?` | `--surface`, 1px `--line` border (light) or none (dark), radius 5px, padding 12px 14px. The header row has the title (13.5px, 600) on the left and meta (12px, `--text-faint`) on the right. |
| `Readout` | `label`, `value`, `unit?`, `sub?`, `tone?`, `size?` (`'md'` 24px or `'hero'` 34px) | Value in mono `--text-strong` (or tone colour); unit 12px sans `--text-faint`; sub 12px `--text-muted`. |
| `Chip` | `value` *or* `tone` + `children` | Text from `formatStatus(value)`; tone from `toneOf(value)` unless a `tone` is passed. 12px, 600, radius 3px, padding 2px 8px. |
| `KeyValue` | `rows: [{ label, value }]` (value may be a node) | Label `--text-muted`, value right-aligned (mono if it's a string or number); 1px `--line` dividers. |
| `Segmented` | `options: [{ key, label }]`, `value` (key or Set of keys), `onChange(key)`, `multi?` | Selected option: `--surface` background, `--text-strong`, inset 2px bottom edge `--attention`. |
| `Button` | `variant` (`'primary'`, `'default'`, `'danger'`), `size?` (`'sm'`), plus native button props | Primary: `--attention` fill with `--on-attention` text. Default: `--line` border. Danger: `--bad` text with a muted `--bad` border. Disabled: opacity 0.45. |

Kept and restyled: `StatusDot` (tone colours, no pulse), `LineChart`, `TacticalMap`, `CameraFeed`, `MlFrame`, `DroneDock`.

### 6.1 Restyled components

- **`CameraFeed`:** remove scanlines, corner brackets, and crosshair. Detection boxes are 2px `--attention` with a filled label (`fire 0.79`). The overlay uses small dark scrim pills:
  - top-left: mode toggles (rendered by Live)
  - top-right: `Live · RGB` and `30 fps · 4K` (or `IR` in thermal)
  - bottom-left: coords
  - bottom-right: `Alt 42 m · Hdg 062°`

  The thermal filter stays. Props are unchanged.
- **`MlFrame`:** amber boxes and labels. Highlighted box: full opacity, 3px. Dimmed box: 35% opacity. The frame tag "Frame 87" is a scrim pill. The `small` variant is unchanged in behaviour.
- **`TacticalMap`:**
  - Background `--surface-sunken`, grid and contours in `--line`, water `--water-fill`.
  - Fire zones: `--bad` at low opacity, outer ring dashed. Flame markers `--bad`, smoke markers `--text-muted`.
  - Flight path: dashed `--text-muted`. Home: outlined square "H".
  - Drone: `--attention` ring with "Alt 42 m".
  - Flood modules: `--water` dots with "FM-01 · 146 cm" and the status in sentence case. Selected marker: `--text-strong` ring.
  - Kept: the north indicator, the 100 m scale bar, and the sector badge.
  - Removed: the "SITE OVERLAY / FIRE · FLOOD · TRACKING" header and the pulsing LIVE badge.
  - Props and behaviour are unchanged, including `dropPoints`.
- **`LineChart`:** new prop `invert` (default `false`). When true, the y-scale is flipped so a lower value is drawn higher, and an optional `min` prop sets the axis floor. Grid `--line`, axis text `--text-faint`. Existing props are unchanged.
- **`DroneDock`:** same state, flow, and `window.confirm` recall dialog. Rendered inside a `Card` titled "Payload dock · flood modules" with the latch `Chip` as meta. Selected slot: `--attention` border. Drop button: `Button primary`. Recall: `Button danger sm`. "Dropping" shows a warn `Chip`.

## 7. Pages

Every page renders `<TopBar>` and then a body with 14px padding and 14px gaps.

### 7.1 Live (`pages/Live.jsx`)

- **TopBar:** title "Live feed"; subtitle `${site.area}, ${site.city}`; action: inline label "Elapsed" with a mono value `T+00:46:12` (`formatElapsed(site.startedAt)`).
- **Grid:** `1fr 280px`.
- **Left:**
  - `CameraFeed` filling the height. In its top-left corner: `Segmented` RGB/Thermal and a `Button sm` reading "Detections on/off" with the `Eye`/`EyeOff` icon.
  - Below the feed, four `Readout`s: Battery `%`, Altitude `m`, Speed `m/s`, Heading `°` (padded to 3 digits).
- **Right:**
  - `Card` with `KeyValue`: GPS (`Chip`), Link (`Chip`).
  - `Card` titled "Flight map" with meta "`{distanceHome}` m from home", containing `TacticalMap compact` (path layer only), with `site.coords` underneath.

### 7.2 Fire (`pages/FireAssessment.jsx`)

- **TopBar:** title "Fire assessment"; subtitle area and city; action: `Button primary` with the `Camera` icon, label "Capture snapshot" or "Analysing…", disabled while `analyzing`.
- **Grid:** `1fr 290px`, then a full-width strip.
- **Left:**
  - `MlFrame` for the selected snapshot, with `highlightId`. Its tag reads "Frame 87 · latest · 14:06 PHT" ("latest" only when it is the latest snapshot).
  - `Card` titled "Detections (n)" with a table: Box, Label, Score (bar plus `0.79`), Position (x, y), Size (w × h). Rows are sorted by confidence. Row hover sets `highlightId`. Empty state: "No fire detected in this frame".
- **Right:**
  - `Card` titled "Model result", meta "Frame 87".
    - `Readout hero`: label "Active fire front", value `fireConfidence`, unit "% confidence".
    - `KeyValue`: Severity (`Chip`, `SEVERITY_TONE`), Behaviour (`Chip`, `BEHAVIOR_TONE`), Smoke plume (`Chip` "Plume detected · 0.61" in warn, or "Clear air" in ok).
  - `Card` with `KeyValue`: Captured (`timeAgo`), Boxes (count), Source ("DRMS-01 camera").
- **Strip:** `Card` titled "Snapshots (n)" with meta "Click a snapshot to view its result". It holds a horizontal grid of snapshot buttons:
  - each shows an `MlFrame small`, "Frame 87", a "Latest" tag, `85.2% · Severe` (severity tone colour), and `timeAgo`
  - selected: `--attention` border
  - while `analyzing`, a dashed "Analysing…" placeholder comes first

`SEVERITY_TONE` and `BEHAVIOR_TONE` move to `components/ui/tones.js`.

### 7.3 Flood (`pages/FloodAssessment.jsx`)

- **TopBar:** title "Flood sensors"; subtitle `Floating ${jsnSpec.model} modules · ${site.area}`; actions: inline "Sensor `JSN-SR04T`" and "Link `ESP32 · LoRa`".
- **Row 1:** four `Readout`s:
  - Sensors reporting `3/5`, sub "2 still in dock"
  - Last reading (`timeAgo`), sub "Every 5 s"
  - Valid readings `3/3`, sub "Range 25–450 cm"
  - Lowest battery `34%`, sub `FM-03`, tone `warn` when below 50
- **Row 2:** grid `1fr 1fr 300px`.
  - **Sensor positions** `Card`, meta "Click a sensor": `TacticalMap` with the flood layer, `selectedId`, and `onSelect`.
  - **Distance to water** `Card`, meta "cm · every 5 min":
    - `LineChart` with `invert`, `min` 120, `max` 210, and series colours `--series-1..3`
    - legend `FM-01 · Package 6 Creek` and so on
    - caption "Axis inverted: a rising line means rising water."
  - **Selected sensor** `Card`: title `{id} · {place}`, meta reading-status `Chip`.
    - `Readout hero`: distance, unit "cm to water".
    - `KeyValue`: Change (last 5 min), First reading, Echo time `µs`, Last reading, Deployed, Battery, Signal (`Chip` LoRa plus `dBm`).
    - Empty state: "No sensors reporting".
- **Row 3:** grid `1fr 300px`.
  - `Card` titled "Latest readings (n)" with a table of all 9 columns: Sensor (series swatch + ID), Place, Distance, Change, Echo, Reading (`Chip`), Battery, Signal, Updated. Clicking a row selects that sensor; the selected row is highlighted. Empty state: "No sensors reporting".
  - `Card` titled "Sensor · JSN-SR04T" with `KeyValue`: Type ("Waterproof ultrasonic"), Range, Accuracy, Frequency, Sample rate, Module ("Floating · ESP32 · LoRa").

### 7.4 Flight (`pages/Instrument.jsx`)

- **TopBar:** title "Flight"; subtitle `drone.id`; actions: `Chip` Armed/Disarmed, `Chip` "Mode · Auto" (off tone, strong text), and `Button default` "Demo state" or "Stop demo" (active state uses an `--attention` border).
- **Grid:** `1fr minmax(380px, 460px) 1fr`.
  - **Left column:** `Card` **Power** and `Card` **Position**.
    - Power: `Readout` "76 % · 15.2 V", sub "11 min estimated remaining".
    - Position: `Readout` GPS fix ("3D fix" when `satellites >= 6`, else `gps`), sub "15 sat · HDOP 0.8"; `KeyValue`: Distance to home `m`, Next waypoint `m`.
  - **Centre:** caption "DRMS-01 · top view", then the **drone illustration SVG**, then the 6-cell bar with "76% cell capacity".
  - **Right column:** `Card` **Motion** and `Card` **Link**.
    - Motion: `Readout` Altitude `m rel`, sub "57.0 m AMSL"; `Readout` Velocity `m/s`, sub "Climb 0.3 m/s".
    - Link: `Readout` signal `dBm`; `KeyValue`: Heartbeat `s`, Packet loss `%`.
- **Below (full width):** `DroneDock`.
- **Drone illustration restyle** (same geometry, rotation, and animation):
  - remove the `instrumentGlow` radial gradient and the `bodyFill` gradient; the body becomes a flat `--surface-sunken` fill with a `--text-muted` stroke
  - rings, ticks, and arms: `--line` / `--text-muted`; cardinals `--text-strong`
  - satellites: 3px `--text-faint` at 60% opacity
  - heading arrow `--attention`; heading text mono `--text-strong`
  - front LEDs `--ok`, rear LEDs `--bad`, static (no glow)
  - payload: `--line` outline with a `--text-muted` "F" label
  - filled battery cells `--ok`, or `--attention` when `battery < 30`
  - the connector lines (`.connector`) and their CSS are removed
- **Demo mode:** unchanged logic (heading +1.5°/s; jitter on altitude, velocity, climb, signal, heartbeat).

### 7.5 Map (`pages/MapPage.jsx`)

- **TopBar:** title "Site map"; subtitle `${site.area} · ${site.coords}`; action: multi-select `Segmented` for Flight path, Fire, and Flood (same `layers` state and toggle).
- **Grid:** `1fr 280px`. The map is `TacticalMap tall` filling the height.
- **Right column:**
  - `Card` titled "Selected":
    - **drone:** meta `DRMS-01`; `KeyValue` Battery, GPS (`Chip`), Link (`Chip`), Status (`Chip`), Flight (`Chip`)
    - **module:** meta module ID, title "JSN sensor"; `KeyValue` Status (`Chip`), Place, LoRa (`Chip`), Battery, Distance `cm`
    - **neither:** "Click a marker on the map."
  - `Card` titled "Position", meta `site.sector`: `KeyValue` Coordinates, Altitude `m rel`, Heading `°`, From home `m`.
  - `Card` titled "Legend": a two-column grid of the 7 items (Drone, Flight path, Home point, Flood module, Flame, Smoke, Flood water), with swatches drawn in the same tokens the map uses.

## 8. Data inventory (acceptance checklist)

Every value or control on today's pages and where it lives after the redesign. **Removed** items are decoration, not data.

### Global header (today) → TopBar

| Today | After |
|---|---|
| "Disaster Response Management System" | Removed as repeated text; "DRMS" wordmark in the sidebar |
| Page name | TopBar title |
| `LINK {drone.link}` + dot | TopBar right: Link + dot |
| PHT clock `HH:MM:SS` | TopBar right: clock |
| `{drone.id} · {drone.flight}` + pulse dot | TopBar right: drone state + static dot |

### Sidebar

| Today | After |
|---|---|
| 5 nav items, icons, labels, active state | Same items, icons, labels; restyled active state |
| Theme toggle Sun/Moon | Same, bottom; default light; persisted |
| — | New: Fire and Flood status dots (derived, 5.2) |

### Live

| Today | After |
|---|---|
| Eyebrow `drone.id` + flight status | TopBar right (global) |
| Title "LIVE FEED", subtitle area · city | TopBar title + subtitle |
| Stat ELAPSED `T+…` | TopBar action |
| RGB / THERMAL toggle | `Segmented` on the feed |
| DETECTIONS ON/OFF toggle | `Button sm` on the feed |
| Camera feed + detection boxes | `CameraFeed` (restyled) |
| Feed HUD: LIVE · mode, 30 FPS · 4K/IR, coords, ALT, HDG | Feed scrim pills (6.1) |
| BATTERY, ALTITUDE, SPEED, HEADING | 4 `Readout`s under the feed |
| GPS, LINK (with dots) | `KeyValue` card with `Chip`s |
| Flight map (path layer) | "Flight map" card |
| `site.coords`, `distanceHome` M FROM HOME | Under the map / card meta |

### Fire

| Today | After |
|---|---|
| Eyebrow `drone.id` · ML fire detection | Subsumed by TopBar drone state + title |
| Title, subtitle area · city | TopBar |
| CAPTURE SNAPSHOT / ANALYZING… (disabled while analysing) | TopBar primary `Button` |
| Section "Analyzed snapshot · Frame n", LATEST · time | `MlFrame` tag |
| `MlFrame` with boxes, labels, frame tag, highlight/dim | `MlFrame` (restyled) |
| DETECTIONS (n) table: Box, Label, Score bar + value, Position, Size; sorted; hover highlight | "Detections (n)" card, same columns and behaviour |
| Empty: NO FIRE DETECTED IN THIS FRAME | "No fire detected in this frame" |
| Intelligence report header, FRAME: n | "Model result" card, meta "Frame n" |
| ACTIVE FIRE FRONT `n% CONFIDENCE` | `Readout hero` |
| SEVERITY LABEL badge (tone) | Severity `Chip` |
| BEHAVIOR TREND badge (tone) | Behaviour `Chip` |
| SMOKE PLUME: PLUME DETECTED · conf / CLEAR AIR | Smoke plume `Chip` |
| CAPTURED (timeAgo), BOXES, SOURCE `drone.id` CAMERA | `KeyValue` card |
| DRONE SNAPSHOTS (n), "Click a snapshot…" | "Snapshots (n)" card + meta |
| Snapshot cards: thumb, FRAME n, LATEST, `conf% · severity` (tone), timeAgo, selected state | Same in the strip |
| ANALYZING… placeholder card | Same, dashed |

### Flood

| Today | After |
|---|---|
| Eyebrow `drone.id` · floating JSN modules | TopBar subtitle (first part); `drone.id` in TopBar right |
| Title, subtitle area · city | TopBar title; subtitle second part `site.area` (city is shown on Live and Fire) |
| Stats SENSOR `JSN-SR04T`, LINK `ESP32 · LORA` | TopBar actions |
| KPI Sensors reporting n/m + "n still in dock" | `Readout` |
| KPI Last reading + "every 5 s" | `Readout` |
| KPI Valid readings + "range 25–450 cm" | `Readout` |
| KPI Lowest battery + module ID / NO DATA | `Readout` (warn tone below 50) |
| Sensor positions map, click to select | "Sensor positions" card |
| Measured distance chart (cm / 5 min) + legend `id · place` | "Distance to water" card, inverted axis, legend |
| Selected sensor: `id · place`, reading status + dot | Card title + `Chip` |
| Distance `cm measured distance` | `Readout hero` |
| Change (last 5 min), First reading, Echo time, Last reading, Deployed, Battery, Signal (LoRa + dBm) | `KeyValue` |
| Empty: NO SENSORS REPORTING | "No sensors reporting" |
| Sensor spec: Type, Range, Accuracy, Frequency, Sample rate, Module | "Sensor · JSN-SR04T" card |
| Latest readings table, 9 columns, swatch, click to select, active row | "Latest readings (n)" card, same |

### Flight

| Today | After |
|---|---|
| Breadcrumb AIRCRAFT / `id`, title FLIGHT INSTRUMENT | TopBar title "Flight", subtitle `id` |
| Mode badge | TopBar `Chip` "Mode · Auto" |
| ARM STATE ARMED/DISARMED + check icon, "Flight controller" | TopBar `Chip` Armed/Disarmed |
| BATTERY `% · V`, "n MIN EST. REMAINING" | Power card |
| GPS FIX (3D FIX rule), `sat · HDOP` | Position card |
| DISTANCE TO HOME, NEXT WAYPOINT | Position card |
| FLIGHT MODE + "ARMED · YES/NO" | TopBar `Chip`s (mode + armed) |
| ALTITUDE `m REL` + AMSL | Motion card |
| VELOCITY + CLIMB | Motion card |
| TELEMETRY LINK dBm, HB, LOSS | Link card |
| `id / TOP VIEW` label | Caption above the illustration |
| Drone illustration: props, compass rotation, heading arrow + text, satellites, payload | Kept, restyled (7.4) |
| Cell bar + "n% CELL CAPACITY" | Kept under the illustration |
| Payload dock (latch, slots, deploy flow, drop points, on-the-water list, recall + confirm, dropping state, hints) | `DroneDock` in a `Card`, same flow |
| DEMO STATE / STOP DEMO | TopBar `Button` |
| Stat connector lines | **Removed** (decoration) |

### Map

| Today | After |
|---|---|
| Eyebrow `drone.id` + flight status | TopBar right (global) |
| Title SITE MAP, subtitle area · coords | TopBar |
| Layer toggles FLIGHT PATH / FIRE / FLOOD | TopBar multi `Segmented` |
| Tall map with drone, home, hazards, zones, water, modules, path, scale, sector, north | `TacticalMap tall` (restyled; all kept) |
| Map overlay header "SITE OVERLAY…", LIVE pulse badge | **Removed** (decoration) |
| Selected: drone telemetry (Battery, GPS, Link, Status, Flight) | "Selected" card |
| Selected: JSN sensor (Status, Place, LoRa, Battery, Distance) | "Selected" card |
| Empty: "Click a marker on the map." | Same |
| Position: Coordinates, Sector, Altitude, Heading, From home | "Position" card (sector as meta) |
| Legend (7 items) | "Legend" card |

## 9. Verification

There's no frontend test framework, and adding one is out of scope. Each step is verified as follows:

1. `npm run lint` and `npm run build` (in `frontend/`) pass with no new warnings.
2. **Inventory pass:** open each page in the browser and tick every row in Section 8.
3. **Interaction pass:**
   - Capture snapshot shows "Analysing…" and a new snapshot appears first, selected.
   - Selecting an older snapshot updates the frame and the model result.
   - Hovering a detection row highlights its box.
   - Selecting a sensor works from both the map and the table.
   - Deploying a module goes slot → drop point → Drop → "Dropping" → deployed on the map, the chart, and the readings.
   - Recall shows the confirm dialog and the module leaves the lists.
   - Map layer toggles, RGB/Thermal, and the detections toggle all work.
   - Demo mode animates.
   - The theme toggle works and persists after a reload, and the app falls back to light with storage blocked.
4. **Theme pass:** screenshot all 5 pages in light and dark. Check contrast of `--text`, `--text-muted`, `--text-faint`, `--attention-text`, `--bad`, `--ok`, and `--water` against `--bg` and `--surface` (AA ≥ 4.5:1 for text under 18px). Adjust token values if any pair fails.
5. **Costume grep** over `frontend/src` must return nothing for: `letter-spacing`, `text-transform: uppercase`, `@keyframes pulse`, `box-shadow: 0 0` (glows), `'— `, `scanlines`, `corner`, `crosshair`.

## 10. Build order

Each step leaves the app working:

1. Foundations: tokens, fonts, `<title>`, `useTheme`, `ui/` components, `tones.js`, `formatStatus`.
2. Shell: Sidebar and TopBar; remove Header from `App.jsx`. Until each page is migrated, it still renders `PageHeader`, so for those steps an unmigrated page temporarily shows no link or clock. That's acceptable mid-build.
3. Live → 4. Fire → 5. Flood → 6. Flight → 7. Map. Each page step migrates the page to `TopBar` and the primitives, restyles the components it owns, and runs the Section 9 checks for that page.
8. Cleanup: delete `Header*`, `PageHeader*`, `StatusTable`, `DroneTelemetry`, `Details.module.css`, `ui.module.css`, and any unused CSS; run the costume grep and the full theme pass.
