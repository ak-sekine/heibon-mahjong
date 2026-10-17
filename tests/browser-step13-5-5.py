"""Square-table geometry and directional discard order on both entry points.
Run against Vite on :4173. Screenshots are also reviewed manually.
"""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/verification/step13.5.5');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
 for entry in ['', 'kan-test.html']:
  for w,h in [(320,568),(375,547),(375,667),(390,844),(414,896),(430,844),(1280,800)]:
   page=b.new_page(viewport={'width':w,'height':h});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://localhost:4173/heibon-mahjong/'+entry);page.wait_for_selector('#player-hand svg')
   hand_size=page.locator('#player-hand svg').first.evaluate('e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}')
   name=f'{"kan" if entry else "normal"}-{w}x{h}'
   page.screenshot(path=str(out/f'{name}-initial.png'),full_page=True)
   page.evaluate('''async()=>{
    window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
    const f=await import('/heibon-mahjong/tests/kan-fixture.ts');
    window.base=f.kanGame({hands:{0:['123m','456p','789s','1122z']},draw:'east'});
   }''')
   for n in [1,18]:
    page.evaluate('''n=>{
     const pool=[...base.liveWall,...base.deadWall];
     renderer.renderTable({...base,players:base.players.map((p,i)=>({...p,river:pool.slice(i*18,i*18+n)}))},[25000,25000,25000,25000]);
    }''',n)
    result=page.evaluate('''()=>{
     const r=e=>e.getBoundingClientRect(),q=s=>document.querySelector(s),t=r(q('.table')),c=r(q('.center-info'));
     const inside=(a,b)=>a.left>=b.left-.1&&a.top>=b.top-.1&&a.right<=b.right+.1&&a.bottom<=b.bottom+.1;
     const separate=(a,b)=>a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1;
     const rivers=[...document.querySelectorAll('.river')];
     const seats=Object.fromEntries([...document.querySelectorAll('.table .seat')].map(e=>[e.dataset.playerId,r(e)]));
     const dirs=rivers.every(e=>{const a=r(e),id=e.dataset.playerId;return id==='0'?a.top>=c.bottom-.5&&a.bottom<=seats[id].top+.5:id==='2'?a.bottom<=c.top+.5&&a.top>=seats[id].bottom-.5:id==='1'?a.left>=c.right-.5&&a.right<=seats[id].left+.5:id==='3'?a.right<=c.left+.5&&a.left>=seats[id].right-.5:false});
     const order=rivers.every(e=>[...e.children].every((tile,i)=>{
      const row=Math.floor(i/6),col=i%6,id=e.dataset.playerId;
      return +tile.style.gridRow===(id==='1'?6-col:id==='3'?col+1:id==='2'?3-row:row+1)&&+tile.style.gridColumn===(id==='1'?row+1:id==='3'?3-row:id==='2'?6-col:col+1);
     }));
     const hands=[...document.querySelectorAll('.concealed-hand,#player-hand')];
     const perimeter=hands.every(e=>{const a=r(e),s=e.closest('.seat');return inside(a,t)&&(s.classList.contains('seat-top')?a.bottom<t.top+t.height*.15:s.classList.contains('seat-bottom')?a.top>t.bottom-t.height*.16:s.classList.contains('seat-left')?a.right<t.left+t.width*.15:a.left>t.right-t.width*.15)});
     const all=[...document.querySelectorAll('.river svg,.tile-back,#player-hand svg')];
     const clear=all.every((e,i)=>all.slice(i+1).every(x=>separate(r(e),r(x))));
     const hand=[...document.querySelectorAll('#player-hand svg')].map(e=>r(e));
     const handSize=r(q('#player-hand svg'));
     const riverScale=[...document.querySelectorAll('.river svg')].every(e=>Math.abs(Math.min(r(e).width,r(e).height)/handSize.width-.76)<.03&&Math.abs(Math.max(r(e).width,r(e).height)/handSize.height-.76)<.03);
     const countOK=[1,2,3].every(id=>q(`.concealed-hand[data-player-id="${id}"]`).children.length===base.players[id].hand.length+Number(base.players[id].drawnTile!==null));
     return {width:t.width,height:t.height,square:Math.abs(t.width-t.height)<1,countOK,riverScale,dirs,order,perimeter,clear,
      riversInside:rivers.every(e=>inside(r(e),t)),noOverflow:document.documentElement.scrollWidth<=innerWidth,
      equalHand:hand.every(a=>Math.abs(a.width-hand[0].width)<.1&&Math.abs(a.height-hand[0].height)<.1),
      touch:[...document.querySelectorAll('.discard-controls>button:not([hidden])')].every(e=>r(e).height>=44),
      actionsBottom:r(q('.discard-controls')).bottom};
    }''')
    for k,v in result.items():
     if isinstance(v,bool):assert v,(name,n,k,result)
    if not entry and h>=667 and w<600:assert result['actionsBottom']<=h,(name,result)
    page.screenshot(path=str(out/f'{name}-rivers{n}.png'),full_page=True)
    reports.append({'entry':entry or 'index.html','viewport':[w,h],'discards':n,**result})
   before=page.locator('.table').bounding_box()
   page.evaluate('renderer.renderTable({...base,players:base.players.map(p=>({...p,hand:p.hand.slice(0,4)}))})')
   after=page.locator('.table').bounding_box();assert before['width']==after['width'] and before['height']==after['height']
   short_sizes=page.locator('#player-hand svg').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})')
   assert len(short_sizes)==5 and all(all(abs(a-b)<.5 for a,b in zip(size,hand_size)) for size in short_sizes),(name,hand_size,short_sizes)
   assert not errors,errors
   page.close()
 b.close()
(out/'measurements.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
print(f'{len(reports)} square-table scenes passed')
