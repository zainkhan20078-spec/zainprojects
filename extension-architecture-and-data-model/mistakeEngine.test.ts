import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { applyMistakeProfile, ensureDefaultErrorProfile } from "../mistakeEngine";
import { resetDb } from "./helpers/resetDb";

beforeEach(async () => {
  await resetDb();
});

describe("ensureDefaultErrorProfile", () => {
  it("creates the default profile once and reuses it", async () => {
    const firstId = await ensureDefaultErrorProfile();
    const secondId = await ensureDefaultErrorProfile();
    expect(firstId).toBe(secondId);

    const profiles = await db.errorProfiles.toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].patterns.length).toBeGreaterThan(0);
  });
});

describe("applyMistakeProfile", () => {
  it("leaves text untouched at intensity 0", async () => {
    const profileId = await ensureDefaultErrorProfile();
    const result = await applyMistakeProfile({
      profileId,
      text: "and t quite que",
      intensity: 0,
    });
    expect(result).toBe("and t quite que");
  });

  it("applies every matching pattern at intensity 1", async () => {
    const profileId = await ensureDefaultErrorProfile();
    const result = await applyMistakeProfile({
      profileId,
      text: "and t quite que",
      intensity: 1,
    });
    expect(result).toBe("annd tt quitee quee");
  });

  it("never mutates protected spans like equations and numbers", async () => {
    const profileId = await ensureDefaultErrorProfile();
    const result = await applyMistakeProfile({
      profileId,
      text: "x = 5 and 42",
      intensity: 1,
    });
    expect(result).toContain("x = 5");
    expect(result).toContain("42");
    expect(result).toContain("annd");
  });

  it("throws for an unknown profile id", async () => {
    await expect(applyMistakeProfile({ profileId: 999999, text: "hello", intensity: 1 })).rejects.toThrow(
      "Error profile not found.",
    );
  });
});
