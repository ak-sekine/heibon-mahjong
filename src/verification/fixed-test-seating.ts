import type { GameController } from '../ui/controller.ts';

/** Keep synthetic verification positions aligned with their named game seats. */
export function useFixedTestSeating(controller: GameController): void {
  (controller as unknown as { random: () => number }).random = () => 0.999999;
}
