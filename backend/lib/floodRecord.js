// Validates a flood reading posted by the dashboard and maps it onto a FloodReading row.
// Returns { record } or { error }.
const SOURCES = ['lora', 'usb', 'serial'];
const MOUNTS = ['float', 'fixed'];
const MEDIUMS = ['water', 'air'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v) => (v == null ? null : isNum(v) ? v : undefined);
const optInt = (v) => (v == null ? null : Number.isSafeInteger(v) && v >= 0 ? v : undefined);

export function toFloodRecord(body) {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };

  const recordedAt = new Date(body.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) return { error: 'recordedAt must be a date' };
  if (typeof body.nodeId !== 'string' || !/^[A-Za-z0-9]{1,8}$/.test(body.nodeId)) return { error: 'nodeId must be 1–8 letters or digits' };
  if (!SOURCES.includes(body.source)) return { error: `source must be one of ${SOURCES.join(', ')}` };
  if (!MOUNTS.includes(body.mount)) return { error: `mount must be one of ${MOUNTS.join(', ')}` };
  if (!MEDIUMS.includes(body.medium)) return { error: `medium must be one of ${MEDIUMS.join(', ')}` };

  const numbers = {
    seq: optInt(body.seq),
    distanceCm: optNum(body.distanceCm),
    heightCm: optNum(body.heightCm),
    probeDepthCm: optNum(body.probeDepthCm),
    referenceCm: optNum(body.referenceCm),
    rssi: optNum(body.rssi),
    snr: optNum(body.snr),
    lost: optInt(body.lost),
    satellites: optInt(body.satellites),
  };
  const bad = Object.keys(numbers).find((k) => numbers[k] === undefined);
  if (bad) return { error: `${bad} must be a number` };

  const gpsFix = body.gpsFix === true;
  const latitude = gpsFix ? optNum(body.latitude) : null;
  const longitude = gpsFix ? optNum(body.longitude) : null;
  if (gpsFix && (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
    return { error: 'a GPS fix needs valid latitude and longitude' };
  }

  return {
    record: { recordedAt, nodeId: body.nodeId, source: body.source, mount: body.mount, medium: body.medium, ...numbers, gpsFix, latitude, longitude },
  };
}
