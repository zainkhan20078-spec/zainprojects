export interface NotebookSnapshotWriterDependencies {
  replaceDocument: (docId: string, text: string) => Promise<void>;
}

export function createNotebookSnapshotWriter({
  replaceDocument,
}: NotebookSnapshotWriterDependencies): (docId: string, text: string) => Promise<void> {
  const pendingByDocument = new Map<string, Promise<void>>();

  return async (docId, text) => {
    const previousWrite = pendingByDocument.get(docId) ?? Promise.resolve();
    const currentWrite = previousWrite
      .catch(() => undefined)
      .then(() => replaceDocument(docId, text));

    pendingByDocument.set(docId, currentWrite);
    try {
      await currentWrite;
    } finally {
      if (pendingByDocument.get(docId) === currentWrite) {
        pendingByDocument.delete(docId);
      }
    }
  };
}
