// IndexedDB-backed chat storage with localStorage migration fallback.

const DB_NAME = 'don-os-chat-storage';
const DB_VERSION = 3;
const STORE = 'conversations';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  sessionId: string | null;
  updatedAt?: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ──────────────────────────────────────────────────────────

export async function loadConversations(): Promise<Conversation[]> {
  let convs: Conversation[] = [];

  // 1) Try IndexedDB first
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    convs = (await new Promise<Conversation[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
    db.close();
  } catch {
    // fall through to localStorage
  }

  // 2) If IndexedDB is empty, migrate from localStorage
  if (convs.length === 0) {
    const raw = localStorage.getItem('floating-chat-conversations');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          convs = parsed.map((c: Conversation) => ({
            ...c,
            updatedAt: c.updatedAt || Date.now(),
          }));
          // Seed IndexedDB
          await saveConversations(convs);
          // Remove localStorage key after successful migration
          localStorage.removeItem('floating-chat-conversations');
        }
      } catch {
        // malformed localStorage data, ignore
      }
    }
  }

  return convs;
}

export async function saveConversations(convs: Conversation[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  // Clear existing, write all fresh (atomic transaction)
  store.clear();
  const now = Date.now();
  for (const c of convs) {
    store.put({ ...c, updatedAt: now });
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
