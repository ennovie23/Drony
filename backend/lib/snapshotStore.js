import fs from 'node:fs/promises';
import path from 'node:path';

const INDEX_FILE = 'snapshots.json';
// Ids become file names, so only this exact shape is ever written or deleted
const ID_PATTERN = /^SNAP-\d{6,}-\d+$/;
const TRIGGERS = new Set(['auto', 'manual']);
const IMAGE_PATTERN = /^SNAP-\d{6,}-\d+\.jpg$/;

// File-backed snapshot store for webcam testing: one <id>.jpg per snapshot plus a
// snapshots.json index (newest first, capped at `max`). Writes are serialized so
// concurrent POSTs can't clobber the index. The index is read from disk once and then
// served from memory: on Windows, renaming over a file another request is reading fails
// with EPERM, so GETs must not touch the file while a write is in flight.
export function createSnapshotStore({ dir, max = 50, now = Date.now }) {
  const indexPath = path.join(dir, INDEX_FILE);
  let writeChain = Promise.resolve();
  let loaded = null; // Promise<Entry[]> once the index has been read

  async function readIndex() {
    let raw;
    try {
      raw = await fs.readFile(indexPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err; // e.g. locked by antivirus: retry later rather than treat as empty
    }
    try {
      const entries = JSON.parse(raw);
      return Array.isArray(entries)
        ? entries.filter((e) => e && typeof e.id === 'string' && ID_PATTERN.test(e.id))
        : [];
    } catch (err) {
      console.error('[snapshots] Corrupt index, treating as empty:', err.message);
      return [];
    }
  }

  // Rejects if the index exists but can't be read, so a write never replaces it blindly
  async function load() {
    loaded ??= readIndex();
    try {
      return await loaded;
    } catch (err) {
      loaded = null;
      throw err;
    }
  }

  async function list() {
    try {
      return [...(await load())];
    } catch (err) {
      console.error('[snapshots] Failed to read index:', err.message);
      return [];
    }
  }

  async function writeEntry({ imageBase64, trigger, assessment }) {
    await fs.mkdir(dir, { recursive: true });
    const existing = await load();

    // frameIndex and trigger come from the request body: never trust them in a path
    const frame = Number.isInteger(assessment.frameIndex) && assessment.frameIndex >= 0 ? assessment.frameIndex : 0;
    const id = `SNAP-${String(frame).padStart(6, '0')}-${now()}`;
    await fs.writeFile(path.join(dir, `${id}.jpg`), Buffer.from(imageBase64, 'base64'));

    const entry = {
      id,
      frame,
      capturedAt: assessment.timestamp ?? new Date(now()).toISOString(),
      trigger: TRIGGERS.has(trigger) ? trigger : 'auto',
      imageUrl: `/snapshots/${id}.jpg`,
      assessment,
    };

    const entries = [entry, ...existing];
    const kept = entries.slice(0, max);
    const dropped = entries.slice(max);

    await writeIndex(kept);

    await Promise.all(dropped.filter((e) => ID_PATTERN.test(e.id)).map((e) =>
      fs.unlink(path.join(dir, `${e.id}.jpg`)).catch((err) => {
        if (err.code !== 'ENOENT') console.error('[snapshots] Failed to delete', e.id, err.message);
      })));

    return entry;
  }

  async function writeIndex(entries) {
    const tmpPath = `${indexPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2));
    await fs.rename(tmpPath, indexPath);
    loaded = Promise.resolve(entries);
  }

  // Deletes every snapshot image in the folder (including ones the index lost
  // track of) and empties the index, on disk and in memory.
  async function clearAll() {
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    await Promise.all(files.filter((f) => IMAGE_PATTERN.test(f)).map((f) =>
      fs.unlink(path.join(dir, f)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      })));
    await writeIndex([]);
  }

  // All writes go through one chain so an add can't interleave with another write
  function serialized(fn) {
    const result = writeChain.then(fn);
    writeChain = result.catch(() => {}); // keep the chain alive after a failed write
    return result;
  }

  const add = (input) => serialized(() => writeEntry(input));
  const clear = () => serialized(clearAll);

  return { list, add, clear };
}
