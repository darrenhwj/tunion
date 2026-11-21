function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tunion-demo-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFile(file: File) {
  const key = crypto.randomUUID();
  const database = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('uploads', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('uploads').add(file, key);
    });
    return 'local-file:' + key;
  } finally {
    database.close();
  }
}

export async function loadFile(url: string): Promise<Blob> {
  const database = await openFiles();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('uploads').objectStore('uploads').get(url.slice('local-file:'.length));
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error('This file is no longer available in this browser.'));
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
