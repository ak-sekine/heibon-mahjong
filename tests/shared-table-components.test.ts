import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSeatLabel, renderTableRoundInfo, type SeatLabelView } from '../src/rendering/shared-table-components.ts';
import type { SeatWind } from '../src/model/game.ts';

class ElementStub {
  readonly tagName: string;
  constructor(tagName = '') { this.tagName = tagName; }
  parentElement: ElementStub | null = null;
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  textContent = '';
  title = '';
  classList = { contains: (name: string) => this.className.split(/\s+/).includes(name) };
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...children: ElementStub[]) {
    for (const child of children) {
      if (child.parentElement) {
        const index = child.parentElement.children.indexOf(child);
        if (index >= 0) child.parentElement.children.splice(index, 1);
      }
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children: ElementStub[]) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
}

const WINDS: readonly SeatWind[] = ['east', 'south', 'west', 'north'];
const POSITIONS = ['bottom', 'right', 'top', 'left'] as const;
const NAMES = ['テストホスト123456789012345678', 'テスト参加者', 'CPU1', 'CPU2'] as const;

function withStrip(run: (strip: ElementStub, labels: ReadonlyMap<string, ElementStub>) => void): void {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag: string) => new ElementStub(tag) } as unknown as Document;
  try {
    const strip = new ElementStub('div');
    strip.className = 'score-strip';
    const labels = new Map(POSITIONS.map(position => [position, new ElementStub('p')]));
    // Match the static template's position order; rendering supplies the
    // viewer-relative order independently of these positions.
    strip.append(labels.get('top')!, labels.get('right')!, labels.get('bottom')!, labels.get('left')!);
    for (const [position, label] of labels) label.dataset.seatPosition = position;
    run(strip, labels);
  } finally {
    globalThis.document = original;
  }
}

test('shared seat rows show only name, wind/dealer, and right-ready points in viewer-relative order', () => {
  assert.equal(NAMES[0].length, 24);
  for (const viewerSeat of [0, 2]) withStrip((strip, labels) => {
    const points = [17000, 41000, 21000, 21000];
    const orderBySeat = (seat: number) => (seat - viewerSeat + 4) % 4;
    for (let seat = 0; seat < 4; seat++) {
      const position = POSITIONS[orderBySeat(seat)];
      const label = labels.get(position)!;
      const view: SeatLabelView = {
        name: NAMES[seat],
        wind: WINDS[seat],
        points: points[seat],
        isDealer: seat === 0,
        isSelf: seat === viewerSeat,
        isActive: seat === 3,
        displayOrder: orderBySeat(seat),
        isRiichi: seat === 1,
        isConnected: seat !== 1,
      };
      renderSeatLabel(label as unknown as HTMLElement, view);
    }

    const rows = strip.children;
    const expectedSeats = [0, 1, 2, 3].map(offset => (viewerSeat + offset) % 4);
    assert.deepEqual(rows.map(row => Number(row.dataset.displayOrder)), [0, 1, 2, 3]);
    assert.deepEqual(rows.map(row => row.children[0].textContent), expectedSeats.map(seat => NAMES[seat]));
    assert.deepEqual(rows.map(row => row.children[0].title), expectedSeats.map(seat => NAMES[seat]));
    assert.deepEqual(rows.map(row => row.children[0].attributes['aria-label']), expectedSeats.map(seat => NAMES[seat]));
    assert.deepEqual(rows.map(row => row.children[1].children.map(child => child.textContent).join('')),
      expectedSeats.map(seat => `${['東', '南', '西', '北'][seat]}${seat === 0 ? '・親' : ''}`));
    assert.deepEqual(rows.map(row => row.children[2].textContent), expectedSeats.map(seat => `${points[seat].toLocaleString('ja-JP')}点`));
    assert.ok(rows.every(row => row.children.length === 3));
    assert.equal(rows.filter(row => row.children[1].children.some(child => child.className === 'seat-role')).length, 1);
    assert.equal(rows.filter(row => row.dataset.active === 'true').length, 1);
    assert.equal(rows.find(row => row.dataset.active === 'true')!.children[0].textContent, NAMES[3]);
    assert.ok(rows.every(row => row.children[1].children.every(child => child.className === 'seat-wind' || child.className === 'seat-role')));
    assert.ok(rows.every(row => !row.children.some(child => ['seat-status', 'seat-self-marker'].includes(child.className))));
  });
});

for (const format of ['tonpu', 'tonnan'] as const) {
  test(`shared center round display omits match format for ${format}`, () => {
    withStrip(() => {
      for (const scenario of [
        { roundWind: 'east' as const, roundNumber: 1, honba: 0, liveWallCount: 69, label: '東1局' },
        { roundWind: 'east' as const, roundNumber: 2, honba: 0, liveWallCount: 68, label: '東2局' },
        { roundWind: 'east' as const, roundNumber: 3, honba: 0, liveWallCount: 67, label: '東3局' },
        { roundWind: 'east' as const, roundNumber: 4, honba: 1, liveWallCount: 68, label: '東4局 1本場' },
        { roundWind: 'south' as const, roundNumber: 1, honba: 0, liveWallCount: 66, label: '南1局' },
        { roundWind: 'south' as const, roundNumber: 2, honba: 0, liveWallCount: 65, label: '南2局' },
        { roundWind: 'south' as const, roundNumber: 3, honba: 0, liveWallCount: 64, label: '南3局' },
        { roundWind: 'south' as const, roundNumber: 4, honba: 2, liveWallCount: 12, label: '南4局 2本場' },
      ]) {
        const round = new ElementStub('div');
        const wall = new ElementStub('div');
        const view = Object.assign({
          roundWind: scenario.roundWind,
          roundNumber: scenario.roundNumber,
          honba: scenario.honba,
          liveWallCount: scenario.liveWallCount,
        }, { format });
        renderTableRoundInfo(round as unknown as HTMLElement, wall as unknown as HTMLElement, view);
        assert.equal(round.textContent, scenario.label);
        assert.equal(round.attributes['aria-label'], scenario.label);
        assert.equal(round.title, scenario.label);
        assert.equal(round.dataset.formatLabel, undefined);
        assert.deepEqual(wall.children.map(child => child.textContent), [`山${scenario.liveWallCount}枚`]);
      }
    });
  });
}
