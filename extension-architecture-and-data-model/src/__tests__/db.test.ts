import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeAll, describe, expect, it } from "vitest";
import { db, DEFAULT_NOTEBOOK_SUBJECTS } from "../db";

// Seeded before the singleton ever opens so the real v1 -> v3 upgrade path runs.
beforeAll(async () => {
  const legacy = new Dexie("studyExtensionDB");
  legacy.version(1).stores({
    notebooks: "++id, name, linkedGoogleDocId, createdAt",
    notes: "++id, notebookId, lastEdited",
    mathAST: "++id",
    docBackups: "++id, notebookId, timestamp",
    errorProfiles: "++id, name",
    exercises: "++id, profileId, createdAt",
    aiProviders: "++id, name",
    apiKeys: "++id, providerId, lastUsed, cooldownUntil",
    aiLogs: "++id, timestamp",
  });

  await legacy.open();
  await legacy.table("notebooks").bulkAdd([
    {
      name: "Legacy One",
      featureToggles: { math: true, physics: true, lengua: false },
      createdAt: 111,
    },
    {
      name: "Legacy Two",
      featureToggles: {},
      createdAt: 222,
      linkedGoogleDocId: "doc-existing",
    },
  ]);
  legacy.close();
});

describe("StudyExtensionDB migrations", () => {
  it("upgrades legacy v1 notebooks to the v3 shape on first open", async () => {
    const notebooks = await db.notebooks.orderBy("sortOrder").toArray();

    expect(db.verno).toBe(3);
    expect(notebooks).toHaveLength(2);

    const [first, second] = notebooks;

    expect(first.name).toBe("Legacy One");
    expect(first.sortOrder).toBe(0);
    expect(first.featureToggles).toEqual({
      math: true,
      physics: true,
      lengua: false,
      aiChat: true,
    });
    expect(first.linkedGoogleDocId).toBeNull();
    expect(first.subjects?.map((subject) => subject.id)).toEqual(["math", "physics", "aiChat"]);
    expect(first.archivedSubjects).toEqual([]);

    expect(second.name).toBe("Legacy Two");
    expect(second.sortOrder).toBe(1);
    expect(second.featureToggles).toEqual({
      math: true,
      physics: true,
      lengua: true,
      aiChat: true,
    });
    expect(second.linkedGoogleDocId).toBe("doc-existing");
    expect(second.subjects?.map((subject) => subject.id)).toEqual(
      DEFAULT_NOTEBOOK_SUBJECTS.map((subject) => subject.id),
    );
  });

  it("continues to accept new notebooks after the upgrade", async () => {
    const id = await db.notebooks.add({
      name: "Fresh After Migration",
      featureToggles: { math: true, physics: true, lengua: true, aiChat: true },
      subjects: DEFAULT_NOTEBOOK_SUBJECTS.map((subject) => ({ ...subject })),
      archivedSubjects: [],
      linkedGoogleDocId: null,
      createdAt: Date.now(),
      sortOrder: 99,
    });

    const stored = await db.notebooks.get(id);
    expect(stored?.name).toBe("Fresh After Migration");
    expect(stored?.subjects).toHaveLength(4);
  });
});
