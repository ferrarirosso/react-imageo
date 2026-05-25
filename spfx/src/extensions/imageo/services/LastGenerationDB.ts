import { logger } from '../utils/logger';

const DB_NAME = 'imageo';
const DB_VERSION = 1;
const STORE = 'generations';
const TTL_MINUTES = 15;

export interface ILastGeneration {
  blob: Blob;
  prompt: string;
  essence?: string;
  chips?: { subject: string[]; style: string[]; mood: string[] };
  selectedSectionIds?: string[];
  createdAt: number;  // epoch ms
}

interface StoredRecord extends ILastGeneration {
  key: string;
}

function keyFor(pageId: number | string, userLogin: string): string {
  const safeUser = (userLogin || 'anon').toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return `${pageId}:${safeUser}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveLastGeneration(
  pageId: number | string,
  userLogin: string,
  gen: ILastGeneration
): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key: keyFor(pageId, userLogin), ...gen } as StoredRecord);
      await txComplete(tx);
    } finally {
      db.close();
    }
  } catch (err) {
    logger.warn('IndexedDB save failed', err);
  }
}

export async function loadLastGeneration(
  pageId: number | string,
  userLogin: string
): Promise<ILastGeneration | undefined> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const k = keyFor(pageId, userLogin);
      const record = await new Promise<StoredRecord | undefined>((resolve, reject) => {
        const req = store.get(k);
        req.onsuccess = () => resolve(req.result as StoredRecord | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!record) return undefined;

      const ageMin = (Date.now() - record.createdAt) / 60_000;
      if (ageMin > TTL_MINUTES) {
        // Stale — drop it asynchronously, don't block the load.
        clearLastGeneration(pageId, userLogin).catch(() => { /* noop */ });
        return undefined;
      }
      return {
        blob: record.blob,
        prompt: record.prompt,
        essence: record.essence,
        chips: record.chips,
        selectedSectionIds: record.selectedSectionIds,
        createdAt: record.createdAt,
      };
    } finally {
      db.close();
    }
  } catch (err) {
    logger.warn('IndexedDB load failed', err);
    return undefined;
  }
}

export async function clearLastGeneration(
  pageId: number | string,
  userLogin: string
): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(keyFor(pageId, userLogin));
      await txComplete(tx);
    } finally {
      db.close();
    }
  } catch (err) {
    logger.warn('IndexedDB clear failed', err);
  }
}

/**
 * Sweep all entries older than TTL_MINUTES in a single transaction. Called
 * once per panel open so stale entries from other pages don't accumulate
 * — lazy-on-read would only clean the specific key being fetched.
 */
export async function sweepExpired(): Promise<number> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let deleted = 0;
      await new Promise<void>((resolve, reject) => {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) { resolve(); return; }
          const rec = cursor.value as StoredRecord;
          const ageMin = (Date.now() - rec.createdAt) / 60_000;
          if (ageMin > TTL_MINUTES) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
      await txComplete(tx);
      if (deleted > 0) logger.log(`[LastGenDB] swept ${deleted} expired entries`);
      return deleted;
    } finally {
      db.close();
    }
  } catch (err) {
    logger.warn('IndexedDB sweep failed', err);
    return 0;
  }
}
