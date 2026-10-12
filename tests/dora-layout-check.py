"""Rendering-only five-indicator fixture; never reveals the game's hidden wall."""
from playwright.sync_api import sync_playwright
import argparse
import json
import pathlib
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:4173/quill-mahjong/')
parser.add_argument('--screenshots', default='docs/screenshots/ui-step83')
options = parser.parse_args()
out = pathlib.Path(options.screenshots)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    reports = []
    for width, height in [(320,568), (375,667), (390,844), (414,896), (1280,800)]:
        page = browser.new_page(viewport={'width':width,'height':height})
        page.goto(options.url)
        # Test-only fixture uses synthetic public tile IDs, never hidden wall tiles.
        page.evaluate('''async () => {
          const { renderDoraIndicators } = await import('/quill-mahjong/src/rendering/dora.ts');
          const { renderTable } = await import('/quill-mahjong/src/rendering/table.ts');
          const { startGame } = await import('/quill-mahjong/src/game/start.ts');
          const game = startGame();
          renderTable(game);
          window.privateIds = [...game.deadWall.filter((_,i)=>i!==4),
            ...game.players.slice(1).flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])])].map(t=>t.id);
          window.layoutFixture = count => renderDoraIndicators(document.querySelector('#dora-indicators'), [
            {id:'layout-man9',tile:{category:'suited',suit:'man',rank:9,isRed:false}},
            {id:'layout-pin9',tile:{category:'suited',suit:'pin',rank:9,isRed:false}},
            {id:'layout-sou9',tile:{category:'suited',suit:'sou',rank:9,isRed:false}},
            {id:'layout-north',tile:{category:'honor',honor:'north',isRed:false}},
            {id:'layout-red',tile:{category:'honor',honor:'red',isRed:false}}
          ].slice(0,count));
        }''')
        assert page.locator('#dora-indicators svg').count() == 1
        assert page.locator('.dora-placeholder').count() == 4
        assert page.evaluate('''() => privateIds.every(id=>![...document.querySelectorAll('[data-tile-id]')].some(el=>el.dataset.tileId===id))''')
        initial = None
        for count in [1,5]:
            page.evaluate('(count)=>layoutFixture(count)', count)
            assert page.locator('#dora-indicators svg').count() == count
            assert page.locator('.dora-placeholder').count() == 5-count
            assert page.locator('.dora-placeholder').evaluate_all('''els=>els.every(el=>el.children.length===0 && el.textContent==='' && Object.keys(el.dataset).length===0)''')
            metrics = page.evaluate('''() => {
              const rect = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
              const region=document.querySelector('#dora-indicators');
              return {area:rect(document.querySelector('.dora-area')),region:rect(region),table:rect(document.querySelector('.table')),
                slots:[...region.children].map(rect),
                childrenContained:[...region.children].every(slot=>{const r=slot.getBoundingClientRect();return [...slot.children].every(el=>{const c=el.getBoundingClientRect();return c.left>=r.left && c.right<=r.right && c.top>=r.top && c.bottom<=r.bottom;});}),
                overflow:document.documentElement.scrollWidth>innerWidth,
                content:[...region.querySelectorAll('.dora-kind')].map(el=>({text:el.textContent,clipped:el.scrollHeight>el.clientHeight || el.scrollWidth>el.clientWidth})),
                hand:[...document.querySelectorAll('#player-hand li')].map(rect),
                positions:[...document.querySelectorAll('.seat,.river,.center-info,#discard,#tsumo')].map(rect)};
            }''')
            assert not metrics['overflow'] and metrics['childrenContained']
            slots = metrics['slots']
            assert len(slots) == 5 and len({round(s['y'],2) for s in slots}) == 1
            for i, slot in enumerate(slots):
                assert slot['x'] >= 0 and slot['x']+slot['width'] <= width
                if i: assert slots[i-1]['x']+slots[i-1]['width'] <= slot['x']
            assert all(not item['clipped'] for item in metrics['content'])
            assert len(metrics['hand']) == 14 and len({round(s['y'],2) for s in metrics['hand']}) == 1
            assert page.locator('.seat[data-player-id="1"] svg,.seat[data-player-id="2"] svg,.seat[data-player-id="3"] svg').count() == 0
            if count == 1: initial = metrics
            else:
                assert metrics['area'] == initial['area'] and metrics['table'] == initial['table']
                assert metrics['positions'] == initial['positions'] and metrics['slots'] == initial['slots']
                assert [c['text'] for c in metrics['content']] == ['ドラ：\n1萬','ドラ：\n1筒','ドラ：\n1索','ドラ：\n東','ドラ：\n白']
            page.screenshot(path=str(out / f'{width}-{count}-indicators.png'), full_page=True)
            # Reduced height models browser chrome; controls remain reachable by page scrolling.
            page.set_viewport_size({'width':width,'height':height-120})
            for selector in ['#discard','#tsumo']:
                button=page.locator(selector)
                button.scroll_into_view_if_needed()
                assert button.evaluate('''el=>{const r=el.getBoundingClientRect();return r.width>=44 && r.height>=44 && r.top>=0 && r.bottom<=innerHeight && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}''')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('window.scrollTo(0,0)')
        reports.append({'viewport':[width,height],'one':initial,'five':metrics,'heightStable':True,'controlsReducedHeight':'pass','concealment':'pass'})
        page.close()
    browser.close()
    (out / 'layout-results.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps([{'viewport':r['viewport'],'areaHeight':r['one']['area']['height'],'slot':r['one']['slots'][0],'heightStable':True} for r in reports]))
