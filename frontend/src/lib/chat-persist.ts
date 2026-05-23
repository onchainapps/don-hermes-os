/** Lightweight IndexedDB session persistence for Don OS chat.
 *  Survives browser refresh, tab crash, or accidental close.
 *  Stores: messages[], sessionId, streaming state, pending prompt.
 */

const DB_NAME = 'don-os-chat';
const STORE_NAME = 'sessions';
const DB_VERSION = 3;

interface PersistedSession {
  scope: string;
  sessionId: string | null;
  messages: any[];
  streaming: boolean;
  contextFiles?: { path: string; content: string }[];
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'scope' });
        }
      };
    });
  }
  return dbPromise;
}

/** Wrap IDBTransaction into a promise */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save a chat session scope (projectRoot + filePath).
 */
export async function saveSession(
  scope: string,
  data: Pick<PersistedSession, 'sessionId' | 'messages' | 'streaming' | 'contextFiles' | 'position' | 'size'>
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      scope,
      sessionId: data.sessionId,
      messages: data.messages,
      streaming: data.streaming,
      contextFiles: data.contextFiles || [],
      updatedAt: Date.now(),
    });
    await txDone(tx);
  } catch (e) {
    console.warn('[chat-persist] save failed:', e);
  }
}

/**
 * Load a persisted session scope.
 */
export async function loadSession(scope: string): Promise<PersistedSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get(scope);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('[chat-persist] load failed:', e);
    return null;
  }
}

/**
 * Delete a persisted session scope (e.g. /new command).
 */
export async function deleteSession(scope: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(scope);
    await txDone(tx);
  } catch (e) {
    console.warn('[chat-persist] delete failed:', e);
  }
}
