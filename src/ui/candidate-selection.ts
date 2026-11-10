import { createTileElement, tileLabel } from '../rendering/tile-svg.ts';
import { tileKindKey, type Tile } from '../model/tile.ts';

export type CandidateOperation = 'pon' | 'chi' | 'daiminkan' | 'ankan' | 'kakan';
export type CandidateTile = Readonly<{ id: string; tile: Tile }>;
export type CandidateOption = Readonly<{
  id: string;
  label: string;
  operationType?: CandidateOperation;
  tiles: readonly CandidateTile[];
  accessibleLabel?: string;
  enabled: boolean;
}>;

export type CandidateSelectionChoice = Readonly<{
  id: string;
  operationType: CandidateOperation;
  candidateId: string;
  button: HTMLButtonElement | null;
}>;

export type SingleCandidateBehavior = 'show' | 'select';

/** The single candidate screen shared by calls and self-turn kans. */
export class CandidateSelection {
  private options: readonly CandidateOption[] = [];
  private operation: CandidateOperation | null = null;
  private busy = false;
  private selectionPending = false;
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly onSelect: (choice: CandidateSelectionChoice) => void;
  private optionByButton = new WeakMap<HTMLButtonElement, CandidateOption>();

  constructor(
    root: HTMLElement,
    list: HTMLElement,
    onSelect: (choice: CandidateSelectionChoice) => void,
  ) {
    this.root = root;
    this.list = list;
    this.onSelect = onSelect;
  }

  show(
    options: readonly CandidateOption[],
    operation: CandidateOperation,
    busy: boolean,
    singleCandidate: SingleCandidateBehavior = 'show',
  ): void {
    this.options = options;
    this.operation = operation;
    this.busy = busy;
    if (!busy) this.selectionPending = false;
    if (singleCandidate === 'select' && options.length === 1 && options[0]!.enabled && !busy) {
      this.commit(options[0]!, 0, null, operationFor(options[0]!) ?? operation);
      return;
    }
    this.renderButtons();
  }

  hide(): void {
    this.options = [];
    this.operation = null;
    this.busy = false;
    this.selectionPending = false;
    this.root.removeAttribute('aria-busy');
    this.list.replaceChildren();
    delete this.list.dataset.signature;
  }

  focusFirst(scrollPosition?: Readonly<{ x: number; y: number }>): void {
    const candidate = this.list.querySelector<HTMLButtonElement>('button[data-action-choice]:not(:disabled)');
    if (candidate) this.focusWithoutPageScroll(candidate, scrollPosition);
    else this.focusWithoutPageScroll(this.root, scrollPosition);
  }

  get operationType(): CandidateOperation | null { return this.operation; }
  get candidateCount(): number { return this.options.length; }
  get pending(): boolean { return this.selectionPending; }

  select(button: HTMLButtonElement): boolean {
    if (!this.root.contains(button) || button.disabled || this.selectionPending) return false;
    const option = this.optionByButton.get(button);
    const operationType = option && operationFor(option);
    if (!option?.enabled || !operationType) return false;
    this.commit(option, this.options.indexOf(option), button, operationType);
    return true;
  }

  private commit(option: CandidateOption, index: number, button: HTMLButtonElement | null, operationType: CandidateOperation): void {
    this.selectionPending = true;
    for (const candidate of Array.from(this.list.querySelectorAll<HTMLButtonElement>('button[data-action-choice]'))) {
      candidate.disabled = true;
      candidate.setAttribute('aria-busy', 'true');
    }
    this.root.setAttribute('aria-busy', 'true');
    this.onSelect({ id: option.id, operationType, candidateId: `${operationType}-${index + 1}`, button });
  }

  private focusWithoutPageScroll(target: HTMLElement, scrollPosition?: Readonly<{ x: number; y: number }>): void {
    if (typeof window === 'undefined') {
      target.focus();
      return;
    }
    const scrollX = scrollPosition?.x ?? window.scrollX;
    const scrollY = scrollPosition?.y ?? window.scrollY;
    const restoreScroll = () => window.scrollTo(scrollX, scrollY);
    target.focus({ preventScroll: true });
    // Some WebKit versions still adjust the document when focusing a fixed
    // candidate panel. Restore immediately and again before the next paint in
    // case its focus scroll is deferred until layout has completed.
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  }

  private renderButtons(): void {
    const operation = this.operation;
    if (!operation) return;
    const signature = JSON.stringify([
      operation, this.busy, this.selectionPending,
      this.options.map((option, index) => [
        `${operationFor(option) ?? operation}-${index + 1}`, option.label, option.accessibleLabel ?? '', option.enabled,
        option.tiles.map(tile => [tileKindKey(tile.tile), tile.tile.isRed]),
      ]),
    ]);
    if (this.list.dataset.signature === signature) return;
    this.list.dataset.signature = signature;
    this.optionByButton = new WeakMap();
    this.list.replaceChildren(...this.options.map((option, index) => {
      const operationType = operationFor(option) ?? operation;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate-option-button ui-button ui-button--a';
      button.dataset.actionChoice = operationType === 'pon' || operationType === 'chi' || operationType === 'daiminkan' ? 'call' : 'kan';
      button.dataset.candidateId = `${operationType}-${index + 1}`;
      button.dataset.diagnosticActionType = operationType;
      button.disabled = !option.enabled || this.busy || this.selectionPending;
      if (this.busy || this.selectionPending) button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-label', option.accessibleLabel ?? `${operationName(operationType)}：${option.tiles.map(tile => tileLabel(tile.tile)).join('・')}`);
      for (const tile of option.tiles) {
        const face = createTileElement(tile.tile);
        face.setAttribute('aria-hidden', 'true');
        button.append(face);
      }
      this.optionByButton.set(button, option);
      return button;
    }));
  }
}

export function operationFor(option: CandidateOption): CandidateOperation | null {
  if (option.operationType) return option.operationType;
  switch (option.label) {
    case 'ポン': return 'pon';
    case 'チー': return 'chi';
    case '大明カン': return 'daiminkan';
    case '暗カン': return 'ankan';
    case '加カン': return 'kakan';
    default: return null;
  }
}

function operationName(operation: CandidateOperation): string {
  switch (operation) {
    case 'pon': return 'ポン';
    case 'chi': return 'チー';
    case 'daiminkan': return '大明カン';
    case 'ankan': return '暗カン';
    case 'kakan': return '加カン';
  }
}
