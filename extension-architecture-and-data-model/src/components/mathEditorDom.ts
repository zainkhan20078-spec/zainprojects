import type { MathBlock } from "./MathAST";

export function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isCaretAtBoundary(element: HTMLElement, boundary: "start" | "end"): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !range.collapsed) {
    return false;
  }

  const text = element.textContent ?? "";
  const probe = range.cloneRange();
  probe.selectNodeContents(element);
  probe.setEnd(range.startContainer, range.startOffset);
  const leftLength = probe.toString().length;

  return boundary === "start" ? leftLength === 0 : leftLength === text.length;
}

export function getCaretOffsetInElement(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return element.textContent?.length ?? 0;
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return element.textContent?.length ?? 0;
  }

  const probe = range.cloneRange();
  probe.selectNodeContents(element);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

export function setCaretOffsetInElement(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const safeOffset = Math.max(0, offset);
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let visited = 0;
  let node = walker.nextNode();
  let found = false;

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (visited + length >= safeOffset) {
      range.setStart(node, safeOffset - visited);
      found = true;
      break;
    }
    visited += length;
    node = walker.nextNode();
  }

  if (!found) {
    range.selectNodeContents(element);
    range.collapse(false);
  } else {
    range.collapse(true);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertTextAtEditableCursor(
  element: HTMLElement,
  token: string,
): { nextText: string; nextCaret: number } {
  const text = element.textContent ?? "";
  const start = getCaretOffsetInElement(element);
  const nextText = `${text.slice(0, start)}${token}${text.slice(start)}`;
  return { nextText, nextCaret: start + token.length };
}

export function insertBlockAfter(blocks: MathBlock[], afterBlockId: string, nextBlock: MathBlock): MathBlock[] {
  const next: MathBlock[] = [];
  for (const block of blocks) {
    next.push(block);
    if (block.id === afterBlockId) {
      next.push(nextBlock);
    }
  }
  return next;
}
