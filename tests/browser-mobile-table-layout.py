"""Focused mobile regressions for hand clearance and fixed river tracks."""
import os, shutil
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in [(320, 568), (375, 812), (390, 844), (430, 932)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => { app.controller.random = () => .999999; app.controller.newGame(); })")
        page.wait_for_selector('#player-hand svg')
        page.evaluate('''async()=>{
          window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          window.base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          window.tileTools=await import('/heibon-mahjong/src/model/tile.ts');
          window.mobileFixtures=[1,4].map(meldCount=>{
            let tileIndex=0;
            const melds=Array.from({length:meldCount},(_,i)=>{
              const type=meldCount===4&&i===3?'daiminkan':'pon';
              const size=type==='daiminkan'?4:3;
              const tiles=base.liveWall.slice(tileIndex,tileIndex+size); tileIndex+=size;
              return {type,tiles,calledTileId:tiles[1].id,fromPlayerId:3};
            });
            const game={...base,liveWall:base.liveWall.slice(tileIndex)};
            game.players=base.players.map(p=>p.id===0?{...p,hand:p.hand.slice(0,13-3*meldCount),melds}:p);
            const pool=[...game.liveWall,...game.deadWall];
            return {...game,players:game.players.map((p,id)=>({...p,
              river:pool.slice(id*18,id*18+18),
              riichi:id===2?{declarationTileId:pool[id*18+5].id}:null
            }))};
          });
          renderer.renderTable(mobileFixtures[0],[25000,25000,25000,25000]);
        }''')
        river_metrics = page.evaluate('''()=>{
          const rect=e=>e.getBoundingClientRect();
          const rivers=[...document.querySelectorAll('.table .river')].map(river=>{
            const cells=[...river.children].map(item=>rect(item.querySelector('svg')));
            const side=river.classList.contains('river-left')||river.classList.contains('river-right');
            const cols=side?3:6;
            const rows=side?8:3;
            const gaps=[];
            const rowCenters={};
            for(const item of river.children){
              const row=item.dataset.riverRow,face=rect(item.querySelector('svg'));(rowCenters[row]??=[]).push(face.top+face.height/2);
            }
            const rowAlignment=Math.max(0,...Object.values(rowCenters).map(values=>Math.max(...values)-Math.min(...values)));
            for(let i=0;i<cells.length;i++){
              const row=Number(river.children[i].dataset.riverRow);
              const col=Number(river.children[i].dataset.riverColumn);
              for(let j=0;j<cells.length;j++){
                if(i===j)continue;
                const otherRow=Number(river.children[j].dataset.riverRow);
                const otherCol=Number(river.children[j].dataset.riverColumn);
                if(row===otherRow&&otherCol===col+1)gaps.push(cells[j].left-cells[i].right);
                if(col===otherCol&&otherRow===row+1)gaps.push(cells[j].top-cells[i].bottom);
              }
            }
            return {count:cells.length,cols,rows,gaps,rowAlignment};
          });
          return {rivers,riichiTileWidth:rect(document.querySelector('.table .river [data-riichi-declaration="true"]')).width};
        }''')
        for fixture in range(2):
            page.evaluate('i=>renderer.renderTable(mobileFixtures[i],[25000,25000,25000,25000])',fixture)
            metrics = page.evaluate('''()=>{
              const rect=e=>e.getBoundingClientRect(),hand=rect(document.querySelector('.seat[data-player-id="1"] .concealed-hand'));
              const melds=[...document.querySelectorAll('.seat-bottom .open-meld')].map(rect);
              const selfHand=rect(document.querySelector('.seat-bottom #player-hand'));
              const separate=(a,b)=>a.right<=b.left+.2||b.right<=a.left+.2||a.bottom<=b.top+.2||b.bottom<=a.top+.2;
              return {seatHandClear:melds.every(meld=>separate(hand,meld)),selfMeldGap:Math.min(...melds.map(meld=>meld.left-selfHand.right)),noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                scrollWidth:document.documentElement.scrollWidth,meldCount:melds.length,
                outside:[...document.querySelectorAll('body *')].filter(e=>{const b=rect(e);return b.width&&b.height&&(b.left<-.5||b.right>innerWidth+.5)}).slice(0,10).map(e=>({cls:e.className?.baseVal||e.className,left:rect(e).left,right:rect(e).right}))};
            }''')
            assert metrics['seatHandClear'], f'CPU1 concealed hand overlaps human meld at {width}px: {metrics}'
            assert metrics['selfMeldGap']>=7.8, f'human hand-to-meld gap is below 8px at {width}px: {metrics}'
            assert metrics['noHorizontalScroll'], f'horizontal scroll at {width}px: {metrics}'
        assert all(r['count']==18 and ((r['rows'],r['cols']) in [(3,6),(8,3)]) for r in river_metrics['rivers']), f'rivers must remain 6x3 for self/opposite and 8x3 for side seats at {width}px: {river_metrics}'
        assert all(min(r['gaps'])>=.8 and r['rowAlignment']<.35 for r in river_metrics['rivers']), f'river tracks overlap or drift at {width}px: {river_metrics}'
        assert river_metrics['riichiTileWidth']>0, f'riichi tile should retain a cell at {width}px: {river_metrics}'
        for seat in range(4):
            target = page.evaluate('''seat=>{
              const source=mobileFixtures[0].players[seat], targetTile=source.river.at(-1);
              const duplicate={id:`visual-duplicate-${seat}`,tile:targetTile.tile};
              const players=mobileFixtures[0].players.map(player=>player.id===seat
                ? {...player,river:[duplicate,...player.river.slice(1)],riichi:{declarationTileId:targetTile.id}}
                : {...player,riichi:null});
              const preview={...mobileFixtures[0],players,phase:'awaiting-discard',ronWindow:null};
              renderer.renderTable(preview,[25000,25000,25000,25000]);
              const river=document.querySelector(`.river[data-player-id="${seat}"]`);
              const beforeItem=[...river.children].find(item=>item.dataset.tileId===targetTile.id);
              const beforeRect=beforeItem.getBoundingClientRect();
              const beforeFaceTransform=getComputedStyle(beforeItem.querySelector('svg')).transform;
              const active={...preview,phase:'awaiting-call',turnPlayerId:seat,
                ronWindow:{discarderId:seat,tileId:targetTile.id}};
              renderer.renderTable(active,[25000,25000,25000,25000]);
              const markers=[...document.querySelectorAll('.river-tile.pending-discard-target')];
              const marked=markers[0];
              const afterRect=marked.getBoundingClientRect();
              const style=getComputedStyle(marked);
              const declaration=marked.dataset.riichiDeclaration;
              const transform=getComputedStyle(marked.querySelector('svg')).transform;
              const sameKindCount=preview.players[seat].river.filter(tile=>
                tileTools.tileKindKey(tile.tile)===tileTools.tileKindKey(targetTile.tile)).length;
              const result={seat,markerCount:markers.length,targetId:marked.dataset.tileId,
                sameKindCount,declared:declaration==='true',sameGeometry:['left','top','width','height'].every(key=>Math.abs(beforeRect[key]-afterRect[key])<.01),
                sameFaceTransform:beforeFaceTransform===transform,outlineWidth:style.outlineWidth,
                outlineStyle:style.outlineStyle,outlineColor:style.outlineColor,outlineOffset:style.outlineOffset,
                pointerEvents:style.pointerEvents,noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth};
              renderer.renderTable(preview,[25000,25000,25000,25000]);
              result.cleared=document.querySelectorAll('.pending-discard-target').length===0;
              return result;
            }''', seat)
            assert target['markerCount']==1 and target['targetId'], f'one exact target discard must be outlined for seat {seat} at {width}px: {target}'
            assert target['sameKindCount']>=2, f'fixture must include duplicate tile kinds for seat {seat}: {target}'
            assert target['declared'], f'riichi declaration orientation must remain on the target for seat {seat}: {target}'
            assert target['sameGeometry'] and target['sameFaceTransform'], f'the target outline must not change tile geometry or direction for seat {seat}: {target}'
            assert (target['outlineWidth'],target['outlineStyle'],target['outlineColor'],target['outlineOffset'])==('3px','solid','rgb(255, 215, 0)','0px'), f'wrong target outline at {width}px: {target}'
            assert target['pointerEvents']=='none' and target['noHorizontalScroll'], f'target outline must not affect input or mobile width at {width}px: {target}'
            assert target['cleared'], f'target outline must clear after the decision closes for seat {seat}: {target}'
        print(f'{width}px mobile layout passed: rivers={river_metrics}')
        page.close()
    browser.close()
