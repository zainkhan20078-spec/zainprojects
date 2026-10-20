import { describe, expect, it } from "vitest";
import { createNotebookSnapshotWriter } from "../notebookSnapshot";

describe("createNotebookSnapshotWriter", () => {
  it("replaces prior notebook contents for each edit and clears deleted content", async () => {
    const documents = new Map<string, string>([["doc-1", "old remote notes"]]);
    const writeSnapshot = createNotebookSnapshotWriter({
      replaceDocument: async (docId, text) => {
        documents.set(docId, text);
      },
    });

    await writeSnapshot("doc-1", "Math\nfirst version\n");
    expect(documents.get("doc-1")).toBe("Math\nfirst version\n");

    await writeSnapshot("doc-1", "Math\nupdated version\n");
    expect(documents.get("doc-1")).toBe("Math\nupdated version\n");

    await writeSnapshot("doc-1", "");
    expect(documents.get("doc-1")).toBe("");
  });

  it("serializes concurrent replacements for the same document", async () => {
    const documents = new Map<string, string>([["doc-1", "old remote notes"]]);
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let continueFirstWrite: (() => void) | undefined;
    const firstWriteGate = new Promise<void>((resolve) => {
      continueFirstWrite = resolve;
    });

    const writeSnapshot = createNotebookSnapshotWriter({
      replaceDocument: async (docId, text) => {
        if (text === "first") {
          releaseFirstWrite?.();
          await firstWriteGate;
        }
        documents.set(docId, text);
      },
    });

    const first = writeSnapshot("doc-1", "first");
    await firstWriteStarted;
    const second = writeSnapshot("doc-1", "second");
    continueFirstWrite?.();
    await Promise.all([first, second]);

    expect(documents.get("doc-1")).toBe("second");
  });
});
