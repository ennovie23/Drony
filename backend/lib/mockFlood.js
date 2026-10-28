import { ALERT_CM, isFloodHazard } from './floodLevel.js';

// Realistic flood sensor readings for a dashboard with no flood data yet: two nodes on
// the site's creek, one every 3 hours over 6 days, with a storm that floods both and a
// level at N1 that is still above the alert line now. Hazard readings carry the time
// the same node next dropped below the alert level (or null while still flooded).
const HOUR_MS = 60 * 60 * 1000;
const NODES = [
  { nodeId: 'N1', latitude: 14.7392, longitude: 121.0198, baseCm: 22, peakCm: 168, referenceCm: 220 },
  { nodeId: 'N2', latitude: 14.7418, longitude: 121.0231, baseCm: 15, peakCm: 104, referenceCm: 180 },
];

// 0 → 1 → back down over the storm, with N1's tail still elevated at the end
function stormShape(t, nodeIndex) {
  const rise = Math.exp(-(((t - 0.55) / 0.12) ** 2));
  const tail = nodeIndex === 0 ? Math.max(0, (t - 0.8) / 0.2) * 0.32 : 0;
  return Math.max(rise, tail);
}

export function generateMockFloodReadings({ now = Date.now(), days = 6, stepHours = 3, random = Math.random } = {}) {
  const steps = Math.floor((days * 24) / stepHours);
  const start = now - steps * stepHours * HOUR_MS;
  const rows = [];

  NODES.forEach((node, nodeIndex) => {
    const nodeRows = [];
    for (let i = 0; i <= steps; i++) {
      const recordedAt = new Date(start + i * stepHours * HOUR_MS - nodeIndex * 7 * 60 * 1000);
      const noise = (random() - 0.5) * 4;
      const heightCm = Math.round((node.baseCm + (node.peakCm - node.baseCm) * stormShape(i / steps, nodeIndex) + noise) * 10) / 10;
      nodeRows.push({
        recordedAt,
        nodeId: node.nodeId,
        seq: i + 1,
        source: 'lora',
        distanceCm: Math.round((node.referenceCm - heightCm) * 10) / 10,
        heightCm,
        mount: 'fixed',
        medium: 'air',
        probeDepthCm: null,
        referenceCm: node.referenceCm,
        rssi: Math.round(-88 - random() * 18),
        snr: Math.round((4 + random() * 6) * 10) / 10,
        lost: Math.floor(random() * 2),
        gpsFix: true,
        latitude: node.latitude,
        longitude: node.longitude,
        satellites: 6 + Math.floor(random() * 5),
        resolvedAt: null,
      });
    }
    // A hazard reading is resolved by the node's next reading below the alert level
    let clearAt = null;
    for (let i = nodeRows.length - 1; i >= 0; i--) {
      const row = nodeRows[i];
      if (isFloodHazard(row.heightCm)) row.resolvedAt = clearAt;
      else { row.resolvedAt = row.recordedAt; clearAt = row.recordedAt; }
    }
    rows.push(...nodeRows);
  });
  return rows;
}

// Inserts the mock readings only when the FloodReading table is empty → rows inserted
export async function seedMockFloodIfEmpty({ db, now } = {}) {
  if ((await db.floodReading.count()) > 0) return 0;
  const { count } = await db.floodReading.createMany({ data: generateMockFloodReadings({ now }) });
  return count;
}

export { ALERT_CM };
