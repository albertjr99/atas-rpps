// Cópia local dos trechos de áudio (IndexedDB) até o servidor confirmar a transcrição.
// Se a aba fechar, a bateria acabar ou a rede cair, os trechos continuam no aparelho
// e são enviados quando a reunião for aberta de novo.

const DB_NAME = "atas-rpps-audio";
const STORE = "segments";

let dbPromise = null;
const memory = new Map(); // usado quando o navegador não oferece IndexedDB (ex.: aba anônima antiga)

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!window.indexedDB) return resolve(null);
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("meetingId", "meetingId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("IndexedDB abortado"));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function isPersistent() {
  return !!(await openDb());
}

export async function putSegment(segment) {
  const db = await openDb();
  if (!db) {
    memory.set(segment.id, segment);
    return;
  }
  await tx(db, "readwrite", (store) => store.put(segment));
}

export async function deleteSegment(id) {
  const db = await openDb();
  if (!db) {
    memory.delete(id);
    return;
  }
  await tx(db, "readwrite", (store) => store.delete(id));
}

export async function listSegments(meetingId) {
  const db = await openDb();
  let items;
  if (!db) {
    items = [...memory.values()].filter((s) => s.meetingId === meetingId);
  } else {
    items = await tx(db, "readonly", (store) => reqToPromise(store.index("meetingId").getAll(meetingId)));
  }
  return (items || []).sort((a, b) => a.seq - b.seq);
}

// Pede ao navegador para não apagar estes dados quando faltar espaço.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* opcional */
  }
}
