// detect.py posts every analysed frame; a record older than this means the
// detector stopped (or died), so it must not be shown as the live result.
export const LIVE_MAX_AGE_MS = 5000;

// `receivedAt` is stamped by this server when the frame arrives (the database's
// createdAt comes from the remote DB clock, which may drift from ours).
export function isFresh(record, now = Date.now(), maxAgeMs = LIVE_MAX_AGE_MS) {
  if (!record?.receivedAt) return false;
  return now - new Date(record.receivedAt).getTime() <= maxAgeMs;
}
