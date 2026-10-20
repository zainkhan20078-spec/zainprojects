import "fake-indexeddb/auto";
import { db } from "../../db";

// Clearing tables (instead of db.delete()) keeps the Dexie singleton usable
// across tests; IndexedDB's clear() also resets auto-increment key generators.
export async function resetDb(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }
  await Promise.all(db.tables.map((table) => table.clear()));
}
