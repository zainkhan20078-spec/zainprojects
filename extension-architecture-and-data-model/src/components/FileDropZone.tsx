import { useState } from "react";
import { ingestFiles } from "../fileIngestor";

interface FileDropZoneProps {
  onTextIngested: (text: string) => void;
}

export function FileDropZone({ onTextIngested }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("Drop files here: PDF, TXT, MD, DOCX, PNG/JPG, ZIP, RAR.");
  const [busy, setBusy] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    try {
      setBusy(true);
      const files = Array.from(fileList);
      const summary = await ingestFiles(files);
      if (summary.combinedText.trim()) {
        onTextIngested(summary.combinedText);
      }

      if (summary.warnings.length > 0) {
        setStatus(`Imported with warnings: ${summary.warnings.join(" | ")}`);
      } else {
        setStatus(`Imported ${summary.items.length} source files.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      setStatus(`Ingestion failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-slate-700 bg-slate-900 p-4">
      <h3 className="text-lg font-semibold text-slate-100">Universal File Ingestion</h3>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`block rounded-md border-2 border-dashed px-4 py-8 text-center text-sm transition ${
          isDragging ? "border-indigo-400 bg-slate-950 text-slate-100" : "border-slate-600 text-slate-300"
        }`}
      >
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <span className="font-medium">Drag and drop files, or click to browse</span>
        <p className="mt-2 text-xs text-slate-400">Processing is local-first in browser memory.</p>
      </label>

      <p className="text-sm text-slate-300">{busy ? "Processing files..." : status}</p>
    </section>
  );
}
