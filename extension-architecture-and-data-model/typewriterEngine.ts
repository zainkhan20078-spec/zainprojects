export interface TypewriterTask {
  docId: string;
  text: string;
}

export interface TypewriterEngineOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  maxWordsPerChunk?: number;
}

export interface TypewriterWriter {
  appendChunk: (docId: string, chunk: string) => Promise<void>;
}

interface QueueItem {
  task: TypewriterTask;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const DEFAULT_MIN_DELAY = 150;
const DEFAULT_MAX_DELAY = 300;
const DEFAULT_MAX_WORDS = 18;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  const floorMin = Math.ceil(min);
  const floorMax = Math.floor(max);
  return Math.floor(Math.random() * (floorMax - floorMin + 1)) + floorMin;
}

function splitByWordCount(sentence: string, maxWords: number): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return [sentence.trim()];
  }

  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    chunks.push(words.slice(index, index + maxWords).join(" "));
  }
  return chunks;
}

export function splitIntoHumanChunks(text: string, maxWords = DEFAULT_MAX_WORDS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const sentenceLikeSegments = normalized
    .split(/(?<=[.!?;:\n])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const segment of sentenceLikeSegments) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      chunks.push(segment);
      continue;
    }

    chunks.push(...splitByWordCount(segment, maxWords));
  }

  return chunks;
}

export class TypewriterEngine {
  private readonly writer: TypewriterWriter;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxWordsPerChunk: number;
  private readonly queues = new Map<string, QueueItem[]>();
  private readonly processingDocs = new Set<string>();

  constructor(writer: TypewriterWriter, options: TypewriterEngineOptions = {}) {
    this.writer = writer;
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY;
    this.maxWordsPerChunk = options.maxWordsPerChunk ?? DEFAULT_MAX_WORDS;
  }

  enqueue(task: TypewriterTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(task.docId) ?? [];
      queue.push({ task, resolve, reject });
      this.queues.set(task.docId, queue);
      void this.processDocQueue(task.docId);
    });
  }

  private async processDocQueue(docId: string): Promise<void> {
    if (this.processingDocs.has(docId)) {
      return;
    }

    this.processingDocs.add(docId);

    try {
      const queue = this.queues.get(docId) ?? [];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) {
          break;
        }

        try {
          const chunks = splitIntoHumanChunks(item.task.text, this.maxWordsPerChunk);

          for (const chunk of chunks) {
            await this.writer.appendChunk(docId, chunk);
            const delay = randomInt(this.minDelayMs, this.maxDelayMs);
            await sleep(delay);
          }

          item.resolve();
        } catch (error) {
          item.reject(error);
        }
      }

      if (queue.length === 0) {
        this.queues.delete(docId);
      }
    } finally {
      this.processingDocs.delete(docId);
    }
  }
}
