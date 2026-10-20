import { describe, expect, it } from "vitest";
import { parseNaturalCommand } from "../naturalCommandParser";

describe("parseNaturalCommand", () => {
  it("parses the create-new-doc example from the README", () => {
    const { blueprint, cleanedInstruction } = parseNaturalCommand(
      "Put this in a new doc called 'Thermodynamics Summary'.",
    );
    expect(blueprint.action).toBe("CREATE_NEW_DOC");
    expect(blueprint.targetName).toBe("Thermodynamics Summary");
    expect(blueprint.style).toBe("INSTANT");
    expect(cleanedInstruction).toBe("Put this in a new doc called 'Thermodynamics Summary'.");
  });

  it("parses the append-to-existing example", () => {
    const { blueprint } = parseNaturalCommand("Edit the existing 'Physics' doc and add this to the bottom.");
    expect(blueprint.action).toBe("APPEND_TO_EXISTING");
    expect(blueprint.targetName).toBe("Physics");
  });

  it("parses section headings and highlight requests", () => {
    const { blueprint } = parseNaturalCommand(
      "Add this to the Thermodynamics section and highlight what is important.",
    );
    expect(blueprint.sectionHeading).toBe("Thermodynamics");
    expect(blueprint.highlightImportant).toBe(true);
    expect(blueprint.action).toBe("APPEND_TO_EXISTING");
    expect(blueprint.targetName).toBe("Current Notebook");
  });

  it("parses human-speed dyslexia typing", () => {
    const { blueprint } = parseNaturalCommand(
      "Type this into the 'History' doc but add my dyslexia typos at human speed.",
    );
    expect(blueprint.style).toBe("HUMAN_SPEED");
    expect(blueprint.addDyslexiaTypos).toBe(true);
    expect(blueprint.targetName).toBe("History");
  });

  it("detects overwrite intent", () => {
    const { blueprint } = parseNaturalCommand("Overwrite the 'Physics' doc from scratch");
    expect(blueprint.action).toBe("OVERWRITE_EXISTING");
    expect(blueprint.targetName).toBe("Physics");
  });

  it("falls back to the current notebook and append when nothing matches", () => {
    const { blueprint } = parseNaturalCommand("Summarise my notes");
    expect(blueprint.action).toBe("APPEND_TO_EXISTING");
    expect(blueprint.targetName).toBe("Current Notebook");
    expect(blueprint.style).toBe("INSTANT");
    expect(blueprint.addDyslexiaTypos).toBe(false);
  });

  it("extracts an unquoted target name from 'into the X notebook' phrasing", () => {
    const { blueprint } = parseNaturalCommand("put this into the Physics notebook");
    expect(blueprint.targetName).toBe("Physics");
  });
});
