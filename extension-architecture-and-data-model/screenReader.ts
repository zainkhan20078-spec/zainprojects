export interface ScreenReadResult {
  extractedText: string;
  imageDataUrl: string;
}

function ensureChromeTabCapture(): void {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    throw new Error("chrome.tabs.captureVisibleTab is not available.");
  }
}

export async function captureVisibleScreen(): Promise<string> {
  ensureChromeTabCapture();
  return chrome.tabs.captureVisibleTab({ format: "png" });
}

export async function readTextFromImageDataUrl(imageDataUrl: string): Promise<string> {
  // Tesseract and its language data are large; load only when OCR runs.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa+eng");
  try {
    const { data } = await worker.recognize(imageDataUrl);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function captureAndReadScreen(): Promise<ScreenReadResult> {
  const imageDataUrl = await captureVisibleScreen();
  const extractedText = await readTextFromImageDataUrl(imageDataUrl);

  return {
    extractedText,
    imageDataUrl,
  };
}
