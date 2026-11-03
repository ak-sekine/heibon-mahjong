"""Responsive table geometry across phone, tablet, desktop, and rotation viewports."""
import json, os, pathlib
from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
VIEWPORTS = [(320, 568), (375, 667), (390, 844), (430, 932),
             (667, 375), (844, 390), (768, 1024), (1024, 768),
             (1280, 800), (1440, 900)]
reports = []
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => { app.controller.random = () => .999999; app.controller.newGame(); })")
        page.wait_for_selector('#player-hand svg')
        page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => window.responsiveApp = app)")
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
              const table=rect(document.querySelector('.table'));
              const melds=[...document.querySelectorAll('.seat-bottom .open-meld')].map(rect);
              const selfHand=rect(document.querySelector('.seat-bottom #player-hand'));
              const separate=(a,b)=>a.right<=b.left+.2||b.right<=a.left+.2||a.bottom<=b.top+.2||b.bottom<=a.top+.2;
              const tileWidth=rect(document.querySelector('.table .seat-bottom #player-hand li')).width;
              return {seatHandClear:melds.every(meld=>separate(hand,meld)),selfMeldGap:Math.min(...melds.map(meld=>meld.left-selfHand.right)),noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                tableInsideViewport:table.left>=-.5&&table.right<=innerWidth+.5,tableWidth:table.width,tileWidth,
                scrollWidth:document.documentElement.scrollWidth,meldCount:melds.length,
                outside:[...document.querySelectorAll('body *')].filter(e=>{const b=rect(e);return b.width&&b.height&&(b.left<-.5||b.right>innerWidth+.5)}).slice(0,10).map(e=>({cls:e.className?.baseVal||e.className,left:rect(e).left,right:rect(e).right}))};
            }''')
            assert metrics['seatHandClear'], f'CPU1 concealed hand overlaps human meld at {width}px: {metrics}'
            assert metrics['selfMeldGap']>=7.8, f'human hand-to-meld gap is below 8px at {width}px: {metrics}'
            assert metrics['noHorizontalScroll'], f'horizontal scroll at {width}px: {metrics}'
            assert metrics['tableInsideViewport'], f'table exceeds the visible page width at {width}x{height}: {metrics}'
            if width >= 600 and height <= 500:
                assert metrics['tableWidth'] <= height - 31, f'compact landscape table did not follow the dynamic viewport height at {width}x{height}: {metrics}'
                assert metrics['tileWidth'] >= 18, f'compact landscape tiles became too small at {width}x{height}: {metrics}'
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
        page.evaluate('''()=>{responsiveApp.controller.random=()=>.999999;responsiveApp.controller.newGame()}''')
        page.locator('#player-hand button:enabled').first.wait_for(state='visible', timeout=10000)
        selectable_tiles = page.locator('#player-hand button:enabled').count()
        assert 13 <= selectable_tiles <= 14, f'the current hand should be selectable at {width}x{height}: {selectable_tiles}'
        previous_river_count = page.evaluate('''()=>responsiveApp.controller.game.players[responsiveApp.controller.playerSeat].river.length''')
        page.locator('#player-hand button:enabled').first.click()
        discard = page.locator('#discard')
        discard.scroll_into_view_if_needed()
        action_target = discard.evaluate('''button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,enabled:!button.disabled,receivesPointer:hit===button||button.contains(hit)}}''')
        assert action_target['enabled'] and action_target['receivesPointer'], f'discard action is not operable at {width}x{height}: {action_target}'
        assert action_target['top'] >= 0 and action_target['bottom'] <= height, f'discard action did not scroll into the viewport at {width}x{height}: {action_target}'
        assert action_target['width'] >= 44 and action_target['height'] >= 44, f'discard action target is undersized at {width}x{height}: {action_target}'
        discard.click()
        page.wait_for_function('''previous=>responsiveApp.controller.game.players[responsiveApp.controller.playerSeat].river.length>previous''',arg=previous_river_count)
        if (width, height) in [(667, 375), (844, 390), (768, 1024), (1024, 768)]:
            rotated = {'width': height, 'height': width}
            page.set_viewport_size(rotated)
            page.evaluate('''()=>{responsiveApp.controller.random=()=>.999999;responsiveApp.controller.newGame()}''')
            page.locator('#player-hand button:enabled').first.click()
            rotated_action = page.locator('#discard')
            rotated_action.wait_for(state='visible')
            rotated_action.scroll_into_view_if_needed()
            rotated_metrics = page.evaluate('''()=>{const r=document.querySelector('.table').getBoundingClientRect(),button=document.querySelector('#discard'),b=button.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,table:{left:r.left,right:r.right,width:r.width},handButtons:[...document.querySelectorAll('#player-hand button')].length,actionButton:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,enabled:!button.disabled,receivesPointer:hit===button||button.contains(hit)}}}''')
            assert rotated_metrics['scrollWidth'] <= rotated_metrics['width'], f'rotation caused horizontal overflow: {rotated_metrics}'
            assert rotated_metrics['table']['left'] >= -.5 and rotated_metrics['table']['right'] <= rotated_metrics['width'] + .5, f'rotation moved the table outside the viewport: {rotated_metrics}'
            assert rotated_metrics['handButtons'] in (13, 14), f'rotation hid the hand: {rotated_metrics}'
            assert rotated_metrics['actionButton']['enabled'] and rotated_metrics['actionButton']['receivesPointer'], f'rotated discard action is not operable: {rotated_metrics}'
            assert rotated_metrics['actionButton']['top'] >= 0 and rotated_metrics['actionButton']['bottom'] <= rotated_metrics['height'], f'rotated discard action did not scroll into view: {rotated_metrics}'
            assert rotated_metrics['actionButton']['width'] >= 44 and rotated_metrics['actionButton']['height'] >= 44, f'rotated discard action target is undersized: {rotated_metrics}'
        reports.append({'viewport': f'{width}x{height}', 'tableWidth': metrics['tableWidth'], 'tileWidth': metrics['tileWidth'], 'riverMetrics': river_metrics})
        print(f'{ENGINE} {width}x{height} responsive table passed: rivers={river_metrics}')
        page.close()
    browser.close()
report = {'browser': ENGINE, 'viewports': reports, 'result': 'passed'}
(out / f'responsive-table-{ENGINE}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
