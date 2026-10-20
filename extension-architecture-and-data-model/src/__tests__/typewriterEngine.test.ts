import { describe, expect, it } from "vitest";
import { splitIntoHumanChunks, TypewriterEngine } from "../typewriterEngine";

describe("splitIntoHumanChunks", () => {
  it("returns no chunks for empty input", () => {
    expect(splitIntoHumanChunks("   \n  ")).toEqual([]);
  });

  it("keeps short sentences as single chunks", () => {
    expect(splitIntoHumanChunks("One sentence. Another one!")).toEqual(["One sentence.", "Another one!"]);
  });

  it("splits long sentences by word count", () => {
    const longSentence = `${"word ".repeat(40)}.`;
    const chunks = splitIntoHumanChunks(longSentence, 18);
    expect(chunks).toHaveLength(3);
    expect(chunks.join(" ").split(/\s+/).filter(Boolean)).toHaveLength(41);
  });

  it("normalises CRLF line endings before splitting", () => {
    expect(splitIntoHumanChunks("line one\r\nline two")).toEqual(["line one\nline two"]);
  });
});

describe("TypewriterEngine", () => {
  it("appends every chunk in order and resolves on completion", async () => {
    const written: Array<{ docId: string; chunk: string }> = [];
    const engine = new TypewriterEngine(
      {
        appendChunk: async (docId, chunk) => {
          written.push({ docId, chunk });
        },
      },
      { minDelayMs: 0, maxDelayMs: 0 },
    );

    await engine.enqueue({ docId: "doc-1", text: "First part. Second part." });

    expect(written.map((entry) => entry.chunk)).toEqual(["First part.", "Second part."]);
    expect(written.every((entry) => entry.docId === "doc-1")).toBe(true);
  });

  it("processes tasks for the same document sequentially", async () => {
    const order: string[] = [];
    const engine = new TypewriterEngine(
      {
        appendChunk: async (_docId, chunk) => {
          order.push(`start:${chunk}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push(`end:${chunk}`);
        },
      },
      { minDelayMs: 0, maxDelayMs: 0 },
    );

    await Promise.all([engine.enqueue({ docId: "doc-1", text: "A." }), engine.enqueue({ docId: "doc-1", text: "B." })]);

    expect(order).toEqual(["start:A.", "end:A.", "start:B.", "end:B."]);
  });

  it("keeps queues for different documents independent", async () => {
    const written: string[] = [];
    const engine = new TypewriterEngine(
      {
        appendChunk: async (_docId, chunk) => {
          written.push(chunk);
        },
      },
      { minDelayMs: 0, maxDelayMs: 0 },
    );

    await Promise.all([
      engine.enqueue({ docId: "doc-1", text: "One." }),
      engine.enqueue({ docId: "doc-2", text: "Two." }),
    ]);

    expect(written.sort()).toEqual(["One.", "Two."]);
  });

  it("rejects the task promise when the writer fails", async () => {
    const engine = new TypewriterEngine(
      {
        appendChunk: async () => {
          throw new Error("docs api down");
        },
      },
      { minDelayMs: 0, maxDelayMs: 0 },
    );

    await expect(engine.enqueue({ docId: "doc-1", text: "Any text." })).rejects.toThrow("docs api down");
  });
});
