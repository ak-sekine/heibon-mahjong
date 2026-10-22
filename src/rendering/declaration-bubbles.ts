import type { DeclarationKind } from '../model/declaration.ts';
import type { RiverPosition } from './river-layout.ts';

export const DECLARATION_BUBBLE_DURATION_MS = 2000;

const LABELS: Readonly<Record<DeclarationKind, string>> = {
  riichi: 'リーチ',
  pon: 'ポン',
  kan: 'カン',
  chi: 'チー',
  ron: 'ロン',
};

export function declarationLabel(kind: DeclarationKind): string { return LABELS[kind]; }

export type BubbleRect = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type BubbleSize = Readonly<{ width: number; height: number }>;
export type BubblePoint = Readonly<{ left: number; top: number }>;

/** Place a bubble beside its river, clamped inside the table at every viewport size. */
export function calculateDeclarationBubblePoint(
  table: BubbleRect,
  river: BubbleRect,
  bubble: BubbleSize,
  position: RiverPosition,
  gap = 5,
  inset = 16,
): BubblePoint {
  let left: number;
  let top: number;
  switch (position) {
    case 'bottom':
      left = river.right - table.left + gap;
      top = river.top - table.top + ((river.bottom - river.top) - bubble.height) / 2;
      break;
    case 'top':
      left = river.left - table.left - bubble.width - gap;
      top = river.top - table.top + ((river.bottom - river.top) - bubble.height) / 2;
      break;
    case 'right':
      left = river.left - table.left + ((river.right - river.left) - bubble.width) / 2;
      top = river.top - table.top - bubble.height - gap;
      break;
    case 'left':
      left = river.left - table.left + ((river.right - river.left) - bubble.width) / 2;
      top = river.bottom - table.top + gap;
      break;
  }
  const maxLeft = Math.max(inset, table.right - table.left - bubble.width - inset);
  const maxTop = Math.max(inset, table.bottom - table.top - bubble.height - inset);
  return {
    left: Math.min(maxLeft, Math.max(inset, left)),
    top: Math.min(maxTop, Math.max(inset, top)),
  };
}

type ActiveBubble = { node: HTMLDivElement; river: HTMLElement; position: RiverPosition; timer: number };

/** A non-interactive overlay shared by the local and online tables. */
export class DeclarationBubbleRenderer {
  private readonly active = new Map<number, ActiveBubble>();
  private readonly table: HTMLElement;

  constructor(table: HTMLElement) {
    this.table = table;
    window.addEventListener('resize', this.repositionAll);
  }

  private readonly repositionAll = (): void => {
    for (const bubble of this.active.values()) this.position(bubble.node, bubble.river, bubble.position);
  };

  private position(node: HTMLDivElement, river: HTMLElement, position: RiverPosition): void {
    const point = calculateDeclarationBubblePoint(
      this.table.getBoundingClientRect(),
      river.getBoundingClientRect(),
      { width: node.offsetWidth, height: node.offsetHeight },
      position,
    );
    node.style.left = `${point.left}px`;
    node.style.top = `${point.top}px`;
  }

  show(
    seat: number,
    kind: DeclarationKind,
    position: RiverPosition,
    river: HTMLElement,
    durationMs = DECLARATION_BUBBLE_DURATION_MS,
  ): void {
    this.clear(seat);
    if (durationMs <= 0) return;

    const node = document.createElement('div');
    node.className = `declaration-bubble declaration-bubble-${position}`;
    node.dataset.seat = String(seat);
    node.dataset.declaration = kind;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    node.textContent = declarationLabel(kind);
    this.table.append(node);
    this.position(node, river, position);

    const timer = window.setTimeout(() => this.clear(seat), durationMs);
    this.active.set(seat, { node, river, position, timer });
  }

  clear(seat: number): void {
    const bubble = this.active.get(seat);
    if (!bubble) return;
    window.clearTimeout(bubble.timer);
    bubble.node.remove();
    this.active.delete(seat);
  }

  clearAll(): void {
    for (const seat of this.active.keys()) this.clear(seat);
  }
}
