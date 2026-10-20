// @vitest-environment jsdom
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ingestFiles } from "../fileIngestor";

function createMinimalPdf(): ArrayBuffer {
  const stream = "BT /F1 12 Tf 20 100 Td (PDF parser works) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const encoded = new TextEncoder().encode(pdf);
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

describe("DOCX ingestion", () => {
  it("extracts paragraph text, tabs, and line breaks without loading a legacy parser", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t>world</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second paragraph</w:t><w:br/><w:t>second line</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    const docxBytes = zipSync({
      "word/document.xml": new TextEncoder().encode(documentXml),
    });
    const file = new File([docxBytes], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const result = await ingestFiles([file]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Hello\tworld\nSecond paragraph\nsecond line");
    expect(result.warnings).toEqual([]);
  });

  it("reports malformed DOCX archives instead of silently returning empty text", async () => {
    const file = new File([zipSync({ "word/not-document.xml": new Uint8Array([1]) })], "broken.docx");

    await expect(ingestFiles([file])).rejects.toThrow("missing word/document.xml");
  });

  it("rejects ZIP entries that exceed the expanded per-file size limit", async () => {
    const expandedText = new TextEncoder().encode("a".repeat(26 * 1024 * 1024));
    const file = new File([zipSync({ "notes.txt": expandedText })], "compressed.zip");

    await expect(ingestFiles([file])).rejects.toThrow("per-file limit");
  });
});

describe("PDF ingestion", () => {
  it("extracts text from a valid PDF with the patched PDF.js runtime", async () => {
    const file = new File([createMinimalPdf()], "notes.pdf", { type: "application/pdf" });

    const result = await ingestFiles([file]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toContain("PDF parser works");
  });
});
