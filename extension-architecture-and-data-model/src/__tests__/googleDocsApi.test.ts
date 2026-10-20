import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureNotebookDocument, replaceDocumentBody } from "../googleDocsApi";

function installChromeIdentityMock(): void {
  (globalThis as { chrome?: unknown }).chrome = {
    identity: {
      getAuthToken: (_options: unknown, callback: (token: string) => void) => callback("test-token"),
    },
    runtime: { lastError: undefined },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.unstubAllGlobals();
});

describe("replaceDocumentBody", () => {
  it("replaces existing document content in one batch update", async () => {
    installChromeIdentityMock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ body: { content: [{ endIndex: 10 }] } }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await replaceDocumentBody("doc-1", "Math\nupdated notes\n");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const batchUpdate = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      requests: Array<Record<string, unknown>>;
    };
    expect(batchUpdate.requests).toEqual([
      { deleteContentRange: { range: { startIndex: 1, endIndex: 9 } } },
      { insertText: { location: { index: 1 }, text: "Math\nupdated notes\n" } },
    ]);
  });

  it("deletes all document content without inserting text for an empty snapshot", async () => {
    installChromeIdentityMock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ body: { content: [{ endIndex: 10 }] } }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await replaceDocumentBody("doc-1", "");

    const batchUpdate = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      requests: Array<Record<string, unknown>>;
    };
    expect(batchUpdate.requests).toEqual([{ deleteContentRange: { range: { startIndex: 1, endIndex: 9 } } }]);
  });

  it("avoids a batch update when both the document and snapshot are empty", async () => {
    installChromeIdentityMock();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ body: { content: [{ endIndex: 1 }] } }));
    vi.stubGlobal("fetch", fetchMock);

    await replaceDocumentBody("doc-1", "");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ensureNotebookDocument", () => {
  it("reuses a valid linked document", async () => {
    installChromeIdentityMock();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: "existing-doc",
        trashed: false,
        mimeType: "application/vnd.google-apps.document",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureNotebookDocument({
        folderId: "folder-1",
        notebookName: "Physics",
        existingDocId: "existing-doc",
      }),
    ).resolves.toBe("existing-doc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a replacement only when Google confirms the linked document is trashed", async () => {
    installChromeIdentityMock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "old-doc", trashed: true, mimeType: "application/vnd.google-apps.document" }))
      .mockResolvedValueOnce(jsonResponse({ id: "new-doc" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureNotebookDocument({
        folderId: "folder-1",
        notebookName: "Physics",
        existingDocId: "old-doc",
      }),
    ).resolves.toBe("new-doc");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });

  it.each([
    ["unauthorized", 401],
    ["rate limited", 429],
    ["temporarily unavailable", 503],
    ["not found", 404],
  ])("propagates a %s lookup failure without creating a duplicate", async (_label, status) => {
    installChromeIdentityMock();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: status, message: `Drive error ${status}` } }), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureNotebookDocument({
        folderId: "folder-1",
        notebookName: "Physics",
        existingDocId: "existing-doc",
      }),
    ).rejects.toThrow(`Drive error ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates network failures without creating a duplicate", async () => {
    installChromeIdentityMock();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureNotebookDocument({
        folderId: "folder-1",
        notebookName: "Physics",
        existingDocId: "existing-doc",
      }),
    ).rejects.toThrow("Network unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an existing linked file that is not a Google Doc", async () => {
    installChromeIdentityMock();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ id: "existing-file", trashed: false, mimeType: "application/pdf" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureNotebookDocument({
        folderId: "folder-1",
        notebookName: "Physics",
        existingDocId: "existing-file",
      }),
    ).rejects.toThrow("The linked Google Drive file is not a Google Doc.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
