import type { Paper } from './reader-types';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('paper-reader-everyone', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('papers', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Device storage is unavailable. You can still download your annotated PDF.'));
  });
}
export async function listPapers(): Promise<Paper[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('papers', 'readonly');
    const request = tx.objectStore('papers').getAll();
    tx.oncomplete = () => { db.close(); resolve((request.result as Paper[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function savePaper(paper: Paper): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('papers', 'readwrite');
    tx.objectStore('papers').put(paper);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not save on this device. Download your PDF to keep your notes.')); };
  });
}
export async function removePaper(id: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('papers', 'readwrite');
    tx.objectStore('papers').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not remove this PDF from device storage.')); };
  });
}
