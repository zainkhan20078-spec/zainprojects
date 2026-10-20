import { describe, expect, it } from "vitest";
import {
  createNodeForActionId,
  createTemplateBlocks,
  getTokenForActionId,
  MATH_TEMPLATES,
  PHYSICS_TEMPLATES,
} from "../components/mathEditorTemplates";

describe("createTemplateBlocks", () => {
  it("returns one block per simple formula template", () => {
    expect(createTemplateBlocks("newton")).toHaveLength(1);
    expect(createTemplateBlocks("quadratic")).toHaveLength(1);
  });

  it("returns multiple blocks for multi-equation templates", () => {
    expect(createTemplateBlocks("suvat")).toHaveLength(3);
    expect(createTemplateBlocks("system")).toHaveLength(2);
  });

  it("returns no blocks for unknown template ids", () => {
    expect(createTemplateBlocks("does-not-exist")).toEqual([]);
  });

  it("builds every math and physics template without throwing", () => {
    for (const template of [...MATH_TEMPLATES, ...PHYSICS_TEMPLATES]) {
      const blocks = createTemplateBlocks(template.id);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.type).toBe("equation");
        expect(block.nodes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getTokenForActionId", () => {
  it("maps unit and symbol toolbar actions to inserted tokens", () => {
    expect(getTokenForActionId("unit-newton")).toBe(" N");
    expect(getTokenForActionId("unit-ms")).toBe(" m·s⁻¹");
    expect(getTokenForActionId("symbol-theta")).toBe(" θ");
    expect(getTokenForActionId("symbol-g")).toBe("g");
  });

  it("returns null for structural actions and unknown ids", () => {
    expect(getTokenForActionId("frac")).toBeNull();
    expect(getTokenForActionId("nope")).toBeNull();
  });
});

describe("createNodeForActionId", () => {
  it("maps structural toolbar actions to AST nodes", () => {
    expect(createNodeForActionId("frac")?.type).toBe("fraction");
    expect(createNodeForActionId("der")?.type).toBe("derivative");
    expect(createNodeForActionId("integral")?.type).toBe("integral");
  });

  it("returns null for token actions and unknown ids", () => {
    expect(createNodeForActionId("unit-newton")).toBeNull();
    expect(createNodeForActionId("nope")).toBeNull();
  });
});
