import type * as PdfjsDist from "pdfjs-dist";
import { unzipSync } from "fflate";

const MAX_INPUT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_INPUT_FILES = 50;

export interface IngestedContent {
  sourceName: string;
  mimeType: string;
  text: string;
}

export interface IngestionSummary {
  combinedText: string;
  items: IngestedContent[];
  warnings: string[];
}

function extOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index + 1).toLowerCase();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

// Heavy parsers (pdf.js, tesseract, unrar) are loaded on demand so
// they never sit in the startup path of the extension.
async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjsLib: typeof PdfjsDist = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if ("str" in item) {
          return item.str;
        }
        return "";
      })
      .join(" ");
    lines.push(pageText);
  }

  return lines.join("\n");
}

async function extractDocxText(data: Uint8Array): Promise<string> {
  let oversizedDocument = false;
  const archive = unzipSync(data, {
    filter: (entry) => {
      if (entry.name !== "word/document.xml") {
        return false;
      }
      if (entry.originalSize > 10 * 1024 * 1024) {
        oversizedDocument = true;
        return false;
      }
      return true;
    },
  });
  if (oversizedDocument) {
    throw new Error("The DOCX document XML is too large to process safely.");
  }
  const documentXml = archive["word/document.xml"];
  if (!documentXml) {
    throw new Error("The DOCX file is missing word/document.xml.");
  }

  const parsedDocument = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), "application/xml");
  if (parsedDocument.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The DOCX document XML is malformed.");
  }

  const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(parsedDocument.getElementsByTagNameNS(wordNamespace, "p"));
  const getParagraphText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node as Element;
    if (element.localName === "tab") {
      return "\t";
    }
    if (element.localName === "br" || element.localName === "cr") {
      return "\n";
    }

    return Array.from(element.childNodes, getParagraphText).join("");
  };

  return paragraphs
    .map(getParagraphText)
    .filter((text) => text.length > 0)
    .join("\n");
}

async function extractImageText(data: Uint8Array): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa+eng");
  try {
    const imageBlob = new Blob([toArrayBuffer(data)], { type: "image/png" });
    const { data: ocrData } = await worker.recognize(imageBlob);
    return ocrData.text;
  } finally {
    await worker.terminate();
  }
}

async function parseSingleFile(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<IngestedContent> {
  const extension = extOf(params.fileName);
  const normalizedMime = params.mimeType.toLowerCase();

  if (extension === "txt" || extension === "md" || normalizedMime.startsWith("text/")) {
    const text = new TextDecoder("utf-8").decode(params.bytes);
    return {
      sourceName: params.fileName,
      mimeType: params.mimeType,
      text,
    };
  }

  if (extension === "pdf" || normalizedMime === "application/pdf") {
    return {
      sourceName: params.fileName,
      mimeType: params.mimeType,
      text: await extractPdfText(params.bytes),
    };
  }

  if (
    extension === "docx" ||
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return {
      sourceName: params.fileName,
      mimeType: params.mimeType,
      text: await extractDocxText(params.bytes),
    };
  }

  if (
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    normalizedMime === "image/png" ||
    normalizedMime === "image/jpeg"
  ) {
    return {
      sourceName: params.fileName,
      mimeType: params.mimeType,
      text: await extractImageText(params.bytes),
    };
  }

  return {
    sourceName: params.fileName,
    mimeType: params.mimeType,
    text: `Unsupported file format for direct parsing: ${params.fileName}`,
  };
}

async function extractZipEntries(
  fileName: string,
  bytes: Uint8Array,
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  let sizeLimitError: string | null = null;
  const unpacked = unzipSync(bytes, {
    filter: (entry) => {
      if (sizeLimitError) {
        return false;
      }
      if (entry.name.endsWith("/")) {
        return false;
      }
      entryCount += 1;
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        sizeLimitError = `Archive contains more than ${MAX_ARCHIVE_ENTRIES} files.`;
        return false;
      }
      if (entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES) {
        sizeLimitError = `Archive file exceeds the ${MAX_ARCHIVE_ENTRY_BYTES / (1024 * 1024)} MB per-file limit.`;
        return false;
      }
      totalUncompressedBytes += entry.originalSize;
      if (totalUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
        sizeLimitError = `Archive exceeds the ${MAX_ARCHIVE_TOTAL_BYTES / (1024 * 1024)} MB expanded-size limit.`;
        return false;
      }
      return true;
    },
  });
  if (sizeLimitError) {
    throw new Error(sizeLimitError);
  }

  return Object.entries(unpacked)
    .filter((entry) => !entry[0].endsWith("/"))
    .map(([name, value]) => ({
      name: `${fileName}:${name}`,
      bytes: value,
    }));
}

async function extractRarEntries(
  fileName: string,
  bytes: Uint8Array,
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const { createExtractorFromData } = await import("node-unrar-js");
  const extractor = await createExtractorFromData({ data: toArrayBuffer(bytes) });
  const headers: Array<{ name: string; flags: { directory: boolean }; unpSize: number }> = [];
  let totalUncompressedBytes = 0;
  for (const header of extractor.getFileList().fileHeaders) {
    if (headers.length >= MAX_ARCHIVE_ENTRIES) {
      throw new Error(`Archive contains more than ${MAX_ARCHIVE_ENTRIES} files.`);
    }
    headers.push(header);
    if (header.flags.directory) {
      continue;
    }
    if (!Number.isFinite(header.unpSize) || header.unpSize < 0 || header.unpSize > MAX_ARCHIVE_ENTRY_BYTES) {
      throw new Error(`Archive file exceeds the ${MAX_ARCHIVE_ENTRY_BYTES / (1024 * 1024)} MB per-file limit.`);
    }
    totalUncompressedBytes += header.unpSize;
  }
  if (totalUncompressedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
    throw new Error(`Archive exceeds the ${MAX_ARCHIVE_TOTAL_BYTES / (1024 * 1024)} MB expanded-size limit.`);
  }

  const extracted = extractor.extract({ files: headers.map((header) => header.name) });
  const entries: Array<{ name: string; bytes: Uint8Array }> = [];

  for (const file of extracted.files) {
    if (file.fileHeader.flags.directory || !file.extraction) {
      continue;
    }

    entries.push({
      name: `${fileName}:${file.fileHeader.name}`,
      bytes: file.extraction,
    });
  }

  return entries;
}

async function parseArchive(file: File, bytes: Uint8Array): Promise<{ items: IngestedContent[]; warnings: string[] }> {
  const extension = extOf(file.name);
  const warnings: string[] = [];
  let entries: Array<{ name: string; bytes: Uint8Array }> = [];

  if (extension === "zip") {
    entries = await extractZipEntries(file.name, bytes);
  } else if (extension === "rar") {
    entries = await extractRarEntries(file.name, bytes);
  }

  const parsedItems: IngestedContent[] = [];

  for (const entry of entries) {
    const parsed = await parseSingleFile({
      fileName: entry.name,
      mimeType: "application/octet-stream",
      bytes: entry.bytes,
    });

    if (parsed.text.startsWith("Unsupported file format")) {
      warnings.push(parsed.text);
      continue;
    }

    parsedItems.push(parsed);
  }

  return {
    items: parsedItems,
    warnings,
  };
}

export async function ingestFiles(files: File[]): Promise<IngestionSummary> {
  if (files.length > MAX_INPUT_FILES) {
    throw new Error(`Select no more than ${MAX_INPUT_FILES} files at a time.`);
  }

  const items: IngestedContent[] = [];
  const warnings: string[] = [];
  let totalInputBytes = 0;

  for (const file of files) {
    if (file.size > MAX_INPUT_FILE_BYTES) {
      throw new Error(`${file.name} exceeds the ${MAX_INPUT_FILE_BYTES / (1024 * 1024)} MB file-size limit.`);
    }
    totalInputBytes += file.size;
    if (totalInputBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new Error(`Selected files exceed the ${MAX_ARCHIVE_TOTAL_BYTES / (1024 * 1024)} MB total-size limit.`);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const extension = extOf(file.name);

    if (extension === "zip" || extension === "rar") {
      const archiveResult = await parseArchive(file, bytes);
      items.push(...archiveResult.items);
      warnings.push(...archiveResult.warnings);
      continue;
    }

    const parsed = await parseSingleFile({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    if (parsed.text.startsWith("Unsupported file format")) {
      warnings.push(parsed.text);
      continue;
    }

    items.push(parsed);
  }

  const combinedText = items
    .map((item) => `Source: ${item.sourceName}\n${item.text.trim()}`)
    .filter((entry) => entry.length > 0)
    .join("\n\n");

  return {
    combinedText,
    items,
    warnings,
  };
}
