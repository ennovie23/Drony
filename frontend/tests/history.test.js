import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory, paginate, cloudinaryThumb, toCSV, toFramesCSV, phtDay, formatDuration } from '../src/utils/history.js';

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/drony_snapshots/SNAP-1.jpg';
const FIRE = {
    id: 'fire-f1', hazardType: 'fire', startedAt: '2026-10-28T15:30:00Z', endedAt: '2026-10-28T16:40:00Z',
    durationMs: 70 * 60000, status: 'active', severity: 'Severe', fireConfidence: 53.5, threatScore: 66,
    frameCount: 120, snapshotCount: 2, imageUrl: IMG,
    snapshots: [{ imageUrl: IMG }, { imageUrl: '/snapshots/SNAP-2.jpg' }],
    frames: [{ id: 'f1', capturedAt: '2026-10-28T15:30:00Z', fireConfidence: 53.5, snapshotId: 'SNAP-1', trigger: 'auto', imageUrl: IMG }],
};
const FLOOD = {
    id: 'flood-w1', hazardType: 'flood', startedAt: '2026-10-26T03:00:00Z', endedAt: '2026-10-27T03:00:00Z',
    durationMs: 86_400_000, status: 'resolved', severity: 'Moderate', heightCm: 120, nodeId: 'N1',
    frameCount: 9, snapshotCount: 0, imageUrl: null, snapshots: [], location: { latitude: 14.7, longitude: 121 },
    frames: [{ id: 'w1', capturedAt: '2026-10-26T03:00:00Z', heightCm: 60, nodeId: 'N1' }, { id: 'w2', capturedAt: '2026-10-27T03:00:00Z', heightCm: 120, nodeId: 'N1' }],
};

test('date filter matches every Philippine day an incident was ongoing', () => {
    assert.equal(phtDay(FIRE.startedAt), '2026-10-28'); // 23:30 PHT
    assert.deepEqual(filterHistory([FIRE, FLOOD], { date: '2026-10-29' }), [FIRE]); // ran past midnight PHT
    assert.deepEqual(filterHistory([FIRE, FLOOD], { date: '2026-10-26' }), [FLOOD]);
    assert.deepEqual(filterHistory([FIRE, FLOOD], { date: '2026-10-25' }), []);
});

test('hazard and status filters combine', () => {
    assert.deepEqual(filterHistory([FIRE, FLOOD], { hazard: 'flood' }), [FLOOD]);
    assert.deepEqual(filterHistory([FIRE, FLOOD], { status: 'active' }), [FIRE]);
    assert.deepEqual(filterHistory([FIRE, FLOOD], { hazard: 'fire', status: 'resolved' }), []);
});

test('pagination splits rows and clamps the page', () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    assert.deepEqual(paginate(rows, 3, 10), { rows: [20, 21, 22], page: 3, pageCount: 3, from: 21, to: 23 });
    assert.equal(paginate(rows, 9, 10).page, 3);
    assert.deepEqual(paginate([], 1, 10), { rows: [], page: 1, pageCount: 1, from: 0, to: 0 });
});

test('durations read as minutes and hours', () => {
    assert.equal(formatDuration(20_000), '<1 min');
    assert.equal(formatDuration(54 * 60000), '54 min');
    assert.equal(formatDuration(150 * 60000), '2 h 30 min');
    assert.equal(formatDuration(120 * 60000), '2 h');
});

test('Cloudinary thumbnails are resized; other URLs pass through', () => {
    assert.equal(
        cloudinaryThumb(IMG),
        'https://res.cloudinary.com/demo/image/upload/c_fill,w_120,h_68,q_auto,f_auto/v1/drony_snapshots/SNAP-1.jpg',
    );
    assert.equal(cloudinaryThumb(null), null);
});

test('incident CSV: one line per incident, hazard type, only https image links', () => {
    const [header, fire, flood] = toCSV([FIRE, FLOOD]).split('\n');
    const cols = header.split(',');
    assert.equal(cols[1], '"Hazard Type"');
    assert.ok(cols.includes('"Image URL"'));
    assert.ok(fire.startsWith('"fire-f1","Fire"'));
    assert.ok(fire.endsWith(`"${IMG}","${IMG}"`), 'local snapshot paths are left out');
    assert.ok(flood.startsWith('"flood-w1","Flood"'));
});

test('raw frames CSV has a line per frame tagged with its incident', () => {
    const lines = toFramesCSV([FIRE, FLOOD]).split('\n');
    assert.equal(lines.length, 1 + 1 + 2);
    assert.ok(lines[1].startsWith('"fire-f1","Fire","f1"'));
    assert.ok(lines[1].endsWith(`"auto","${IMG}"`));
    assert.ok(lines[3].startsWith('"flood-w1","Flood","w2"'));
});
