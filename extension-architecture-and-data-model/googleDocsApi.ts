const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DOCS_API_BASE = "https://docs.googleapis.com/v1";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
  };
}

export interface DocHeading {
  text: string;
  level: string;
  startIndex: number;
  endIndex: number;
}

export interface FullDocStructure {
  endIndex: number;
  headings: DocHeading[];
}

function isChromeRuntimeAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.identity);
}

export async function getAuthToken(interactive: boolean): Promise<string> {
  if (!isChromeRuntimeAvailable()) {
    throw new Error("Chrome identity API is not available in this context.");
  }

  return new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!token) {
        reject(new Error("No OAuth token returned by Chrome identity API."));
        return;
      }

      resolve(token);
    });
  });
}

async function authedFetch(url: string, init: RequestInit = {}, interactive = false): Promise<Response> {
  const token = await getAuthToken(interactive);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as GoogleApiErrorPayload;
    const message = errorPayload.error?.message ?? `Google API request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return response;
}

export interface GoogleDriveSearchResult {
  id: string;
  name: string;
  url?: string;
  text: string;
}

export async function searchGoogleDrive(query: string, maxResults = 8): Promise<GoogleDriveSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const escapedQuery = normalizedQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const driveQuery = encodeURIComponent(`fullText contains '${escapedQuery}' and trashed = false`);
  const response = await authedFetch(
    `${DRIVE_API_BASE}/files?q=${driveQuery}&spaces=drive&fields=files(id,name,mimeType,webViewLink)&pageSize=${Math.min(Math.max(maxResults, 1), 20)}`,
    {},
    true,
  );
  const data = (await response.json()) as {
    files?: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }>;
  };

  const results: GoogleDriveSearchResult[] = [];
  for (const file of data.files ?? []) {
    let text = "";
    if (file.mimeType === "application/vnd.google-apps.document") {
      text = await getDocumentText(file.id);
    } else if (!file.mimeType.startsWith("application/vnd.google-apps.")) {
      const fileResponse = await authedFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`);
      const blob = await fileResponse.blob();
      const ingested = await import("./fileIngestor").then(({ ingestFiles }) =>
        ingestFiles([new File([blob], file.name, { type: file.mimeType })]),
      );
      text = ingested.combinedText;
    }

    results.push({
      id: file.id,
      name: file.name,
      url: file.webViewLink,
      text: text.slice(0, 12_000),
    });
  }

  return results;
}

export async function ensureMasterFolder(year: number): Promise<{ folderId: string; folderName: string }> {
  const folderName = `Bachillerato Notes ${year}`;
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${folderName.replace(/'/g, "\\'")}'`,
  );

  const listResponse = await authedFetch(
    `${DRIVE_API_BASE}/files?q=${query}&spaces=drive&fields=files(id,name)&pageSize=1`,
  );
  const listData = (await listResponse.json()) as { files?: Array<{ id: string; name: string }> };
  const existing = listData.files?.[0];
  if (existing?.id) {
    return { folderId: existing.id, folderName };
  }

  const createResponse = await authedFetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  const created = (await createResponse.json()) as { id: string };
  if (!created.id) {
    throw new Error("Google Drive folder creation returned an invalid id.");
  }

  return {
    folderId: created.id,
    folderName,
  };
}

export async function ensureNotebookDocument(params: {
  folderId: string;
  notebookName: string;
  existingDocId?: string | null;
}): Promise<string> {
  if (params.existingDocId) {
    const existingResponse = await authedFetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(params.existingDocId)}?fields=id,name,trashed,mimeType`,
    );
    const existingData = (await existingResponse.json()) as {
      id?: string;
      trashed?: boolean;
      mimeType?: string;
    };

    if (existingData.trashed !== true) {
      if (existingData.mimeType !== "application/vnd.google-apps.document") {
        throw new Error("The linked Google Drive file is not a Google Doc.");
      }
      if (!existingData.id) {
        throw new Error("Google Drive returned an invalid linked document.");
      }

      return existingData.id;
    }
  }

  const createResponse = await authedFetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    body: JSON.stringify({
      name: params.notebookName,
      mimeType: "application/vnd.google-apps.document",
      parents: [params.folderId],
    }),
  });

  const created = (await createResponse.json()) as { id: string };
  if (!created.id) {
    throw new Error("Google Doc creation returned an invalid id.");
  }

  return created.id;
}

export async function findDocumentInFolderByName(folderId: string, documentName: string): Promise<string | null> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.document' and trashed=false and name='${documentName.replace(/'/g, "\\'")}' and '${folderId}' in parents`,
  );

  const response = await authedFetch(
    `${DRIVE_API_BASE}/files?q=${query}&spaces=drive&fields=files(id,name)&pageSize=1`,
  );
  const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };
  return data.files?.[0]?.id ?? null;
}

export async function getDocumentEndIndex(docId: string): Promise<number> {
  const response = await authedFetch(`${DOCS_API_BASE}/documents/${docId}?fields=body/content(endIndex)`);
  const payload = (await response.json()) as {
    body?: {
      content?: Array<{ endIndex?: number }>;
    };
  };

  const content = payload.body?.content ?? [];
  const last = content[content.length - 1];
  return Math.max((last?.endIndex ?? 1) - 1, 1);
}

export async function getDocumentText(docId: string): Promise<string> {
  const response = await authedFetch(`${DOCS_API_BASE}/documents/${docId}`);
  const payload = (await response.json()) as {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: {
              content?: string;
            };
          }>;
        };
      }>;
    };
  };

  const content = payload.body?.content ?? [];
  let text = "";

  for (const item of content) {
    const elements = item.paragraph?.elements ?? [];
    for (const element of elements) {
      text += element.textRun?.content ?? "";
    }
  }

  return text;
}

export async function getDocumentStructure(docId: string): Promise<FullDocStructure> {
  const response = await authedFetch(`${DOCS_API_BASE}/documents/${docId}`);
  const payload = (await response.json()) as {
    body?: {
      content?: Array<{
        endIndex?: number;
        startIndex?: number;
        paragraph?: {
          elements?: Array<{ textRun?: { content?: string } }>;
          paragraphStyle?: { namedStyleType?: string };
        };
      }>;
    };
  };

  const content = payload.body?.content ?? [];
  const headings: DocHeading[] = [];

  for (const block of content) {
    const namedStyle = block.paragraph?.paragraphStyle?.namedStyleType ?? "";
    if (!namedStyle.startsWith("HEADING_")) {
      continue;
    }

    const text = (block.paragraph?.elements ?? [])
      .map((element) => element.textRun?.content ?? "")
      .join("")
      .trim();

    if (!text) {
      continue;
    }

    headings.push({
      text,
      level: namedStyle,
      startIndex: block.startIndex ?? 1,
      endIndex: block.endIndex ?? 1,
    });
  }

  const endIndex = Math.max((content[content.length - 1]?.endIndex ?? 1) - 1, 1);

  return {
    endIndex,
    headings,
  };
}

export async function batchUpdateDocument(docId: string, requests: Array<Record<string, unknown>>): Promise<void> {
  await authedFetch(`${DOCS_API_BASE}/documents/${docId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function appendTextChunk(docId: string, chunk: string): Promise<void> {
  const normalizedChunk = chunk.trim();
  if (!normalizedChunk) {
    return;
  }

  const insertionIndex = await getDocumentEndIndex(docId);
  await batchUpdateDocument(docId, [
    {
      insertText: {
        location: { index: insertionIndex },
        text: `${normalizedChunk}\n`,
      },
    },
  ]);
}

function toRgb(color: "yellow" | "lightBlue") {
  if (color === "lightBlue") {
    return { red: 0.72, green: 0.87, blue: 1 };
  }

  return { red: 1, green: 0.96, blue: 0.55 };
}

export async function insertTextAt(
  docId: string,
  index: number,
  text: string,
): Promise<{ start: number; end: number }> {
  await batchUpdateDocument(docId, [
    {
      insertText: {
        location: { index },
        text,
      },
    },
  ]);

  return {
    start: index,
    end: index + text.length,
  };
}

export async function applyHighlight(
  docId: string,
  startIndex: number,
  endIndex: number,
  color: "yellow" | "lightBlue",
): Promise<void> {
  if (endIndex <= startIndex) {
    return;
  }

  await batchUpdateDocument(docId, [
    {
      updateTextStyle: {
        range: {
          startIndex,
          endIndex,
        },
        textStyle: {
          backgroundColor: {
            color: {
              rgbColor: toRgb(color),
            },
          },
        },
        fields: "backgroundColor",
      },
    },
  ]);
}

export async function clearDocumentBody(docId: string): Promise<void> {
  const endIndex = await getDocumentEndIndex(docId);
  if (endIndex <= 1) {
    return;
  }

  await batchUpdateDocument(docId, [
    {
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex,
        },
      },
    },
  ]);
}

export async function replaceDocumentBody(docId: string, text: string): Promise<void> {
  const endIndex = await getDocumentEndIndex(docId);
  const requests: Array<Record<string, unknown>> = [];

  if (endIndex > 1) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex,
        },
      },
    });
  }

  if (text.length > 0) {
    requests.push({
      insertText: {
        location: { index: 1 },
        text,
      },
    });
  }

  if (requests.length > 0) {
    await batchUpdateDocument(docId, requests);
  }
}
