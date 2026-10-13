import fs from 'node:fs/promises';
import path from 'node:path';

const INDEX_FILE = 'snapshots.json';

// File-backed snapshot store for webcam testing: one <id>.jpg per snapshot plus a
// snapshots.json index (newest first, capped at `max`). Writes are serialized so
// concurrent POSTs can't clobber the index.
export function createSnapshotStore({ dir, max = 50, now = Date.now }) {
  const indexPath = path.join(dir, INDEX_FILE);
  let writeChain = Promise.resolve();

  async function list() {
    let raw;
    try {
      raw = await fs.readFile(indexPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[snapshots] Failed to read index:', err.message);
      return [];
    }
    try {
      const entries = JSON.parse(raw);
      return Array.isArray(entries) ? entries : [];
    } catch (err) {
      console.error('[snapshots] Corrupt index, treating as empty:', err.message);
      return [];
    }
  }

  async function writeEntry({ imageBase64, trigger, assessment }) {
    await fs.mkdir(dir, { recursive: true });

    const frame = assessment.frameIndex ?? 0;
    const id = `SNAP-${String(frame).padStart(6, '0')}-${now()}`;
    await fs.writeFile(path.join(dir, `${id}.jpg`), Buffer.from(imageBase64, 'base64'));

    const entry = {
      id,
      frame,
      capturedAt: assessment.timestamp ?? new Date(now()).toISOString(),
      trigger,
      imageUrl: `/snapshots/${id}.jpg`,
      assessment,
    };

    const entries = [entry, ...(await list())];
    const kept = entries.slice(0, max);
    const dropped = entries.slice(max);

    const tmpPath = `${indexPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(kept, null, 2));
    await fs.rename(tmpPath, indexPath);

    await Promise.all(dropped.map((e) =>
      fs.unlink(path.join(dir, `${e.id}.jpg`)).catch((err) => {
        if (err.code !== 'ENOENT') console.error('[snapshots] Failed to delete', e.id, err.message);
      })));

    return entry;
  }

  function add(input) {
    const result = writeChain.then(() => writeEntry(input));
    writeChain = result.catch(() => {}); // keep the chain alive after a failed write
    return result;
  }

  return { list, add };
}
