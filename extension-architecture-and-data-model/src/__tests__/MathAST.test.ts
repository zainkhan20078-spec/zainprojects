import { describe, expect, it } from "vitest";
import {
  createAtomNode,
  createDefaultMathDocument,
  createEquationBlock,
  createFractionNode,
  createIntegralNode,
  createLimitNode,
  createPowerNode,
  createRootNode,
  createSubscriptNode,
  createTextBlock,
  getOrderedSlots,
  getPrimarySlotId,
  insertEquationBlockAfter,
  insertTextBlockAfter,
  parseMathDocument,
  removeBlock,
  removeNode,
  replaceNodeWith,
  serializeMathDocument,
  setSlotText,
  updateTextBlock,
  type EquationBlock,
  type MathDocument,
} from "../components/MathAST";

describe("parseMathDocument", () => {
  it("returns a default text-block document for empty input", () => {
    const doc = parseMathDocument("   ");
    expect(doc.version).toBe(1);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].type).toBe("text");
  });

  it("falls back to a text block for non-JSON values", () => {
    const doc = parseMathDocument("just plain notes");
    expect(doc.blocks[0]).toMatchObject({ type: "text", text: "just plain notes" });
  });

  it("falls back to a text block for JSON that is not a math document", () => {
    const doc = parseMathDocument('{"hello":"world"}');
    expect(doc.blocks[0].type).toBe("text");
  });

  it("accepts a valid serialized document unchanged", () => {
    const original = createDefaultMathDocument("keep me");
    const doc = parseMathDocument(serializeMathDocument(original));
    expect(doc).toEqual(original);
  });
});

describe("serializeMathDocument / parseMathDocument roundtrip", () => {
  it("survives serialize -> parse for mixed documents", () => {
    const fraction = createFractionNode();
    fraction.numerator.text = "1";
    fraction.denominator.text = "2";
    const equation = createEquationBlock([createAtomNode("x+"), fraction]);

    const doc: MathDocument = {
      version: 1,
      blocks: [createTextBlock("intro"), equation],
    };

    expect(parseMathDocument(serializeMathDocument(doc))).toEqual(doc);
  });
});

describe("setSlotText", () => {
  it("updates the requested slot of the requested node", () => {
    const fraction = createFractionNode();
    const block = createEquationBlock([fraction]);
    const doc: MathDocument = { version: 1, blocks: [block] };

    const next = setSlotText(doc, block.id, fraction.id, "numerator", "42");
    const updated = (next.blocks[0] as EquationBlock).nodes[0];
    expect(updated).toMatchObject({ type: "fraction" });
    if (updated.type === "fraction") {
      expect(updated.numerator.text).toBe("42");
    }
  });

  it("returns an unchanged document when the slot key does not exist", () => {
    const atom = createAtomNode("x");
    const block = createEquationBlock([atom]);
    const doc: MathDocument = { version: 1, blocks: [block] };

    const next = setSlotText(doc, block.id, atom.id, "numerator", "42");
    expect(next).toEqual(doc);
    expect((next.blocks[0] as EquationBlock).nodes[0]).toMatchObject({ type: "atom" });
  });
});

describe("removeNode / removeBlock fallbacks", () => {
  it("replaces an emptied equation with a fresh atom", () => {
    const atom = createAtomNode("only");
    const block = createEquationBlock([atom]);
    const doc: MathDocument = { version: 1, blocks: [block] };

    const next = removeNode(doc, block.id, atom.id);
    const equation = next.blocks[0] as EquationBlock;
    expect(equation.nodes).toHaveLength(1);
    expect(equation.nodes[0].type).toBe("atom");
    expect(equation.nodes[0]).not.toEqual(atom);
  });

  it("replaces an emptied document with a fresh text block", () => {
    const block = createTextBlock("only");
    const doc: MathDocument = { version: 1, blocks: [block] };

    const next = removeBlock(doc, block.id);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].type).toBe("text");
  });
});

describe("replaceNodeWith", () => {
  it("swaps the node in place", () => {
    const atom = createAtomNode("x");
    const block = createEquationBlock([atom]);
    const doc: MathDocument = { version: 1, blocks: [block] };
    const root = createRootNode();

    const next = replaceNodeWith(doc, block.id, atom.id, root);
    expect((next.blocks[0] as EquationBlock).nodes[0].id).toBe(root.id);
  });
});

describe("insertTextBlockAfter / insertEquationBlockAfter", () => {
  it("inserts a new block directly after the anchor block", () => {
    const first = createTextBlock("a");
    const doc: MathDocument = { version: 1, blocks: [first] };

    const withText = insertTextBlockAfter(doc, first.id, "b");
    expect(withText.blocks.map((block) => (block.type === "text" ? block.text : ""))).toEqual(["a", "b"]);

    const equation = createEquationBlock();
    const withEquation = insertEquationBlockAfter(withText, first.id, equation.nodes);
    expect(withEquation.blocks[1].type).toBe("equation");
    expect(withEquation.blocks[2].type).toBe("text");
  });
});

describe("updateTextBlock", () => {
  it("only edits the matching text block", () => {
    const first = createTextBlock("a");
    const second = createTextBlock("b");
    const doc: MathDocument = { version: 1, blocks: [first, second] };

    const next = updateTextBlock(doc, second.id, "changed");
    expect(next.blocks[0]).toBe(first);
    expect(next.blocks[1]).toMatchObject({ type: "text", text: "changed" });
  });
});

describe("getOrderedSlots", () => {
  it("walks integral slots in bound, integrand, variable order", () => {
    const integral = createIntegralNode();
    const block = createEquationBlock([integral]);
    const pointers = getOrderedSlots(block);

    expect(pointers.map((pointer) => pointer.slotKey)).toEqual(["lowerBound", "upperBound", "integrand", "variable"]);
    expect(pointers.every((pointer) => pointer.nodeId === integral.id)).toBe(true);
  });

  it("mixes slots across multiple nodes in document order", () => {
    const power = createPowerNode();
    const limit = createLimitNode();
    const block = createEquationBlock([power, limit]);
    const pointers = getOrderedSlots(block);

    expect(pointers).toHaveLength(4);
    expect(pointers[0].nodeId).toBe(power.id);
    expect(pointers[2].nodeId).toBe(limit.id);
  });
});

describe("getPrimarySlotId", () => {
  it("points at the slot a user would type into first", () => {
    expect(getPrimarySlotId(createFractionNode())).toBeDefined();
    expect(getPrimarySlotId(createPowerNode())).toBeDefined();

    const limit = createLimitNode();
    expect(getPrimarySlotId(limit)).toBe(limit.approach.id);

    const subscript = createSubscriptNode();
    expect(getPrimarySlotId(subscript)).toBe(subscript.base.id);
  });
});
