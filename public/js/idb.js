// idb.js — мини-обёртка над IndexedDB (промисы)

export function openDB(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB недоступен'));
      return;
    }
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (upgrade) upgrade(d, e.oldVersion, e.newVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB заблокирован'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function get(db, store, key) {
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export function getAll(db, store) {
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export function put(db, store, value, key) {
  return requestToPromise(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export function del(db, store, key) {
  return requestToPromise(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export function clear(db, store) {
  return requestToPromise(db.transaction(store, 'readwrite').objectStore(store).clear());
}
