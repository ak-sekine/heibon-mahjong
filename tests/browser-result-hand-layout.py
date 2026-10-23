"""Check result-hand tile geometry for all tile kinds and narrow mobile widths."""
import argparse
import json
import os
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/heibon-mahjong/')
args = parser.parse_args()
engine = os.environ.get('HEIBON_BROWSER', 'chromium')
assert engine in ('chromium', 'webkit'), engine
widths = [320, 375, 390, 414] if engine == 'webkit' else [320, 375, 390, 414, 1280]

with sync_playwright() as p:
    browser_type = getattr(p, engine)
    launch_options = {}
    if engine == 'chromium':
        executable = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
        if executable:
            launch_options['executable_path'] = executable
        launch_options['args'] = ['--no-sandbox']
    browser = browser_type.launch(**launch_options)
    for width in widths:
        mobile = engine == 'webkit' and width < 500
        page = browser.new_page(viewport={'width': width, 'height': 844},
                                device_scale_factor=2 if mobile else 1,
                                is_mobile=mobile, has_touch=mobile)
        page.goto(args.url)
        report = page.evaluate('''async () => {
          const { createTileElement } = await import('/heibon-mahjong/src/rendering/tile-svg.ts');
          const suited = (suit, rank) => ({ category: 'suited', suit, rank, isRed: false });
          const honor = name => ({ category: 'honor', honor: name, isRed: false });
          const allKinds = ['man', 'pin', 'sou'].flatMap(suit =>
            Array.from({ length: 9 }, (_, index) => suited(suit, index + 1)));
          allKinds.push(...['east', 'south', 'west', 'north', 'white', 'green', 'red'].map(honor));
          const screenshotHand = [
            suited('man', 6), suited('man', 7), suited('man', 8),
            ...[1, 2, 3, 4, 5, 6].map(rank => suited('pin', rank)),
            suited('sou', 1), suited('sou', 2), suited('sou', 3), honor('north'), honor('north'),
          ];
          const mixedHand = [
            suited('man', 1), suited('man', 5), suited('man', 9),
            suited('pin', 2), suited('pin', 5), suited('pin', 8),
            suited('sou', 3), suited('sou', 6), suited('sou', 9),
            honor('east'), honor('south'), honor('west'), honor('north'), honor('red'),
          ];
          const coverageHands = [];
          for (let offset = 0; offset < allKinds.length; offset += 14) {
            const hand = allKinds.slice(offset, offset + 14);
            while (hand.length < 14) hand.push(allKinds[(offset + hand.length) % allKinds.length]);
            coverageHands.push(hand);
          }
          const fixtures = [screenshotHand, mixedHand, ...coverageHands];
          const dialog = document.querySelector('#result-dialog');
          dialog.setAttribute('open', '');
          document.documentElement.classList.add('result-open');
          const reports = [];
          for (const [context, other] of [
            ['#win-result', '#online-result-content'],
            ['#online-result-content', '#win-result'],
          ]) {
            const panel = document.querySelector(context);
            document.querySelector(other).hidden = true;
            panel.hidden = false;
            panel.replaceChildren();
            fixtures.forEach((tiles, fixtureIndex) => {
              const section = document.createElement('section');
              section.className = 'winner-result';
              const hand = document.createElement('ol');
              hand.className = 'winning-hand';
              for (const [index, tile] of tiles.entries()) {
                const item = document.createElement('li');
                if (fixtureIndex === 0 && index === 8) item.className = 'winning-draw';
                item.append(createTileElement(tile));
                hand.append(item);
              }
              section.append(hand);
              panel.append(section);
              const items = [...hand.children];
              const boxes = items.map(item => {
                const cell = item.getBoundingClientRect();
                const svg = item.querySelector('svg');
                const face = svg.querySelector('rect').getBBox();
                const drawing = svg.getBoundingClientRect();
                return {
                  cellWidth: cell.width, cellHeight: cell.height, cellBottom: cell.bottom,
                  svgWidth: drawing.width, svgHeight: drawing.height, svgBottom: drawing.bottom,
                  frameWidth: face.width * drawing.width / 60,
                  frameHeight: face.height * drawing.height / 84,
                };
              });
              const range = key => Math.max(...boxes.map(box => box[key])) - Math.min(...boxes.map(box => box[key]));
              const labels = items.map(item => item.querySelector('svg').getAttribute('aria-label'));
              reports.push({
                context, fixture: fixtureIndex, tileCount: items.length,
                widthRange: range('cellWidth'), heightRange: range('cellHeight'),
                svgWidthRange: range('svgWidth'), svgHeightRange: range('svgHeight'),
                cellBottomRange: range('cellBottom'), svgBottomRange: range('svgBottom'),
                frameWidthRange: range('frameWidth'), frameHeightRange: range('frameHeight'),
                viewBoxCount: new Set(items.map(item => item.querySelector('svg').getAttribute('viewBox'))).size,
                targetLabel: labels[8], lastLabel: labels[13],
                lastHasWinningClass: items[13].classList.contains('winning-draw'),
                viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
              });
            });
          }
          return reports;
        }''')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (engine, width, report)
        for result in report:
            assert result['tileCount'] == 14, (engine, width, result)
            for key in ['widthRange', 'heightRange', 'svgWidthRange', 'svgHeightRange',
                        'cellBottomRange', 'svgBottomRange', 'frameWidthRange', 'frameHeightRange']:
                assert result[key] <= 0.05, (engine, width, result)
            assert result['viewBoxCount'] == 1, (engine, width, result)
            assert result['documentWidth'] <= result['viewportWidth'], (engine, width, result)
        screenshot_case = next(result for result in report if result['context'] == '#online-result-content' and result['fixture'] == 0)
        assert screenshot_case['targetLabel'] == '6筒', (engine, width, screenshot_case)
        assert screenshot_case['lastLabel'] == '北', (engine, width, screenshot_case)
        assert not screenshot_case['lastHasWinningClass'], (engine, width, screenshot_case)
        print(json.dumps({'browser': engine, 'viewportWidth': width, 'handsChecked': len(report), 'result': 'pass'}))
        page.close()
    browser.close()
