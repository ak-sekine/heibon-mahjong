"""Central one/two-row indicators, including the smallest four-meld table."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright

out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'dora-rows'
out.mkdir(parents=True, exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for entry in ['', 'kan-test.html']:
        for width in [320, 375, 390, 430, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 844})
            page.goto('http://localhost:4173/heibon-mahjong/' + entry)
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
                      const selectors=['.center-info','.dora-area','#table-round','#wall-count','#deposit-sticks'];
                      const boxes=Object.fromEntries(selectors.map(s=>[s,box(q(s))]));
                      const c=boxes['.center-info'],d=boxes['.dora-area'],r=boxes['#table-round'],w=boxes['#wall-count'];
                      const slots=[...q('#dora-indicators').children], sticks=[...q('#deposit-sticks').children], t=box(q('.table'));
                      return {boxes,checks:{doraInside:inside(d,c),roundClear:r.bottom<=d.top+.1,wallInside:inside(w,c),roundInside:inside(r,c),
                        summary:q('#table-round').textContent===`東1局${honba?` ${honba}本場`:''}`&&q('#wall-count span').textContent===`山${game.liveWall.length-count}枚`&&Math.abs(r.top-w.top)<.1,
                        summarySize:parseFloat(getComputedStyle(q('.round-summary')).fontSize)>=12,
                        depositClear:sticks.every(e=>box(e).top>=d.bottom&&slots.every(t=>separate(box(e),box(t)))),
                        hiddenDeposits:q('#deposit-sticks').hidden===(deposits===0),
                        sticks:sticks.every(e=>inside(box(e),c)&&box(e).width>=36&&box(e).height>=9.5),
                        rows:slots.length===(count?10:5)&&slots.every((e,i)=>i<5?Math.abs(box(e).top-box(slots[0]).top)<.1:box(e).top>=box(slots[0]).bottom),
                        order:slots.every((e,i)=>e.dataset.tileId===(i<5?omote[i]?.id:ura[i-5]?.id)),
                        faces:slots.every((e,i)=>{const tile=i<5?omote[i]:ura[i-5];return !tile||e.querySelector('svg').getAttribute('aria-label').endsWith(e.getAttribute('aria-label').split('：')[1].split('、')[0])}),
                        hidden:wall.deadWall.filter(t=>![...omote,...ura].some(p=>p.id===t.id)).every(t=>!q('#dora-indicators').outerHTML.includes(t.id)),
                        riverClear:[...document.querySelectorAll('.river svg')].every(e=>separate(box(e),c)),
                        square:Math.abs(t.width-t.height)<1,noOverflow:document.documentElement.scrollWidth<=innerWidth}};
                    }''', {'deposits': deposits, 'count': count})
                    reports.append({'entry': entry or 'index.html', 'width': width, 'deposits': deposits, 'uraCount': count, **result})
                    if not all(result['checks'].values()):
                        (out/'diagnostics.json').write_text(json.dumps(reports, indent=2))
                        page.screenshot(path=str(out/'failure.png'), full_page=True)
                    assert all(result['checks'].values()), reports[-1]
                    if deposits == 17 and count == 5:
                        page.screenshot(path=str(out/f'{"kan" if entry else "main"}-{width}.png'), full_page=True)
            page.close()
    browser.close()
(out/'results.json').write_text(json.dumps(reports, indent=2))
print(f'{len(reports)} central dora/deposit layouts passed')
