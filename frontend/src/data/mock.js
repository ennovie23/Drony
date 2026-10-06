// Mock data for the frontend. Every page reads from here (through AppDataProvider),
// so wiring up the backend later means replacing this file's exports with API calls.
//
// The system runs one drone at one site. It assesses fire through its camera + ML
// model and floods through modules it drops from its dock, both at the same time.

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

/* ── Drone ───────────────────────────────────────────────── */
export const drone = {
    id: 'DRMS-01',
    battery: 76,
    voltage: 15.2,
    minutesLeft: 11,
    gps: 'FIXED',
    satellites: 15,
    hdop: 0.8,
    link: 'GOOD',
    signal: -72,
    heartbeat: 0.4,
    loss: 1.2,
    status: 'CONNECTED',
    flight: 'AIRBORNE',
    armed: true,
    mode: 'AUTO',
    heading: 62,
    altitudeRel: 42.0,
    homeElevation: 15,
    velocity: 8.4,
    climb: 0.3,
    distanceHome: 680,
    nextWaypoint: 240,
    devices: [
        { label: 'CAMERA', value: 'STREAMING' },
        { label: 'THERMAL', value: 'ACTIVE' },
        { label: 'ML MODEL', value: 'ACTIVE' },
        { label: 'DOCK LATCH', value: 'READY' },
    ],
};

/* ── Site ────────────────────────────────────────────────── */
export const site = {
    area: 'Barangay Bagong Silang',
    city: 'Caloocan City, Metro Manila',
    region: 'NCR · PHILIPPINES',
    coords: '14.7392° N · 121.0198° E',
    sector: 'SECTOR A1',
    startedAt: minutesAgo(46),
    description:
        'Residential fire near Package 6 while the creek along Phase 1 overflows from heavy rain. Thermal sweep confirms active flame sources; flood modules dropped along the creek.',
};

// Map overlay. Marker positions are % of the frame; SVG paths use a 500 × 360 viewBox.
export const map = {
    path: 'M 50,300 Q 140,190 230,120 T 360,215',
    drone: { x: 46, y: 35 },
    home: { x: 10, y: 84 },
    hazards: [
        { kind: 'smoke', x: 62, y: 18 },
        { kind: 'flame', x: 66, y: 30 },
        { kind: 'flame', x: 80, y: 44 },
    ],
    zones: [{ cx: 370, cy: 140, r: 45 }, { cx: 370, cy: 140, r: 75 }],
    water: 'M 0,230 C 80,200 140,280 230,255 C 320,230 380,300 500,270 L 500,340 C 380,360 300,310 220,330 C 140,350 80,290 0,310 Z',
};

/* ── Fire (drone snapshots + ML detection) ──────────────── */
// The drone captures snapshots from its camera and the fire-detection model analyses
// each one. Every result matches the model's report: numbered frame, labelled boxes with
// a 0–1 score, overall fire-front confidence (%), severity, behavior trend and smoke status.
// Box positions are % of the frame. Newest snapshot first.
export const fireSnapshots = [
    {
        id: 'SNAP-087',
        frame: 87,
        capturedAt: minutesAgo(0.2),
        detections: [
            { id: 'D1', label: 'fire', confidence: 0.73, box: { x: 0, y: 2, w: 62, h: 86 } },
            { id: 'D2', label: 'fire', confidence: 0.13, box: { x: 13, y: 2, w: 76, h: 80 } },
            { id: 'D3', label: 'fire', confidence: 0.79, box: { x: 37, y: 4, w: 63, h: 89 } },
        ],
        fireConfidence: 85.2,
        severity: 'SEVERE',
        behavior: 'GROWING',
        smoke: { detected: false, confidence: 0 },
    },
    {
        id: 'SNAP-072',
        frame: 72,
        capturedAt: minutesAgo(3),
        detections: [
            { id: 'D1', label: 'fire', confidence: 0.81, box: { x: 8, y: 20, w: 50, h: 62 } },
            { id: 'D2', label: 'fire', confidence: 0.66, box: { x: 52, y: 24, w: 40, h: 58 } },
        ],
        fireConfidence: 79.4,
        severity: 'SEVERE',
        behavior: 'GROWING',
        smoke: { detected: true, confidence: 0.61 },
    },
    {
        id: 'SNAP-058',
        frame: 58,
        capturedAt: minutesAgo(7),
        detections: [{ id: 'D1', label: 'fire', confidence: 0.58, box: { x: 22, y: 34, w: 44, h: 46 } }],
        fireConfidence: 62.1,
        severity: 'MODERATE',
        behavior: 'GROWING',
        smoke: { detected: true, confidence: 0.48 },
    },
    {
        id: 'SNAP-041',
        frame: 41,
        capturedAt: minutesAgo(12),
        detections: [{ id: 'D1', label: 'fire', confidence: 0.34, box: { x: 30, y: 44, w: 30, h: 34 } }],
        fireConfidence: 38.7,
        severity: 'LOW',
        behavior: 'STABLE',
        smoke: { detected: false, confidence: 0 },
    },
];

/* ── Flood (floating JSN sensor modules) ─────────────────── */
// Each flood module is a floating device the drone drops from its dock: an ESP32 with a
// JSN-SR04T waterproof ultrasonic sensor, sending readings over LoRa. The frontend shows
// the raw sensor data only: measured distance and the echo/validity derived from it.
export const modules = {
    'FM-01': {
        id: 'FM-01',
        status: 'DEPLOYED',
        place: 'Package 6 Creek',
        deployedAt: minutesAgo(40),
        position: { x: 22, y: 72 },
        battery: 82,
        signal: -81,
        lora: 'GOOD',
        lastReadingAt: minutesAgo(0.1),
        distance: 146,
        // Distance (cm), one sample every 5 minutes since deployment, oldest first.
        history: [188, 182, 176, 171, 166, 162, 158, 155, 152, 149, 147, 146],
    },
    'FM-02': {
        id: 'FM-02',
        status: 'DEPLOYED',
        place: 'Bagong Silang Bridge',
        deployedAt: minutesAgo(33),
        position: { x: 50, y: 76 },
        battery: 77,
        signal: -84,
        lora: 'GOOD',
        lastReadingAt: minutesAgo(0.05),
        distance: 162,
        history: [199, 195, 191, 187, 183, 179, 175, 172, 169, 166, 164, 162],
    },
    'FM-03': {
        id: 'FM-03',
        status: 'DEPLOYED',
        place: 'Phase 1 Covered Court',
        deployedAt: minutesAgo(25),
        position: { x: 78, y: 82 },
        battery: 34,
        signal: -97,
        lora: 'WEAK',
        lastReadingAt: minutesAgo(0.2),
        distance: 177,
        history: [188, 187, 186, 185, 184, 183, 182, 181, 180, 179, 178, 177],
    },
    'FM-04': {
        id: 'FM-04',
        status: 'DOCKED',
        dockSlot: 1,
        battery: 100,
        signal: -60,
        lora: 'GOOD',
        distance: null,
        history: [],
    },
    'FM-05': {
        id: 'FM-05',
        status: 'DOCKED',
        dockSlot: 2,
        battery: 96,
        signal: -61,
        lora: 'GOOD',
        distance: null,
        history: [],
    },
};

// JSN-SR04T datasheet values used to judge readings.
export const jsnSpec = {
    model: 'JSN-SR04T',
    minCm: 25,
    maxCm: 450,
    accuracyCm: 1,
    frequencyKhz: 40,
    sampleSeconds: 5,
};

// Candidate drop points the operator can pick when deploying a docked module.
export const dropPoints = [
    { id: 'DP-1', place: 'Bagong Silang Elementary', position: { x: 34, y: 58 } },
    { id: 'DP-2', place: 'Phase 3 Market', position: { x: 12, y: 50 } },
    { id: 'DP-3', place: 'Barangay Hall', position: { x: 64, y: 66 } },
];
