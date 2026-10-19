/** Accessible header menu for the shared local and online controls. */
export class MainMenu {
  private readonly shell = document.querySelector<HTMLElement>('.main-menu-shell')!;
  private readonly toggle = document.querySelector<HTMLButtonElement>('#main-menu-toggle')!;
  private readonly menu = document.querySelector<HTMLElement>('#main-menu-items')!;

  constructor() {
    this.toggle.addEventListener('click', () => {
      if (this.menu.hidden) this.open();
      else this.close();
    });
    this.menu.addEventListener('click', event => {
      if ((event.target as Element).closest('button')) this.close(false);
    });
    document.addEventListener('pointerdown', event => {
      if (!this.shell.contains(event.target as Node)) this.close(false);
    });
    document.addEventListener('keydown', event => {
      if (this.menu.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      const items = this.items();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (!items.length || index < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1].focus();
      }
    });
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)'));
  }

  private open(): void {
    this.menu.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-label', 'メニューを閉じる');
    this.items()[0]?.focus({ preventScroll: true });
  }

  private close(restoreFocus = true): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.setAttribute('aria-label', 'メニューを開く');
    if (restoreFocus) this.toggle.focus({ preventScroll: true });
  }
}
