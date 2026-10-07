const DATABASE_NAME = 'puzlea-local';
const DATABASE_VERSION = 1;
const STORE_NAME = 'sessions';

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Este navegador no admite almacenamiento local.'));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => { database.close(); resolve(request?.result); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('No se pudo guardar la partida.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Se canceló el guardado.')); };
  });
}

export function savePuzzle(puzzle) {
  const { imageUrl: _temporaryUrl, ...record } = puzzle;
  return withStore('readwrite', (store) => store.put(record));
}

export async function listPuzzles() {
  const records = await withStore('readonly', (store) => store.getAll());
  return records
    .filter((record) => Number.isInteger(record.level) && Array.isArray(record.geometry?.pieces) && record.imageBlob instanceof Blob)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPuzzle(id) {
  return withStore('readonly', (store) => store.get(id));
}

export function deletePuzzle(id) {
  return withStore('readwrite', (store) => store.delete(id));
}
