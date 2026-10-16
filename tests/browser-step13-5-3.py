"""Rendering-only stress fixtures, measured in Chromium on both entry points.
Rules and real actions are covered by browser-step13-4/5 and browser-kan-page.
"""
import json, pathlib, shutil
from playwright.sync_api import sync_playwright
out = pathlib.Path('docs/verification/step13.5.3')
shots = out / 'screenshots/sizes'
shots.mkdir(parents=True, exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    for entry in ['', 'kan-test.html']:
        for width, height in [(320,568),(375,547),(375,667),(390,844),(414,896),(430,844),(1280,800)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:4173/heibon-mahjong/' + entry)
            page.wait_for_selector('#player-hand svg')
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
            assert page.locator('#player-hand li').count() == 14
            shot('hand14-cpu-labels')
            measurements = page.evaluate('''()=>{
              const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.width,b.height]};
              return {dora:r('.dora-slot svg'),cpuTop:r('.seat-top .tile-back'),cpuRight:r('.seat-right .tile-back')};
            }''')
            w,h = measurements['dora']
            assert abs(h/w-1.4)<.003
            assert measurements['cpuTop']==[w,h]
            assert measurements['cpuRight']==[h,w]
            for kind in ['pon','chi','daiminkan','kakan','ankan','pending']:
                page.evaluate('''kind=>{
                  const pool=[...base.liveWall,...base.deadWall];
                  const players=base.players.map((p,id)=>{
                    const tiles=pool.slice(0,kind==='pon'||kind==='chi'||kind==='pending'?3:4);
                    const meld={type:kind==='pending'?'pon':kind,tiles,calledTileId:tiles[0].id,fromPlayerId:(id+3)%4,addedTileId:tiles[3]?.id};
                    return {...p,river:pool.slice(id*18,id*18+18),melds:Array.from({length:4},()=>({...meld})),riichi:{declarationTileId:pool[id*18+5].id}};
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
                if kind in ['chi','kakan','pending','ankan','daiminkan']: shot(kind+'-rivers18-four-melds')
            # A shortened concealed hand must still give every tile the same dimensions.
            page.evaluate('renderer.renderTable({...base,players:base.players.map((p,i)=>i===0?{...p,hand:p.hand.slice(0,4)}:p)},[25000,25000,25000,25000])')
            reduced_hand=hand()
            assert not errors,errors
            reports.append({'entry':entry or 'index.html','viewport':[width,height],'hand14':normal_hand,'handAfterCalls':reduced_hand,**measurements,'scenes':6,'passed':True})
            page.close()
    browser.close()
(out/'measurements.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print(f'{len(reports)} page/viewports × 6 stress scenes passed')
