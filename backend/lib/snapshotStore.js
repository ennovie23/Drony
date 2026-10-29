import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadToCloudinary, deleteFromCloudinary } from './cloudinary.js';

const INDEX_FILE = 'snapshots.json';
// Ids become file names, so only this exact shape is ever written or deleted
const ID_PATTERN = /^SNAP-\d{6,}-\d+$/;
const TRIGGERS = new Set(['auto', 'manual']);
const IMAGE_PATTERN = /^SNAP-\d{6,}-\d+\.jpg$/;

// File-backed snapshot store with optional Cloudinary sync: one <id>.jpg per snapshot plus a
// snapshots.json index (newest first, capped at `max`). Writes are serialized so
// concurrent POSTs can't clobber the index. The index is read from disk once and then
// served from memory: on Windows, renaming over a file another request is reading fails
// with EPERM, so GETs must not touch the file while a write is in flight.
export function createSnapshotStore({
  dir,
  max = 50,
  now = Date.now,
  uploader = uploadToCloudinary,
  deleter = deleteFromCloudinary,
}) {
  const indexPath = path.join(dir, INDEX_FILE);
  let writeChain = Promise.resolve();
  let loaded = null; // Promise<Entry[]> once the index has been read

  const isCloudinaryConfigured = () =>
    Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

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

  // Returns only non-archived entries (the live strip)
  async function list() {
    try {
      return (await load()).filter((e) => !e.archived);
    } catch (err) {
      console.error('[snapshots] Failed to read index:', err.message);
      return [];
    }
  }

  // Returns all entries including archived (for the History page)
  async function listAll() {
    try {
      return [...(await load())];
    } catch (err) {
      console.error('[snapshots] Failed to read index (history):', err.message);
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

    let imageUrl = `/snapshots/${id}.jpg`;
    let publicId = null;

    if (isCloudinaryConfigured() && typeof uploader === 'function') {
      try {
        const cloudResult = await uploader(`data:image/jpeg;base64,${imageBase64}`, { public_id: id });
        if (cloudResult?.secure_url) {
          imageUrl = cloudResult.secure_url;
          publicId = cloudResult.public_id ?? null;
        }
      } catch (err) {
        console.error('[snapshots] Cloudinary upload failed, falling back to local file:', err.message);
      }
    }

    const entry = {
      id,
      frame,
      capturedAt: assessment.timestamp ?? new Date(now()).toISOString(),
      trigger: TRIGGERS.has(trigger) ? trigger : 'auto',
      imageUrl,
      publicId,
      assessment,
    };

    const entries = [entry, ...existing];
    const kept = entries.slice(0, max);
    const dropped = entries.slice(max);

    await writeIndex(kept);

    // FIFO pruning: remove dropped images from local disk. Cloudinary copies stay, since
    // the History page still shows them from the database (destroy() removes those).
    await Promise.all(dropped.map(async (e) => {
      if (ID_PATTERN.test(e.id)) {
        await fs.unlink(path.join(dir, `${e.id}.jpg`)).catch((err) => {
          if (err.code !== 'ENOENT') console.error('[snapshots] Failed to delete', e.id, err.message);
        });
      }
    }));

    return entry;
  }

  async function writeIndex(entries) {
    const tmpPath = `${indexPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2));
    await fs.rename(tmpPath, indexPath);
    loaded = Promise.resolve(entries);
  }

  // Soft-archives every active (non-archived) entry so the live strip is empty.
  // Images remain in Cloudinary and local disk for the History page.
  async function clearAll() {
    const existing = await load();
    const active = existing.filter((e) => !e.archived);
    if (active.length === 0) return;
    const allEntries = await listAll();
    const archived = allEntries.map((e) => e.archived ? e : { ...e, archived: true });
    await writeIndex(archived);
  }

  // Permanently deletes a single snapshot from disk, Cloudinary, and the index.
  // Used from the History page when the operator explicitly wants permanent removal.
  async function destroyEntry(id) {
    if (!ID_PATTERN.test(id)) return false;
    await fs.mkdir(dir, { recursive: true });
    const allEntries = await listAll();
    const target = allEntries.find((e) => e.id === id);
    if (!target) return false;

    const kept = allEntries.filter((e) => e.id !== id);
    await writeIndex(kept);

    await fs.unlink(path.join(dir, `${id}.jpg`)).catch((err) => {
      if (err.code !== 'ENOENT') console.error('[snapshots] Failed to delete', id, err.message);
    });

    if (target.publicId && typeof deleter === 'function') {
      await deleter(target.publicId).catch((err) => {
        console.error('[snapshots] Failed to delete Cloudinary asset:', target.publicId, err?.message);
      });
    }

    return true;
  }

  // Soft-archives a single entry by id (removes it from the live strip).
  // Image remains in Cloudinary/disk and is visible in History.
  async function removeEntry(id) {
    if (!ID_PATTERN.test(id)) return false;
    const allEntries = await listAll();
    const target = allEntries.find((e) => e.id === id);
    if (!target) return false;
    const updated = allEntries.map((e) => e.id === id ? { ...e, archived: true } : e);
    await writeIndex(updated);
    return true;
  }

  // Merges a patch (e.g. a Cloudinary imageUrl/publicId) into one entry
  async function updateEntry(id, patch) {
    const allEntries = await listAll();
    if (!allEntries.some((e) => e.id === id)) return false;
    await writeIndex(allEntries.map((e) => (e.id === id ? { ...e, ...patch, id } : e)));
    return true;
  }

  // All writes go through one chain so an add can't interleave with another write
  function serialized(fn) {
    const result = writeChain.then(fn);
    writeChain = result.catch(() => {}); // keep the chain alive after a failed write
    return result;
  }

  const add = (input) => serialized(() => writeEntry(input));
  const clear = () => serialized(clearAll);
  const remove = (id) => serialized(() => removeEntry(id));
  const destroy = (id) => serialized(() => destroyEntry(id));
  const update = (id, patch) => serialized(() => updateEntry(id, patch));

  return { list, add, clear, remove, destroy, update, listAll };
}
