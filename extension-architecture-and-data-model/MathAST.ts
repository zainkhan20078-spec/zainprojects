export type MathEditorMode = "math" | "physics";

export interface MathSlot {
  id: string;
  text: string;
}

export interface AtomNode {
  id: string;
  type: "atom";
  value: MathSlot;
}

export interface FractionNode {
  id: string;
  type: "fraction";
  numerator: MathSlot;
  denominator: MathSlot;
}

export interface DerivativeNode {
  id: string;
  type: "derivative";
  expression: MathSlot;
  variable: MathSlot;
}

export interface VectorNode {
  id: string;
  type: "vector";
  symbol: MathSlot;
}

export interface LimitNode {
  id: string;
  type: "limit";
  approach: MathSlot;
  expression: MathSlot;
}

export interface IntegralNode {
  id: string;
  type: "integral";
  lowerBound: MathSlot;
  upperBound: MathSlot;
  integrand: MathSlot;
  variable: MathSlot;
}

export interface PowerNode {
  id: string;
  type: "power";
  base: MathSlot;
  exponent: MathSlot;
}

export interface SubscriptNode {
  id: string;
  type: "subscript";
  base: MathSlot;
  index: MathSlot;
}

export interface RootNode {
  id: string;
  type: "root";
  radicand: MathSlot;
}

export interface GroupNode {
  id: string;
  type: "group";
  expression: MathSlot;
}

export type MathNode =
  | AtomNode
  | FractionNode
  | DerivativeNode
  | VectorNode
  | LimitNode
  | IntegralNode
  | PowerNode
  | SubscriptNode
  | RootNode
  | GroupNode;

export interface TextBlock {
  id: string;
  type: "text";
  text: string;
}

export interface EquationBlock {
  id: string;
  type: "equation";
  nodes: MathNode[];
}

export type MathBlock = TextBlock | EquationBlock;

export interface MathDocument {
  version: 1;
  blocks: MathBlock[];
}

export interface SlotPointer {
  slotId: string;
  nodeId: string;
  slotKey: string;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSlot(initialText = ""): MathSlot {
  return {
    id: createId("slot"),
    text: initialText,
  };
}

export function createAtomNode(initialValue = ""): AtomNode {
  return {
    id: createId("node"),
    type: "atom",
    value: createSlot(initialValue),
  };
}

export function createFractionNode(): FractionNode {
  return {
    id: createId("node"),
    type: "fraction",
    numerator: createSlot(""),
    denominator: createSlot(""),
  };
}

export function createDerivativeNode(): DerivativeNode {
  return {
    id: createId("node"),
    type: "derivative",
    expression: createSlot("f(x)"),
    variable: createSlot("x"),
  };
}

export function createVectorNode(): VectorNode {
  return {
    id: createId("node"),
    type: "vector",
    symbol: createSlot("v"),
  };
}

export function createLimitNode(): LimitNode {
  return {
    id: createId("node"),
    type: "limit",
    approach: createSlot("x->0"),
    expression: createSlot("f(x)"),
  };
}

export function createIntegralNode(): IntegralNode {
  return {
    id: createId("node"),
    type: "integral",
    lowerBound: createSlot("0"),
    upperBound: createSlot("1"),
    integrand: createSlot("f(x)"),
    variable: createSlot("dx"),
  };
}

export function createPowerNode(): PowerNode {
  return { id: createId("node"), type: "power", base: createSlot("x"), exponent: createSlot("2") };
}

export function createSubscriptNode(): SubscriptNode {
  return { id: createId("node"), type: "subscript", base: createSlot("a"), index: createSlot("n") };
}

export function createRootNode(): RootNode {
  return { id: createId("node"), type: "root", radicand: createSlot("") };
}

export function createGroupNode(): GroupNode {
  return { id: createId("node"), type: "group", expression: createSlot("") };
}

export function createTextBlock(initialText = ""): TextBlock {
  return {
    id: createId("block"),
    type: "text",
    text: initialText,
  };
}

export function createEquationBlock(initialNodes?: MathNode[]): EquationBlock {
  return {
    id: createId("block"),
    type: "equation",
    nodes: initialNodes && initialNodes.length > 0 ? initialNodes : [createAtomNode("")],
  };
}

export function createDefaultMathDocument(initialText = ""): MathDocument {
  return {
    version: 1,
    blocks: [createTextBlock(initialText)],
  };
}

export function parseMathDocument(rawValue: string): MathDocument {
  if (!rawValue.trim()) {
    return createDefaultMathDocument("");
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      (parsed as { version: number }).version === 1 &&
      "blocks" in parsed &&
      Array.isArray((parsed as { blocks: unknown[] }).blocks)
    ) {
      return parsed as MathDocument;
    }
  } catch {
    return createDefaultMathDocument(rawValue);
  }

  return createDefaultMathDocument(rawValue);
}

export function serializeMathDocument(document: MathDocument): string {
  return JSON.stringify(document);
}

export function getOrderedSlots(block: EquationBlock): SlotPointer[] {
  const pointers: SlotPointer[] = [];

  for (const node of block.nodes) {
    if (node.type === "atom") {
      pointers.push({ slotId: node.value.id, nodeId: node.id, slotKey: "value" });
      continue;
    }

    if (node.type === "fraction") {
      pointers.push({ slotId: node.numerator.id, nodeId: node.id, slotKey: "numerator" });
      pointers.push({ slotId: node.denominator.id, nodeId: node.id, slotKey: "denominator" });
      continue;
    }

    if (node.type === "derivative") {
      pointers.push({ slotId: node.expression.id, nodeId: node.id, slotKey: "expression" });
      pointers.push({ slotId: node.variable.id, nodeId: node.id, slotKey: "variable" });
      continue;
    }

    if (node.type === "vector") {
      pointers.push({ slotId: node.symbol.id, nodeId: node.id, slotKey: "symbol" });
      continue;
    }

    if (node.type === "limit") {
      pointers.push({ slotId: node.approach.id, nodeId: node.id, slotKey: "approach" });
      pointers.push({ slotId: node.expression.id, nodeId: node.id, slotKey: "expression" });
      continue;
    }

    if (node.type === "power") {
      pointers.push({ slotId: node.base.id, nodeId: node.id, slotKey: "base" });
      pointers.push({ slotId: node.exponent.id, nodeId: node.id, slotKey: "exponent" });
      continue;
    }

    if (node.type === "subscript") {
      pointers.push({ slotId: node.base.id, nodeId: node.id, slotKey: "base" });
      pointers.push({ slotId: node.index.id, nodeId: node.id, slotKey: "index" });
      continue;
    }

    if (node.type === "root") {
      pointers.push({ slotId: node.radicand.id, nodeId: node.id, slotKey: "radicand" });
      continue;
    }

    if (node.type === "group") {
      pointers.push({ slotId: node.expression.id, nodeId: node.id, slotKey: "expression" });
      continue;
    }

    pointers.push({ slotId: node.lowerBound.id, nodeId: node.id, slotKey: "lowerBound" });
    pointers.push({ slotId: node.upperBound.id, nodeId: node.id, slotKey: "upperBound" });
    pointers.push({ slotId: node.integrand.id, nodeId: node.id, slotKey: "integrand" });
    pointers.push({ slotId: node.variable.id, nodeId: node.id, slotKey: "variable" });
  }

  return pointers;
}

export function getPrimarySlotId(node: MathNode): string {
  if (node.type === "atom") return node.value.id;
  if (node.type === "fraction") return node.numerator.id;
  if (node.type === "derivative") return node.expression.id;
  if (node.type === "vector") return node.symbol.id;
  if (node.type === "limit") return node.approach.id;
  if (node.type === "power" || node.type === "subscript") return node.base.id;
  if (node.type === "root") return node.radicand.id;
  if (node.type === "group") return node.expression.id;
  return node.lowerBound.id;
}

function updateNodeSlot(node: MathNode, slotKey: string, text: string): MathNode {
  if (node.type === "atom" && slotKey === "value") {
    return { ...node, value: { ...node.value, text } };
  }

  if (node.type === "fraction" && (slotKey === "numerator" || slotKey === "denominator")) {
    return {
      ...node,
      [slotKey]: {
        ...node[slotKey],
        text,
      },
    };
  }

  if (node.type === "derivative" && (slotKey === "expression" || slotKey === "variable")) {
    return {
      ...node,
      [slotKey]: {
        ...node[slotKey],
        text,
      },
    };
  }

  if (node.type === "vector" && slotKey === "symbol") {
    return { ...node, symbol: { ...node.symbol, text } };
  }

  if (node.type === "power") {
    if (slotKey === "base") return { ...node, base: { ...node.base, text } };
    if (slotKey === "exponent") return { ...node, exponent: { ...node.exponent, text } };
  }

  if (node.type === "subscript") {
    if (slotKey === "base") return { ...node, base: { ...node.base, text } };
    if (slotKey === "index") return { ...node, index: { ...node.index, text } };
  }

  if (node.type === "root" && slotKey === "radicand") {
    return { ...node, radicand: { ...node.radicand, text } };
  }

  if (node.type === "group" && slotKey === "expression") {
    return { ...node, expression: { ...node.expression, text } };
  }

  if (node.type === "limit" && (slotKey === "approach" || slotKey === "expression")) {
    return {
      ...node,
      [slotKey]: {
        ...node[slotKey],
        text,
      },
    };
  }

  if (
    node.type === "integral" &&
    (slotKey === "lowerBound" || slotKey === "upperBound" || slotKey === "integrand" || slotKey === "variable")
  ) {
    return {
      ...node,
      [slotKey]: {
        ...node[slotKey],
        text,
      },
    };
  }

  return node;
}

export function removeNode(document: MathDocument, blockId: string, nodeId: string): MathDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id !== blockId || block.type !== "equation") return block;
      const nodes = block.nodes.filter((node) => node.id !== nodeId);
      return { ...block, nodes: nodes.length > 0 ? nodes : [createAtomNode("")] };
    }),
  };
}

export function removeBlock(document: MathDocument, blockId: string): MathDocument {
  const blocks = document.blocks.filter((block) => block.id !== blockId);
  return { ...document, blocks: blocks.length > 0 ? blocks : [createTextBlock("")] };
}

export function setSlotText(
  document: MathDocument,
  blockId: string,
  nodeId: string,
  slotKey: string,
  text: string,
): MathDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id !== blockId || block.type !== "equation") {
        return block;
      }

      return {
        ...block,
        nodes: block.nodes.map((node) => (node.id === nodeId ? updateNodeSlot(node, slotKey, text) : node)),
      };
    }),
  };
}

export function replaceNodeWith(
  document: MathDocument,
  blockId: string,
  nodeId: string,
  replacement: MathNode,
): MathDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id !== blockId || block.type !== "equation") {
        return block;
      }

      return {
        ...block,
        nodes: block.nodes.map((node) => (node.id === nodeId ? replacement : node)),
      };
    }),
  };
}

export function insertTextBlockAfter(document: MathDocument, afterBlockId: string, initialText = ""): MathDocument {
  const nextBlocks: MathBlock[] = [];

  for (const block of document.blocks) {
    nextBlocks.push(block);
    if (block.id === afterBlockId) {
      nextBlocks.push(createTextBlock(initialText));
    }
  }

  return { ...document, blocks: nextBlocks };
}

export function insertEquationBlockAfter(
  document: MathDocument,
  afterBlockId: string,
  initialNodes?: MathNode[],
): MathDocument {
  const nextBlocks: MathBlock[] = [];

  for (const block of document.blocks) {
    nextBlocks.push(block);
    if (block.id === afterBlockId) {
      nextBlocks.push(createEquationBlock(initialNodes));
    }
  }

  return { ...document, blocks: nextBlocks };
}

export function updateTextBlock(document: MathDocument, blockId: string, text: string): MathDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id !== blockId || block.type !== "text") {
        return block;
      }

      return { ...block, text };
    }),
  };
}
