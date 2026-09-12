import type { Chat, Paper } from './reader-types';

let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.then(operation); writes = result.catch(() => {}); return result;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('paper-reader-everyone', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('papers')) db.createObjectStore('papers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chats')) {
        const chats = db.createObjectStore('chats', { keyPath: ['paperId', 'id'] });
        chats.createIndex('paperId', 'paperId');
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(new Error('Device storage is unavailable. Save a PDF + chats bundle to keep a portable copy.'));
    request.onblocked = () => reject(new Error('Close other Paper Reader windows and try again to update device storage.'));
  });
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode); let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Could not save or read device storage. Check free space; your unsaved answer can still be pinned and exported.')); };
    try { run(tx, result => { value = result; }); }
    catch (e) { tx.abort(); reject(e); }
  });
}
export async function listPapers(): Promise<Paper[]> {
  await writes;
  return transaction(['papers'], 'readonly', (tx, result) => {
    const request = tx.objectStore('papers').getAll();
    request.onsuccess = () => result((request.result as Paper[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  });
}
export function savePaper(paper: Paper): Promise<void> {
  return serialize(() => transaction(['papers'], 'readwrite', tx => { tx.objectStore('papers').put(paper); }));
}
function deletePaperChats(store: IDBObjectStore, paperId: string) {
  const cursor = store.index('paperId').openCursor(IDBKeyRange.only(paperId));
  cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
}
export function removePaper(id: string): Promise<void> {
  return serialize(() => transaction(['papers', 'chats'], 'readwrite', tx => {
    tx.objectStore('papers').delete(id); deletePaperChats(tx.objectStore('chats'), id);
  }));
}
export async function listChats(paperId: string): Promise<Chat[]> {
  await writes;
  return transaction(['chats'], 'readonly', (tx, result) => {
    const request = tx.objectStore('chats').index('paperId').getAll(paperId);
    request.onsuccess = () => result((request.result as Chat[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)));
  });
}
export async function chatCounts(): Promise<Record<string, number>> {
  await writes;
  return transaction(['chats'], 'readonly', (tx, result) => {
    const counts: Record<string, number> = Object.create(null);
    const cursor = tx.objectStore('chats').openKeyCursor();
    cursor.onsuccess = () => {
      if (cursor.result) { const id = String((cursor.result.primaryKey as IDBValidKey[])[0]); counts[id] = (counts[id] || 0) + 1; cursor.result.continue(); }
      else result(counts);
    };
  });
}
export function addChat(chat: Chat): Promise<void> {
  return serialize(() => transaction(['papers', 'chats'], 'readwrite', tx => {
    const paper = tx.objectStore('papers').getKey(chat.paperId);
    paper.onsuccess = () => { if (paper.result) tx.objectStore('chats').add(chat); else tx.abort(); };
  }));
}
export function finishChat(paperId: string, id: string, patch: Pick<Chat, 'status'> & Partial<Pick<Chat, 'question' | 'answer' | 'error'>>): Promise<boolean> {
  return serialize(() => transaction(['chats'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('chats'); const request = store.get([paperId, id]);
    request.onsuccess = () => {
      const current = request.result as Chat | undefined;
      // A cancelled or deleted exchange must never be resurrected by a late response.
      if (!current || current.status !== 'pending') { result(false); return; }
      store.put({ ...current, ...patch }); result(true);
    };
  }));
}
export function removeChat(paperId: string, id: string): Promise<void> {
  return serialize(() => transaction(['chats'], 'readwrite', tx => { tx.objectStore('chats').delete([paperId, id]); }));
}
export function clearChats(paperId?: string): Promise<void> {
  return serialize(() => transaction(['chats'], 'readwrite', tx => {
    const store = tx.objectStore('chats');
    if (paperId) deletePaperChats(store, paperId); else store.clear();
  }));
}
export function recoverInterruptedChats(): Promise<void> {
  return serialize(() => transaction(['chats'], 'readwrite', tx => {
    const cursor = tx.objectStore('chats').openCursor();
    cursor.onsuccess = () => {
      if (cursor.result) {
        const chat = cursor.result.value as Chat;
        if (chat.status === 'pending') cursor.result.update({ ...chat, status: 'interrupted' });
        cursor.result.continue();
      }
    };
  }));
}
export function restoreBundle(paper: Paper, chats: Chat[]): Promise<void> {
  return serialize(() => transaction(['papers', 'chats'], 'readwrite', tx => {
    tx.objectStore('papers').put(paper);
    const store = tx.objectStore('chats');
    for (const chat of chats) {
      const request = store.getKey([paper.id, chat.id]);
      request.onsuccess = () => {
        if (!request.result) store.add({ ...chat, paperId: paper.id, status: chat.status === 'pending' ? 'interrupted' : chat.status });
      };
    }
  }));
}
