"""Rendering-only stress fixtures, measured in Chromium on both entry points.
Rules and real actions are covered by browser-step13-4/5 and browser-kan-page.
"""
import json, pathlib, shutil, os
from playwright.sync_api import sync_playwright
out = pathlib.Path('docs/verification/step13.5.4')
shots = out / 'screenshots/sizes'
shots.mkdir(parents=True, exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for entry in ['', 'kan-test.html']:
        for width, height in [(320,568),(375,547),(375,667),(390,844),(414,896),(430,844),(1280,800)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:4173/heibon-mahjong/' + entry)
            page.wait_for_selector('#player-hand svg')
            page.screenshot(path=str(shots / f'{"kan" if entry else "normal"}-{width}x{height}-start.png'), full_page=True)
            page.evaluate('''async()=>{
              window.app=await import('/heibon-mahjong/src/main.ts');
              window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
              window.fixtures=await import('/heibon-mahjong/tests/kan-fixture.ts');
              window.base=fixtures.kanGame({hands:{0:['123m','456p','789s','1122z']},draw:'east'});
              renderer.renderTable(base,[25000,25000,25000,25000]);
            }''')
            name = f'{"kan" if entry else "normal"}-{width}x{height}'
            def shot(scene):
                page.screenshot(path=str(shots / f'{name}-{scene}.png'), full_page=True)
            def hand():
                sizes = page.locator('#player-hand svg').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height,r.top]})')
                assert len(set(tuple(s) for s in sizes)) == 1, sizes
                return sizes[0][:2]
            normal_hand = hand()
            # Step 13.5.5 keeps the square table and 18-discard rivers within
            # the viewport. These are the measured ordinary-state widths;
            # only the four-meld stress fixtures below use the compact scale.
            expected_width = {320:18.6,375:22,390:23,414:24.5,430:25.5,1280:42}[width]
            assert abs(normal_hand[0] - expected_width) < .15, (width, normal_hand, expected_width)
            assert page.locator('#player-hand li').count() == 14
            shot('hand14-cpu-labels')
            measurements = page.evaluate('''()=>{
              const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.width,b.height]};
              return {dora:r('.dora-slot svg'),cpuTop:r('.seat-top .tile-back'),cpuRight:r('.seat-right .tile-back')};
            }''')
            w,h = measurements['dora']
            assert abs(h/w-1.4)<.003
            assert abs(w / normal_hand[0] - 1) < .001
            assert measurements['cpuTop']==[w,h]
            assert measurements['cpuRight']==[h,w]
            scene_measurements=[]
            for kind in ['pon','chi','daiminkan','kakan','ankan','pending']:
                page.evaluate('''kind=>{
                  const pool=[...base.liveWall,...base.deadWall];
                  const players=base.players.map((p,id)=>{
                    const tiles=pool.slice(0,kind==='pon'||kind==='chi'||kind==='pending'?3:4);
                    const meld={type:kind==='pending'?'pon':kind,tiles,calledTileId:tiles[0].id,fromPlayerId:(id+3)%4,addedTileId:tiles[3]?.id};
                    // Four exposed melds leave at most one concealed tile
                    // before a draw; avoid the impossible 13-tile hand fixture.
                    return {...p,hand:p.hand.slice(0,1),river:pool.slice(id*18,id*18+18),melds:Array.from({length:4},()=>({...meld})),riichi:{declarationTileId:pool[id*18+5].id}};
                  });
                  window.stress={...base,players};
                  if(kind==='pending') stress={...stress,phase:'awaiting-ron',ronWindow:{kind:'kakan',kan:{playerId:1,meldIndex:0,tile:pool[3]}}};
                  renderer.renderTable(stress,[25000,25000,25000,25000]);
                }''', kind)
                assert page.locator('.river-tile').count()==72
                assert page.locator('.seat .open-meld').count()==16
                result = page.evaluate('''()=>{
                  const rect=e=>e.getBoundingClientRect();
                  const separate=(a,b)=>a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1;
                  const tiles=[...document.querySelectorAll('.river svg,.open-meld svg,.tile-back,.concealed-kan-back')];
                  const d=rect(document.querySelector('.dora-slot svg'));
                  const sizeOK=tiles.every(e=>{const r=rect(e);return Math.abs(Math.min(r.width,r.height)-d.width)<.05&&Math.abs(Math.max(r.width,r.height)-d.height)<.05});
                  const labels=[...document.querySelectorAll('.seat-label')];
                  const labelOK=labels.every(e=>tiles.every(t=>separate(rect(e),rect(t)))&&e.scrollWidth<=e.clientWidth+1);
                  const melds=[...document.querySelectorAll('.seat .open-meld')];
                  const meldOK=melds.every((e,i)=>{
                    const r=rect(e),s=rect(e.closest('.seat'));
                    return r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1&&melds.slice(i+1).every(m=>separate(r,rect(m)))&&[...document.querySelectorAll('.river,.concealed-hand')].every(x=>separate(r,rect(x)));
                  });
                  const riverOK=[...document.querySelectorAll('.river')].every(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1);
                  return {sizeOK,labelOK,meldOK,riverOK,noOverflow:document.documentElement.scrollWidth<=innerWidth};
                }''')
                assert all(result.values()), (entry,width,height,kind,result)
                hand()
                scene_measurements.append(page.evaluate('''kind=>{
                  const read=s=>[...document.querySelectorAll(s)].map(e=>{
                    const b=e.getBoundingClientRect();return [b.width,b.height];
                  });
                  return {kind,river:read('.river svg'),meld:read('.seat .open-meld svg'),
                    added:read('.added-kan-tile svg'),backs:read('.concealed-kan-back'),
                    drawn:read('#player-hand .drawn-tile svg')};
                }''',kind))
                shot(kind+'-rivers18-four-melds')
            # A shortened concealed hand must still give every tile the same dimensions.
            page.evaluate('renderer.renderTable({...base,players:base.players.map((p,i)=>i===0?{...p,hand:p.hand.slice(0,4)}:p)},[25000,25000,25000,25000])')
            reduced_hand=hand()
            # Step 13.5.5 keeps the shared tile dimensions when calls shorten
            # the hand; do not restore the old enlarged short-hand size.
            assert abs(reduced_hand[0] - normal_hand[0]) < .1, (width, normal_hand, reduced_hand)
            assert not errors,errors
            reports.append({'entry':entry or 'index.html','viewport':[width,height],'hand14':normal_hand,'drawnTile':scene_measurements[0]['drawn'][0],'river':sorted(scene_measurements[0]['river'][0]),'meld':sorted(scene_measurements[0]['meld'][0]),'ratio':w/normal_hand[0],'handAfterCalls':reduced_hand,'shortHandRatio':w/reduced_hand[0],**measurements,'scenes':scene_measurements,'passed':True})
            page.close()
    browser.close()
(out/'measurements.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print(f'{len(reports)} page/viewports × 6 stress scenes passed')
