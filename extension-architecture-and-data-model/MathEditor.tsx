import { forwardRef, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from "react";
import {
  createEquationBlock,
  createTextBlock,
  getOrderedSlots,
  getPrimarySlotId,
  parseMathDocument,
  removeBlock,
  removeNode,
  replaceNodeWith,
  serializeMathDocument,
  setSlotText,
  updateTextBlock,
  type MathBlock,
  type MathDocument,
  type MathEditorMode,
  type MathNode,
  type MathSlot,
} from "./MathAST";
import { renderMathNodeAsText } from "../astToDocs";
import { applyTextMacroOnSpace, resolveMathMacro } from "./MacroEngine";
import { ManualToolbar, type ManualAction } from "./ManualToolbar";
import {
  BASE_MATH_ACTIONS,
  createNodeForActionId,
  createTemplateBlocks,
  getTokenForActionId,
  MATH_TEMPLATES,
  PHYSICS_ACTIONS,
  PHYSICS_TEMPLATES,
} from "./mathEditorTemplates";
import {
  insertBlockAfter,
  insertTextAtEditableCursor,
  isCaretAtBoundary,
  placeCaretAtEnd,
  setCaretOffsetInElement,
} from "./mathEditorDom";
import type { EquationBlock } from "./MathAST";

interface MathEditorProps {
  value: string;
  mode?: MathEditorMode;
  onChange: (nextSerializedValue: string) => void;
}

export interface MathEditorHandle {
  insertTokenAtCursor: (token: string) => void;
}

type PendingFocus = { type: "slot"; slotId: string } | { type: "text"; blockId: string } | null;

type ActiveEditorState =
  | { type: "slot"; blockId: string; nodeId: string; slotKey: string; slotId: string }
  | { type: "text"; blockId: string }
  | null;

interface MathEditorState {
  document: MathDocument;
  undoStack: MathDocument[];
  redoStack: MathDocument[];
}

type MathEditorAction =
  | { type: "edit"; update: (document: MathDocument) => MathDocument }
  | { type: "replace"; document: MathDocument }
  | { type: "undo" }
  | { type: "redo" };

function mathEditorReducer(state: MathEditorState, action: MathEditorAction): MathEditorState {
  if (action.type === "replace") {
    return { document: action.document, undoStack: [], redoStack: [] };
  }
  if (action.type === "undo") {
    const previous = state.undoStack[state.undoStack.length - 1];
    if (!previous) return state;
    return {
      document: previous,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.document],
    };
  }
  if (action.type === "redo") {
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next) return state;
    return {
      document: next,
      undoStack: [...state.undoStack, state.document].slice(-50),
      redoStack: state.redoStack.slice(0, -1),
    };
  }
  const document = action.update(state.document);
  if (document === state.document) return state;
  return {
    document,
    undoStack: [...state.undoStack, state.document].slice(-50),
    redoStack: [],
  };
}

function getClosestSlot(
  block: EquationBlock,
  activeSlotId: string,
  direction: "up" | "down" | "left" | "right",
  slotRefs: Record<string, HTMLSpanElement | null>,
): HTMLSpanElement | null {
  const currentElement = slotRefs[activeSlotId];
  const currentRect = currentElement?.getBoundingClientRect();
  if (!currentRect) return null;
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  let best: { element: HTMLSpanElement; score: number } | null = null;

  for (const pointer of getOrderedSlots(block)) {
    if (pointer.slotId === activeSlotId) continue;
    const element = slotRefs[pointer.slotId];
    const rect = element?.getBoundingClientRect();
    if (!element || !rect) continue;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const primary =
      direction === "up"
        ? currentY - y
        : direction === "down"
          ? y - currentY
          : direction === "left"
            ? currentX - x
            : x - currentX;
    if (primary <= 1) continue;
    const secondary = direction === "up" || direction === "down" ? Math.abs(x - currentX) : Math.abs(y - currentY);
    const score = primary + secondary * 1.6;
    if (!best || score < best.score) best = { element, score };
  }
  return best?.element ?? null;
}

export const MathEditor = forwardRef<MathEditorHandle, MathEditorProps>(function MathEditor(
  { value, mode = "math", onChange },
  ref,
) {
  const [editorState, dispatch] = useReducer(mathEditorReducer, value, (initialValue) => ({
    document: parseMathDocument(initialValue),
    undoStack: [],
    redoStack: [],
  }));
  const [previewMode, setPreviewMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const documentState = editorState.document;

  const slotRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const pendingFocusRef = useRef<PendingFocus>(null);
  const activeEditorRef = useRef<ActiveEditorState>(null);
  const lastExternalValueRef = useRef(value);

  const serializedDocument = useMemo(() => serializeMathDocument(documentState), [documentState]);
  const toolbarActions: ManualAction[] = mode === "physics" ? PHYSICS_ACTIONS : BASE_MATH_ACTIONS;
  const templates = mode === "physics" ? PHYSICS_TEMPLATES : MATH_TEMPLATES;
  const templateGroups = useMemo(
    () =>
      Array.from(new Set(templates.map((template) => template.topic))).map((topic) => ({
        topic,
        templates: templates.filter((template) => template.topic === topic),
      })),
    [templates],
  );

  useEffect(() => {
    if (value === lastExternalValueRef.current) {
      return;
    }

    lastExternalValueRef.current = value;
    const parsed = parseMathDocument(value);
    if (serializeMathDocument(parsed) !== serializedDocument) {
      dispatch({ type: "replace", document: parsed });
    }
  }, [value, serializedDocument]);

  useEffect(() => {
    if (serializedDocument !== value) {
      onChange(serializedDocument);
    }
  }, [serializedDocument, value, onChange]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) {
      return;
    }

    if (pending.type === "slot") {
      const target = slotRefs.current[pending.slotId];
      if (target) {
        target.focus();
        placeCaretAtEnd(target);
      }
    }

    if (pending.type === "text") {
      const target = textRefs.current[pending.blockId];
      if (target) {
        target.focus();
        const cursor = target.value.length;
        target.setSelectionRange(cursor, cursor);
      }
    }

    pendingFocusRef.current = null;
  }, [documentState]);

  const insertAtActiveCursor = (token: string) => {
    const activeEditor = activeEditorRef.current;
    if (!activeEditor) {
      return;
    }

    if (activeEditor.type === "text") {
      const textarea = textRefs.current[activeEditor.blockId];
      if (!textarea) {
        return;
      }

      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const nextText = `${textarea.value.slice(0, start)}${token}${textarea.value.slice(end)}`;
      const nextCursor = start + token.length;

      dispatch({ type: "edit", update: (current) => updateTextBlock(current, activeEditor.blockId, nextText) });
      window.requestAnimationFrame(() => {
        const target = textRefs.current[activeEditor.blockId];
        if (!target) {
          return;
        }
        target.focus();
        target.setSelectionRange(nextCursor, nextCursor);
      });
      return;
    }

    const slotElement = slotRefs.current[activeEditor.slotId];
    if (!slotElement) {
      return;
    }

    const { nextText, nextCaret } = insertTextAtEditableCursor(slotElement, token);
    dispatch({
      type: "edit",
      update: (current) =>
        setSlotText(current, activeEditor.blockId, activeEditor.nodeId, activeEditor.slotKey, nextText),
    });

    window.requestAnimationFrame(() => {
      const target = slotRefs.current[activeEditor.slotId];
      if (!target) {
        return;
      }
      target.focus();
      setCaretOffsetInElement(target, nextCaret);
    });
  };

  useImperativeHandle(ref, () => ({
    insertTokenAtCursor: insertAtActiveCursor,
  }));

  const moveSlotFocus = (block: EquationBlock, activeSlotId: string, direction: "next" | "previous") => {
    const slots = getOrderedSlots(block);
    const index = slots.findIndex((slot) => slot.slotId === activeSlotId);
    if (index < 0) {
      return;
    }

    const target = slots[direction === "next" ? index + 1 : index - 1];
    if (!target) {
      return;
    }

    const targetElement = slotRefs.current[target.slotId];
    if (targetElement) {
      targetElement.focus();
      placeCaretAtEnd(targetElement);
    }
  };

  const handleTextBlockKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, block: MathBlock) => {
    if (block.type !== "text") {
      return;
    }

    if (mode === "physics" && event.key === " ") {
      const target = event.currentTarget;
      const result = applyTextMacroOnSpace({
        mode: "physics",
        text: target.value,
        caretIndex: target.selectionStart ?? target.value.length,
      });
      if (result.applied) {
        event.preventDefault();
        dispatch({ type: "edit", update: (current) => updateTextBlock(current, block.id, result.nextText) });
        window.requestAnimationFrame(() => {
          const freshTarget = textRefs.current[block.id];
          freshTarget?.focus();
          freshTarget?.setSelectionRange(result.nextCaret, result.nextCaret);
        });
        return;
      }
    }

    if (event.ctrlKey && (event.key === "m" || event.key === "M")) {
      event.preventDefault();
      const equationBlock = createEquationBlock();
      pendingFocusRef.current = { type: "slot", slotId: getPrimarySlotId(equationBlock.nodes[0]) };
      dispatch({
        type: "edit",
        update: (current) => ({ ...current, blocks: insertBlockAfter(current.blocks, block.id, equationBlock) }),
      });
    }
  };

  const handleSlotMacro = (
    blockId: string,
    node: MathNode,
    slotKey: string,
    event: React.KeyboardEvent<HTMLSpanElement>,
  ): boolean => {
    if (event.key !== " " || node.type !== "atom" || slotKey !== "value") {
      return false;
    }

    const macroNode = resolveMathMacro(node.value.text.trim(), mode);
    if (!macroNode) {
      return false;
    }

    event.preventDefault();
    pendingFocusRef.current = { type: "slot", slotId: getPrimarySlotId(macroNode) };
    dispatch({ type: "edit", update: (current) => replaceNodeWith(current, blockId, node.id, macroNode) });
    return true;
  };

  const handleSlotKeyDown = (
    event: React.KeyboardEvent<HTMLSpanElement>,
    blockId: string,
    block: EquationBlock,
    node: MathNode,
    slot: MathSlot,
    slotKey: string,
  ) => {
    if (handleSlotMacro(blockId, node, slotKey, event)) {
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      moveSlotFocus(block, slot.id, event.shiftKey ? "previous" : "next");
      return;
    }

    if (event.key === "ArrowRight" && isCaretAtBoundary(event.currentTarget, "end")) {
      event.preventDefault();
      moveSlotFocus(block, slot.id, "next");
      return;
    }

    if (event.key === "ArrowLeft" && isCaretAtBoundary(event.currentTarget, "start")) {
      event.preventDefault();
      moveSlotFocus(block, slot.id, "previous");
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const target = getClosestSlot(block, slot.id, event.key === "ArrowUp" ? "up" : "down", slotRefs.current);
      if (target) {
        event.preventDefault();
        target.focus();
        placeCaretAtEnd(target);
      }
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const target = getClosestSlot(block, slot.id, event.key === "ArrowLeft" ? "left" : "right", slotRefs.current);
      if (target && isCaretAtBoundary(event.currentTarget, event.key === "ArrowLeft" ? "start" : "end")) {
        event.preventDefault();
        target.focus();
        placeCaretAtEnd(target);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!event.shiftKey) {
        const slots = getOrderedSlots(block);
        const index = slots.findIndex((item) => item.slotId === slot.id);
        const nextSlot = slots[index + 1];
        const nextElement = nextSlot ? slotRefs.current[nextSlot.slotId] : null;
        if (nextElement) {
          nextElement.focus();
          placeCaretAtEnd(nextElement);
          return;
        }
      }
      const textBlock = createTextBlock("");
      pendingFocusRef.current = { type: "text", blockId: textBlock.id };
      dispatch({
        type: "edit",
        update: (current) => ({ ...current, blocks: insertBlockAfter(current.blocks, blockId, textBlock) }),
      });
    }
  };

  const renderSlot = (blockId: string, block: EquationBlock, node: MathNode, slotKey: string, slot: MathSlot) => {
    if (previewMode) {
      return <span className="math-preview-slot">{slot.text || <span className="math-empty-slot">□</span>}</span>;
    }
    return (
      <span
        ref={(element) => {
          slotRefs.current[slot.id] = element;
        }}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(event) => {
          const text = event.currentTarget.textContent ?? "";
          dispatch({ type: "edit", update: (current) => setSlotText(current, blockId, node.id, slotKey, text) });
        }}
        onFocus={() => {
          activeEditorRef.current = { type: "slot", blockId, nodeId: node.id, slotKey, slotId: slot.id };
        }}
        onKeyDown={(event) => handleSlotKeyDown(event, blockId, block, node, slot, slotKey)}
        className="math-edit-slot"
        aria-label={slotKey}
      >
        {slot.text}
      </span>
    );
  };

  const renderNode = (block: EquationBlock, node: MathNode) => {
    let expression;
    if (node.type === "atom") {
      expression = renderSlot(block.id, block, node, "value", node.value);
    } else if (node.type === "fraction") {
      expression = (
        <span className="math-fraction">
          {renderSlot(block.id, block, node, "numerator", node.numerator)}
          <span className="math-fraction-rule" />
          {renderSlot(block.id, block, node, "denominator", node.denominator)}
        </span>
      );
    } else if (node.type === "derivative") {
      expression = (
        <span className="math-derivative">
          <span className="math-fraction">
            <span>d</span>
            <span className="math-fraction-rule" />
            <span>d{renderSlot(block.id, block, node, "variable", node.variable)}</span>
          </span>
          <span>(</span>
          {renderSlot(block.id, block, node, "expression", node.expression)}
          <span>)</span>
        </span>
      );
    } else if (node.type === "vector") {
      expression = <span className="math-vector">{renderSlot(block.id, block, node, "symbol", node.symbol)}</span>;
    } else if (node.type === "limit") {
      expression = (
        <span className="math-limit">
          <span>lim</span>
          <sub>{renderSlot(block.id, block, node, "approach", node.approach)}</sub>
          {renderSlot(block.id, block, node, "expression", node.expression)}
        </span>
      );
    } else if (node.type === "integral") {
      expression = (
        <span className="math-integral">
          <span className="math-integral-bounds">
            <span>{renderSlot(block.id, block, node, "upperBound", node.upperBound)}</span>
            <span>∫</span>
            <span>{renderSlot(block.id, block, node, "lowerBound", node.lowerBound)}</span>
          </span>
          {renderSlot(block.id, block, node, "integrand", node.integrand)}
          {renderSlot(block.id, block, node, "variable", node.variable)}
        </span>
      );
    } else if (node.type === "power") {
      expression = (
        <span>
          {renderSlot(block.id, block, node, "base", node.base)}
          <sup>{renderSlot(block.id, block, node, "exponent", node.exponent)}</sup>
        </span>
      );
    } else if (node.type === "subscript") {
      expression = (
        <span>
          {renderSlot(block.id, block, node, "base", node.base)}
          <sub>{renderSlot(block.id, block, node, "index", node.index)}</sub>
        </span>
      );
    } else if (node.type === "root") {
      expression = (
        <span className="math-root">
          <span>√</span>
          <span>{renderSlot(block.id, block, node, "radicand", node.radicand)}</span>
        </span>
      );
    } else {
      expression = (
        <span className="math-group">
          <span>(</span>
          {renderSlot(block.id, block, node, "expression", node.expression)}
          <span>)</span>
        </span>
      );
    }

    return (
      <span key={node.id} className="math-node">
        {expression}
        {!previewMode && (
          <button
            type="button"
            className="math-delete-node"
            aria-label="Delete this equation structure"
            title="Delete this structure"
            onClick={() => dispatch({ type: "edit", update: (current) => removeNode(current, block.id, node.id) })}
          >
            ×
          </button>
        )}
      </span>
    );
  };

  const insertMathNode = (node: MathNode) => {
    const active = activeEditorRef.current;
    let insertedNode = node;
    if (active?.type === "slot") {
      const equation = documentState.blocks.find((block) => block.id === active.blockId);
      const activeNode =
        equation?.type === "equation" ? equation.nodes.find((item) => item.id === active.nodeId) : undefined;
      if (activeNode?.type === "atom" && active.slotKey === "value") {
        const existingText = activeNode.value.text;
        if (node.type === "fraction") insertedNode = { ...node, numerator: { ...node.numerator, text: existingText } };
        else if (node.type === "derivative")
          insertedNode = { ...node, expression: { ...node.expression, text: existingText } };
        else if (node.type === "vector") insertedNode = { ...node, symbol: { ...node.symbol, text: existingText } };
        else if (node.type === "limit")
          insertedNode = { ...node, expression: { ...node.expression, text: existingText } };
        else if (node.type === "integral")
          insertedNode = { ...node, integrand: { ...node.integrand, text: existingText } };
        else if (node.type === "power" || node.type === "subscript")
          insertedNode = { ...node, base: { ...node.base, text: existingText } };
        else if (node.type === "root") insertedNode = { ...node, radicand: { ...node.radicand, text: existingText } };
        else if (node.type === "group")
          insertedNode = { ...node, expression: { ...node.expression, text: existingText } };
      }
    }
    setPreviewMode(false);
    pendingFocusRef.current = { type: "slot", slotId: getPrimarySlotId(insertedNode) };
    dispatch({
      type: "edit",
      update: (current) => {
        if (active?.type === "slot") {
          const equation = current.blocks.find((block) => block.id === active.blockId);
          if (equation?.type === "equation") {
            const activeNode = equation.nodes.find((item) => item.id === active.nodeId);
            if (activeNode?.type === "atom" && active.slotKey === "value") {
              return replaceNodeWith(current, active.blockId, active.nodeId, insertedNode);
            }
            return {
              ...current,
              blocks: current.blocks.map((blockItem) => {
                if (blockItem.id !== active.blockId || blockItem.type !== "equation") return blockItem;
                const nodes = [...blockItem.nodes];
                const index = nodes.findIndex((item) => item.id === active.nodeId);
                nodes.splice(index < 0 ? nodes.length : index + 1, 0, insertedNode);
                return { ...blockItem, nodes };
              }),
            };
          }
        }
        const equationBlock = createEquationBlock([insertedNode]);
        if (active?.type === "text") {
          return { ...current, blocks: insertBlockAfter(current.blocks, active.blockId, equationBlock) };
        }
        return { ...current, blocks: [...current.blocks, equationBlock] };
      },
    });
  };

  const insertTemplate = (templateId: string) => {
    const active = activeEditorRef.current;
    const blocks = createTemplateBlocks(templateId);
    if (blocks.length === 0) return;
    setPreviewMode(false);
    const firstSlot = getOrderedSlots(blocks[0])[0];
    pendingFocusRef.current = firstSlot ? { type: "slot", slotId: firstSlot.slotId } : null;
    dispatch({
      type: "edit",
      update: (current) => {
        const activeBlockId = active?.blockId;
        const blockIndex = activeBlockId ? current.blocks.findIndex((block) => block.id === activeBlockId) : -1;
        const nextBlocks = [...current.blocks];
        nextBlocks.splice(blockIndex >= 0 ? blockIndex + 1 : nextBlocks.length, 0, ...blocks);
        return { ...current, blocks: nextBlocks };
      },
    });
  };

  const copyEquation = async (block: EquationBlock) => {
    const equationText = block.nodes.map(renderMathNodeAsText).join("");
    try {
      await navigator.clipboard.writeText(equationText);
      setCopyStatus("Equation copied.");
    } catch (error) {
      setCopyStatus(
        `Could not copy equation: ${error instanceof Error ? error.message : "Clipboard access unavailable."}`,
      );
    }
  };

  const copyAllContent = async () => {
    const text = documentState.blocks
      .map((block) => (block.type === "text" ? block.text : block.nodes.map(renderMathNodeAsText).join("")))
      .filter(Boolean)
      .join("\n");
    if (!text) {
      setCopyStatus("There is nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("All notes and equations copied.");
    } catch (error) {
      setCopyStatus(
        `Could not copy notes: ${error instanceof Error ? error.message : "Clipboard access unavailable."}`,
      );
    }
  };

  return (
    <div
      className={`math-editor ${mode === "physics" ? "physics-editor" : "maths-editor"} ${previewMode ? "math-editor-preview" : ""}`}
      onKeyDownCapture={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? "redo" : "undo" });
        } else if (key === "y") {
          event.preventDefault();
          dispatch({ type: "redo" });
        }
      }}
    >
      <div className="math-editor-controls">
        <button
          type="button"
          onClick={() => dispatch({ type: "undo" })}
          disabled={editorState.undoStack.length === 0}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "redo" })}
          disabled={editorState.redoStack.length === 0}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
        <button type="button" onClick={() => void copyAllContent()}>
          Copy all
        </button>
        <span className="math-editor-control-spacer" />
        <span className="math-copy-status" role="status" aria-live="polite">
          {copyStatus}
        </span>
        <button type="button" className="math-preview-toggle" onClick={() => setPreviewMode((current) => !current)}>
          {previewMode ? "Edit equations" : "Preview"}
        </button>
      </div>
      <div className={`math-template-panel ${mode === "physics" ? "physics-template-panel" : "maths-template-panel"}`}>
        <strong>
          {mode === "physics"
            ? "2º Bachillerato Physics · formula templates"
            : "2º Bachillerato Mathematics · topic templates"}
        </strong>
        {templateGroups.map((group) => (
          <section key={group.topic} className="math-template-topic">
            <h4>{group.topic}</h4>
            <div className="math-template-grid">
              {group.templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="math-template-button"
                  onClick={() => insertTemplate(template.id)}
                >
                  <span>{template.label}</span>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ManualToolbar
        title={mode === "physics" ? "Physics symbols and structures" : "Math symbols and structures"}
        actions={toolbarActions}
        defaultCollapsed={false}
        onAction={(action) => {
          const token = getTokenForActionId(action.id);
          if (token) {
            insertAtActiveCursor(token);
            return;
          }
          const node = createNodeForActionId(action.id);
          if (node) insertMathNode(node);
        }}
      />

      <p className="math-editor-hint">
        {mode === "physics"
          ? "Start from the topic formula, then substitute values with units. Keep units in every working step and check the final unit."
          : "Use the topic groups for algebra, calculus, geometry and probability. Show your working between steps; use the structure buttons when you need formatted maths."}{" "}
        Use arrows or Tab to move between fields; Enter advances and Shift+Enter adds a note line.
      </p>

      {documentState.blocks.map((block) => {
        if (block.type === "text") {
          if (previewMode)
            return (
              <p key={block.id} className="math-preview-text">
                {block.text}
              </p>
            );
          return (
            <textarea
              key={block.id}
              ref={(element) => {
                textRefs.current[block.id] = element;
              }}
              value={block.text}
              onChange={(event) =>
                dispatch({ type: "edit", update: (current) => updateTextBlock(current, block.id, event.target.value) })
              }
              onFocus={() => {
                activeEditorRef.current = { type: "text", blockId: block.id };
              }}
              onKeyDown={(event) => handleTextBlockKeyDown(event, block)}
              placeholder={
                mode === "physics"
                  ? "Write the known values, units, diagram notes, and working for the problem..."
                  : "Write the question, define variables, and show your working..."
              }
              className="math-editor-text"
            />
          );
        }

        return (
          <div key={block.id} className="math-equation-block">
            {!previewMode && (
              <button
                type="button"
                className="math-delete-equation"
                aria-label="Delete equation"
                title="Delete equation"
                onClick={() => dispatch({ type: "edit", update: (current) => removeBlock(current, block.id) })}
              >
                ×
              </button>
            )}
            <button type="button" className="math-copy-equation" onClick={() => void copyEquation(block)}>
              Copy
            </button>
            <div className="math-equation-expression">{block.nodes.map((node) => renderNode(block, node))}</div>
          </div>
        );
      })}
    </div>
  );
});
