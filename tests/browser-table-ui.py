"""UI regressions; run against Vite on port 4173 (no game rules changed)."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for entry in ['', 'kan-test.html']:
        for width, height in [(320,568),(390,844),(1280,800)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://localhost:4173/heibon-mahjong/' + entry)
            page.wait_for_selector('#player-hand svg')
            page.evaluate('''async()=>{
              window.matchRenderer=await import('/heibon-mahjong/src/rendering/match.ts');
              window.match=(await import('/heibon-mahjong/src/game/match.ts')).startMatch();
              window.dora=await import('/heibon-mahjong/src/game/dora.ts');
              window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
              window.calls=await import('/heibon-mahjong/src/game/calls.ts');
              window.kan=await import('/heibon-mahjong/src/game/kan.ts');
              window.discard=await import('/heibon-mahjong/src/game/discard.ts');
              window.fixtures=await import('/heibon-mahjong/tests/calls-fixture.ts');
              window.scenarios=await import('/heibon-mahjong/src/verification/scenarios.ts');
              window.base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
            }''')
            for scene in ['normal','chi','pon','daiminkan','ankan','kakan','no-draw','multiple','four-melds']:
                page.evaluate('''scene=>{
                  let game=base;
                  if(scene==='chi'||scene==='pon') {
                    game=scene==='chi'?fixtures.callStart(3,{0:['3467m','234p','678s','19p','1z']},'man-5'):fixtures.callStart();
                    game=discard.discardTile(game,3,game.players[3].drawnTile.id);
                    game=calls.declareCall(game,0,calls.getCallOptions(game,0).find(o=>o.type===scene).id);
                  } else if(['daiminkan','ankan','kakan'].includes(scene)) {
                    game=scenarios.scenarioGame(scene);
                    game=scene==='daiminkan'?calls.declareCall(game,0,calls.getCallOptions(game,0).find(o=>o.type===scene).id):kan.declareKan(game,0,kan.getKanOptions(game,0)[0].id);
                  } else if(scene==='multiple') {
                    game=scenarios.scenarioGame('multiple');
                    for(let i=0;i<2;i++) game=kan.declareKan(game,0,kan.getKanOptions(game,0)[0].id);
                  } else if(scene==='no-draw') game={...base,players:base.players.map(p=>({...p,drawnTile:null}))};
                  else if(scene==='four-melds') {
                    const tiles=base.liveWall.slice(0,3);
                    game={...base,players:base.players.map(p=>({...p,hand:p.hand.slice(0,1),melds:Array.from({length:4},()=>({type:'pon',tiles,calledTileId:tiles[0].id,fromPlayerId:(p.id+3)%4}))}))};
                  }
                  window.game=game;
                  renderer.renderTable(game,[25000,25000,25000,25000]);
                }''',scene)
                # Fill each river with 18 tiles and put riichi at row boundaries.
                for riichi in [-1,0,5,6,17]:
                    page.evaluate('''index=>{
                      const pool=[...game.liveWall,...game.deadWall];
                      window.shown={...game,players:game.players.map((p,id)=>({...p,river:pool.slice(id*18,id*18+18),riichi:index<0?null:{declarationTileId:pool[id*18+index].id}}))};
                      renderer.renderTable(shown,[25000,25000,25000,25000]);
                      renderer.renderSelection(shown,null);
                      matchRenderer.renderMatch({...match,game:shown,depositSticks:index===17?17:0,honba:index===17?10:0});
                    }''',riichi)
                    result=page.evaluate('''()=>{
                      const q=s=>document.querySelector(s),r=e=>e.getBoundingClientRect();
                      const separate=(a,b)=>a.right<=b.left+.15||b.right<=a.left+.15||a.bottom<=b.top+.15||b.bottom<=a.top+.15;
                      const inside=(a,b)=>a.left>=b.left-.1&&a.right<=b.right+.1&&a.top>=b.top-.1&&a.bottom<=b.bottom+.1;
                      const t=r(q('.table')),c=r(q('.center-info')),d=r(q('.dora-area'));
                      const riverRects=Object.fromEntries([...document.querySelectorAll('.river')].map(e=>[e.dataset.playerId,r(e)]));
                      const seats=Object.fromEntries([...document.querySelectorAll('.table .seat')].map(e=>[e.dataset.playerId,r(e)]));
                      const meldDirection=[0,1,2,3].every(id=>{
                        const meld=q(`.seat[data-player-id="${id}"] .open-meld`),hand=id===0?q('#player-hand'):q(`.seat[data-player-id="${id}"] .concealed-hand`);
                        if(!meld||!hand)return true;
                        const m=r(meld),h=r(hand);
                        return id===0?h.right<=m.left+.2:id===2?m.right<=h.left+.2:id===3?m.top>=h.bottom-.2:m.bottom<=h.top+.2;
                      });
                      const hand=[...document.querySelectorAll('#player-hand svg')].map(r);
                      const items=[...document.querySelectorAll('#player-hand li')];
                      const tiles=[...document.querySelectorAll('.river svg,#player-hand svg,.concealed-hand,.open-meld')];
                      const publicIds=new Set([...document.querySelectorAll('[data-tile-id]')].map(e=>e.dataset.tileId));
                      const visibleIds=new Set([...shown.players.flatMap(p=>p.river),...shown.players.flatMap(p=>p.melds.flatMap(m=>m.tiles)),...dora.exposedDoraIndicators(shown)].map(t=>t.id));
                      const privateTiles=[...shown.players.slice(1).flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])]),...shown.liveWall,...shown.deadWall].filter(t=>!visibleIds.has(t.id));
                      return {
                        square:Math.abs(t.width-t.height)<1,noOverflow:document.documentElement.scrollWidth<=innerWidth,
                        packed:hand.every((a,i)=>i===0||Math.abs(a.left-hand[i-1].right-(items[i].classList.contains('drawn-tile')?5:1))<.2),
                        equalSize:hand.every(a=>Math.abs(a.width-hand[0].width)<.1),
                        drawn:items.filter(e=>e.classList.contains('drawn-tile')).length===Number(shown.players[0].drawnTile!==null),
                        noDuplicate:!q('#match-info')&&!q('#wall-count').textContent.includes('あなた'),
                        centralDora:inside(d,c)&&d.bottom<=r(q('#table-round')).top+.1&&inside(r(q('#wall-count')),c),
                        clear:tiles.every((e,i)=>tiles.slice(i+1).every(x=>separate(r(e),r(x))))&&[...document.querySelectorAll('.river svg')].every(e=>separate(r(e),c)),
                        contained:tiles.every(e=>inside(r(e),t)),
                        riverCount:[...document.querySelectorAll('.river')].every(e=>e.children.length===18),
                        riverCellsStable:[...document.querySelectorAll('.river')].every(e=>{
                          const cells=[...e.children].map(r),first=cells[0];
                          return cells.length===18&&cells.every(a=>Math.abs(a.width-first.width)<.1&&Math.abs(a.height-first.height)<.1);
                        }),
                        riversFacing:Math.abs((riverRects[2].left+riverRects[2].right-seats[2].left-seats[2].right))<1&&Math.abs((riverRects[0].left+riverRects[0].right-seats[0].left-seats[0].right))<1&&Math.abs((riverRects[3].top+riverRects[3].bottom-seats[3].top-seats[3].bottom))<1&&Math.abs((riverRects[1].top+riverRects[1].bottom-seats[1].top-seats[1].bottom))<1,
                        meldDirection,
                        selfMeldRight:!document.querySelector('.seat-bottom .open-meld')||r(q('.seat-bottom #player-hand')).right<=r(q('.seat-bottom .open-meld')).left+.1,
                        selfMeldGap:!document.querySelector('.seat-bottom .open-meld')||r(q('.seat-bottom #player-hand')).right+7.9<=r(q('.seat-bottom .open-meld')).left,
                        privateIds:privateTiles.every(t=>!publicIds.has(t.id)&&!q('main').innerHTML.includes(t.id)),
                        order:[...document.querySelectorAll('.river')].every(e=>[...e.children].every((tile,i)=>tile.dataset.tileId===shown.players[+e.dataset.playerId].river[i].id)),
                      };
                    }''')
                    assert all(result.values()), (entry,width,scene,riichi,result)
                    reports.append({'entry':entry or 'index.html','width':width,'scene':scene,'riichi':riichi,**result})
                if scene in ['normal','pon','four-melds']:
                    page.screenshot(path=str(out/f'{"kan" if entry else "main"}-{width}-{scene}.png'),full_page=True)
            assert not errors, errors
            page.close()
    browser.close()
(out/'results.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print(f'{len(reports)} UI scenes passed; screenshots and measurements: {out}')
