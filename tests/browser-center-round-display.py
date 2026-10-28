"""Responsive center round and live wall display for offline and online tables."""
import json, os, pathlib
from playwright.sync_api import sync_playwright

base_url = os.environ.get('HEIBON_BASE_URL', 'http://localhost:4173/heibon-mahjong/')
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'center-round-display'
out.mkdir(parents=True, exist_ok=True)
browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
reports = []

with sync_playwright() as p:
    browser = getattr(p, browser_name).launch()
    for width in [320, 375, 390, 430, 1280]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        page.goto(base_url)
        page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => app.controller.newGame())")
        page.evaluate("import('/heibon-mahjong/src/rendering/shared-table-components.ts').then(module => { window.renderRoundInfo = module.renderTableRoundInfo; })")
        page.wait_for_selector('#player-hand svg')
        page.wait_for_selector('[data-online-center-info]', state='attached')
        scenarios = [
            ('tonpu', 'east', 1, 0, 69, '東1局'),
            ('tonnan', 'east', 4, 1, 68, '東4局 1本場'),
            ('tonnan', 'south', 4, 2, 12, '南4局 2本場'),
        ]
        for online in [False, True]:
            target = '#online-table' if online else '#local-table'
            panel = '#online-match' if online else '#local-table'
            page.evaluate('''({target,panel})=>{
              const root=document.querySelector(panel),table=document.querySelector(target);
              root.hidden=false;
              document.body.classList.toggle('online-game-active', target==='#online-table');
              table.classList.add('table');
              table.querySelectorAll('[data-online-seat]').forEach(seat=>seat.classList.add('seat',`seat-${seat.dataset.onlineSeat}`));
              table.querySelector('[data-online-rivers]')?.classList.add('rivers');
              table.querySelectorAll('[data-online-river]').forEach(river=>river.classList.add('river',`river-${river.dataset.onlineRiver}`));
              const center=table.querySelector('.center-info');
              center.classList.add('center-info');
            }''', {'target': target, 'panel': panel})
            for fmt, wind, round_no, honba, live, expected in scenarios:
                metrics = page.evaluate('''({target,fmt,wind,roundNo,honba,live,dead,expected})=>{
                  const table=document.querySelector(target), center=table.querySelector('.center-info');
                  const round=center.querySelector('.round-label'), wall=center.querySelector('.wall-count');
                  const textRenderer=window.renderRoundInfo;
                  const view={format:fmt,roundWind:wind,roundNumber:roundNo,honba,liveWallCount:live};
                  if(dead!==null)view.deadWallCount=dead;
                  textRenderer(round,wall,view);
                  const box=e=>{const r=typeof e.getBoundingClientRect==='function'?e.getBoundingClientRect():e;return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
                  const inside=(a,b)=>a.x>=b.x-.2&&a.right<=b.right+.2&&a.y>=b.y-.2&&a.bottom<=b.bottom+.2;
                  const overlaps=(a,b)=>a.x<b.right-.2&&a.right>b.x+.2&&a.y<b.bottom-.2&&a.bottom>b.y+.2;
                  const centerBox=box(center),roundBox=box(round),wallBox=box(wall),summaryBox=box(round.parentElement);
                  const roundStyle=getComputedStyle(round),wallStyle=getComputedStyle(wall);
                  const textRects=()=>{const range=document.createRange();range.selectNodeContents(round);return [...range.getClientRects()].map(box)};
                  const riverTiles=[...table.querySelectorAll('.river svg')];
                  return {
                    label:round.textContent,wallText:wall.textContent,aria:round.getAttribute('aria-label'),
                    formatData:round.dataset.formatLabel||null,formatVisible:(round.textContent+wall.textContent+round.getAttribute('aria-label')).includes('東風戦')||(round.textContent+wall.textContent+round.getAttribute('aria-label')).includes('半荘戦'),
                    roundBox,wallBox,centerBox,summaryBox,roundFont:roundStyle.fontSize,wallFont:wallStyle.fontSize,
                    roundHeight:roundBox.height,roundLineHeight:parseFloat(roundStyle.lineHeight),wallHeight:wallBox.height,
                    roundInside:inside(roundBox,centerBox),wallInside:inside(wallBox,centerBox),roundWallSeparated:roundBox.bottom<=wallBox.y+.2,
                    roundWallInline:roundBox.right<=wallBox.x+.2||wallBox.right<=roundBox.x+.2,
                    roundSingleLine:textRects().length===1,roundOverflow:round.scrollWidth>round.clientWidth,
                    wallOverflow:wall.scrollWidth>wall.clientWidth,summaryNoWrap:getComputedStyle(round.parentElement).whiteSpace==='nowrap',
                    roundWallGap:wallBox.y-roundBox.bottom,doraClear:summaryBox.bottom<=box(center.querySelector('.dora-area')).y+.2,
                    riverClear:riverTiles.every(tile=>!overlaps(centerBox,box(tile))),viewportOverflow:document.documentElement.scrollWidth>innerWidth,
                    expected,online:target.includes('online'),width:innerWidth
                  };
                }''', {'target':target,'fmt':fmt,'wind':wind,'roundNo':round_no,'honba':honba,'live':live,'dead':None if online else 14,'expected':expected})
                checks = {
                    'correct round': metrics['label'] == expected,
                    'correct live wall': metrics['wallText'] == f'山{live}枚' + ('' if online else '王牌 14枚'),
                    'match format omitted': not metrics['formatVisible'] and metrics['formatData'] is None,
                    'accessible label correct': metrics['aria'] == expected,
                    'round and wall fit': metrics['roundInside'] and metrics['wallInside'],
                    'readable single-line layout': metrics['roundSingleLine'] and metrics['summaryNoWrap'] and (metrics['roundWallSeparated'] if width <= 599 else metrics['roundWallInline']),
                    'no text overflow': not metrics['roundOverflow'] and not metrics['wallOverflow'],
                    'wall gap': metrics['roundWallGap'] >= 0,
                    'dora clear': metrics['doraClear'],
                    'rivers clear': metrics['riverClear'],
                    'no page overflow': not metrics['viewportOverflow'],
                }
                if width <= 599:
                    checks['mobile font is readable'] = metrics['roundFont'] == '16px' and metrics['wallFont'] == '16px'
                if not all(checks.values()):
                    page.screenshot(path=str(out / f'failure-{browser_name}-{width}-{"online" if online else "offline"}-{fmt}-{wind}-{round_no}-{honba}.png'), full_page=True)
                reports.append({'browser': browser_name, **metrics, 'checks': checks, 'passed': all(checks.values())})
                assert all(checks.values()), reports[-1]
            if width in [320, 390, 1280]:
                page.screenshot(path=str(out / f'{browser_name}-{width}-{"online" if online else "offline"}.png'), full_page=True)
            if online:
                page.evaluate("document.querySelector('#online-match').hidden=true")
        page.close()
    browser.close()

(out / f'{browser_name}-results.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(reports)} center round display cases passed in {browser_name}; screenshots and measurements: {out}')
