"""Central one/two-row indicators, including the smallest four-meld table."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright

out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'dora-rows'
out.mkdir(parents=True, exist_ok=True)
reports = []
browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
    browser_type = getattr(p, browser_name)
    launch_args = {'args': ['--no-sandbox']} if browser_name == 'chromium' else {}
    browser = browser_type.launch(executable_path=(os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')) if browser_name == 'chromium' else None, **launch_args)
    for entry in ['', 'kan-test.html']:
        for width in [320, 375, 390, 430, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 844})
            page.goto('http://localhost:4173/heibon-mahjong/' + entry)
            if not entry:
                page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => app.controller.newGame())")
            page.wait_for_selector('#player-hand svg')
            page.evaluate('''async()=>{
              window.dr=await import('/heibon-mahjong/src/rendering/dora.ts');
              window.dg=await import('/heibon-mahjong/src/game/dora.ts');
              window.tr=await import('/heibon-mahjong/src/rendering/table.ts');
              window.mr=await import('/heibon-mahjong/src/rendering/match.ts');
              window.match=(await import('/heibon-mahjong/src/game/match.ts')).startMatch();
              const base=match.game, pool=[...base.liveWall,...base.deadWall];
              window.game={...base,players:base.players.map((p,id)=>({...p,hand:p.hand.slice(0,1),river:pool.slice(id*18,id*18+18),riichi:{declarationTileId:pool[id*18+17].id},melds:Array.from({length:4},()=>({type:'pon',tiles:pool.slice(0,3),calledTileId:pool[0].id,fromPlayerId:(id+3)%4}))}))};
              tr.renderTable(game,[25000,25000,25000,25000]);
            }''')
            for deposits in [0, 1, 2, 5, 10, 17]:
                for count in [0, 1, 2, 3, 4, 5]:
                    result = page.evaluate('''({deposits,count})=>{
                      const q=s=>document.querySelector(s), box=e=>e.getBoundingClientRect().toJSON();
                      const inside=(a,b)=>a.left>=b.left-.1&&a.right<=b.right+.1&&a.top>=b.top-.1&&a.bottom<=b.bottom+.1;
                      const separate=(a,b)=>a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1;
                      const honba=[0,1,2,10,2,10][count];
                      mr.renderMatch({...match,game,depositSticks:deposits,honba});
                      tr.renderTable({...game,liveWall:game.liveWall.slice(count)},match.points);
                      const wall={...game,kanCount:Math.max(0,count-1)}, omote=dg.exposedDoraIndicators(wall), ura=count?dg.uraDoraIndicators(wall):[];
                      dr.renderDoraIndicators(q('#dora-indicators'),omote,ura);
                      const selectors=['#local-table .center-info','#local-table .dora-area','#table-round','#wall-count','#deposit-sticks'];
                      const boxes=Object.fromEntries(selectors.map(s=>[s,box(q(s))]));
                      const c=boxes['#local-table .center-info'],d=boxes['#local-table .dora-area'],r=boxes['#table-round'],w=boxes['#wall-count'];
                      const slots=[...q('#dora-indicators').children], sticks=[...q('#deposit-sticks').children], t=box(q('.table'));
                      const riverFace=box(q('.river-top .tile-svg'));
                      const doraFaces=slots.map(e=>box(e.querySelector('svg')||e));
                      const doraSizeMatchesRiver=doraFaces.every(e=>Math.abs(e.width-riverFace.width)<.05&&Math.abs(e.height-riverFace.height)<.05);
                      const doraRowsEqual=doraFaces.every((e,i)=>Math.abs(e.width-doraFaces[0].width)<.05&&Math.abs(e.height-doraFaces[0].height)<.05);
                      const seatTiles=[...document.querySelectorAll('.table .seat .tile-svg,.table .seat .tile-back')].map(box);
                      const doraOutlineClear=slots.slice(5).every(e=>getComputedStyle(e).outlineStyle==='none');
                      const uraMarker=slots.length===10&&getComputedStyle(slots[5],'::after').content.replaceAll('"','')==='裏';
                      const roundAndWallLayout=innerWidth<=599?r.bottom<=w.top+.2:Math.abs(r.top-w.top)<.1;
                      const depositsFit=sticks.every(e=>{const r=box(e);return r.width>=42&&r.width<=48&&r.height>=11&&r.height<=13;});
                      const depositDots=sticks.every(e=>{const svg=e.querySelector('svg'),count=svg.querySelectorAll('circle').length,expected={'1000':1,'5000':3,'10000':6}[e.dataset.points];return count===expected&&[...svg.querySelectorAll('circle')].every(dot=>dot.getBoundingClientRect().width>=3);});
                      return {boxes,measurements:{riverTile:riverFace,doraFaces,depositSticks:sticks.map(box)},checks:{doraInside:inside(d,c),doraSizeMatchesRiver,doraRowsEqual,roundClear:r.bottom<=d.top+.1,wallInside:inside(w,c),roundInside:inside(r,c),
                        summary:q('#table-round').textContent===`東1局${honba?` ${honba}本場`:''}`&&q('#wall-count span').textContent===`山${game.liveWall.length-count}枚`&&roundAndWallLayout,
                        summarySize:parseFloat(getComputedStyle(q('.round-summary')).fontSize)>=12,
                        depositClear:sticks.every(e=>box(e).top>=d.bottom&&slots.every(t=>separate(box(e),box(t)))),
                        hiddenDeposits:q('#deposit-sticks').hidden===(deposits===0),
                        sticks:depositsFit&&depositDots&&sticks.every(e=>inside(box(e),c)),
                        rows:slots.length===(count?10:5)&&slots.every((e,i)=>i<5?Math.abs(box(e).top-box(slots[0]).top)<.1:box(e).top>=box(slots[0]).bottom),
                        uraStyle:doraOutlineClear&&(!count||uraMarker),
                        order:slots.every((e,i)=>e.dataset.tileId===(i<5?omote[i]?.id:ura[i-5]?.id)),
                        faces:slots.every((e,i)=>{const tile=i<5?omote[i]:ura[i-5];return !tile||e.querySelector('svg').getAttribute('aria-label').endsWith(e.getAttribute('aria-label').split('：')[1].split('、')[0])}),
                        hidden:wall.deadWall.filter(t=>![...omote,...ura].some(p=>p.id===t.id)).every(t=>!q('#dora-indicators').outerHTML.includes(t.id)),
                        riverClear:[...document.querySelectorAll('.river svg')].every(e=>separate(box(e),c)),
                        seatClear:seatTiles.every(e=>separate(e,c)),
                        square:Math.abs(t.width-t.height)<1,noOverflow:document.documentElement.scrollWidth<=innerWidth}};
                    }''', {'deposits': deposits, 'count': count})
                    reports.append({'entry': entry or 'index.html', 'width': width, 'deposits': deposits, 'uraCount': count, **result})
                    if not all(result['checks'].values()):
                        (out/'diagnostics.json').write_text(json.dumps(reports, indent=2))
                        page.screenshot(path=str(out/f'{browser_name}-failure.png'), full_page=True)
                    assert all(result['checks'].values()), reports[-1]
                    if deposits == 17 and count == 5:
                        page.screenshot(path=str(out/f'{browser_name}-{"kan" if entry else "main"}-{width}.png'), full_page=True)
            page.close()
    browser.close()
(out/f'{browser_name}-results.json').write_text(json.dumps(reports, indent=2))
print(f'{len(reports)} central dora/deposit layouts passed in {browser_name}')
