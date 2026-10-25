"""Geometry checks for rivers at capacity in Chromium and WebKit."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
out = Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(parents=True, exist_ok=True)
reports = []
errors = []


def verify_original_river_positions(baselines, mode, declaration_seat, count, centers, width):
    key = (mode, declaration_seat)
    if count == 18:
        baselines[key] = centers
    elif count == 24:
        baseline = baselines[key]
        assert len(centers) == len(baseline) == 4, (width, mode, declaration_seat, centers)
        for river_index, (current_river, original_river) in enumerate(zip(centers, baseline)):
            assert len(current_river) == len(original_river) == 18, (
                width, mode, declaration_seat, river_index, current_river, original_river)
            for tile_index, (current, original) in enumerate(zip(current_river, original_river)):
                assert all(abs(a - b) <= 0.15 for a, b in zip(current, original)), (
                    width, mode, declaration_seat, river_index, tile_index, current, original)


with sync_playwright() as p:
    browser_type = getattr(p, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    viewports = [(320, 568), (355, 812), (375, 812), (390, 844), (430, 932)]
    for width, height in viewports:
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base)
        page.wait_for_selector('#online-game-controls', state='attached')
        page.evaluate('''async()=>{
          const renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          const base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          const tiles=(await import('/heibon-mahjong/src/game/wall.ts')).createWall();
          const pool=tiles.map((tile,index)=>({...tile,id:`river-capacity-${index}`}));
          const {OnlineGameController}=await import('/heibon-mahjong/src/online/game-controller.ts');
          const {ActionPanel}=await import('/heibon-mahjong/src/ui/action-panel.ts');
          const {ResultDialog}=await import('/heibon-mahjong/src/ui/result-dialog.ts');
          const {startMatch}=await import('/heibon-mahjong/src/game/match.ts');
          const {createPlayerGameView}=await import('/heibon-mahjong/src/online/game-view.ts');
          window.riverFixture={renderer,base,pool,OnlineGameController,ActionPanel,ResultDialog,startMatch,createPlayerGameView,
            online:new OnlineGameController(new ActionPanel(document.querySelector('#online-game-controls')),new ResultDialog())};
        }''')
        for count in [18, 19, 20, 23, 24, 25, 32, 33]:
            for declaration_seat in [0, 1, 2, 3]:
                page.evaluate('''({count,declarationSeat})=>{
                  const {renderer,base,pool,online}=window.riverFixture;
                  online.receive({type:'online-session-ended'});
                  const players=base.players.map((player,seat)=>{
                    const river=pool.slice(seat*count,(seat+1)*count);
                    return {...player,river,discardHistory:river,
                      riichi:seat===declarationSeat?{declarationTileId:river[count>=24?23:count-1].id,ippatsuEligible:false}:null};
                  });
                  const game={...base,players};
                  window.riverShown=game;
                  renderer.renderTable(game,[25000,25000,25000,25000]);
                }''', {'count': count, 'declarationSeat': declaration_seat})
                measure = '''({tableSelector,count,handSelector})=>{
                  const rect=e=>e.getBoundingClientRect();
                  const separate=(a,b)=>a.right<=b.left+.15||b.right<=a.left+.15||a.bottom<=b.top+.15||b.bottom<=a.top+.15;
                  const inside=(a,b)=>a.left>=b.left-.2&&a.right<=b.right+.2&&a.top>=b.top-.2&&a.bottom<=b.bottom+.2;
                  const table=document.querySelector(tableSelector),t=rect(table);
                  const rivers=[...table.querySelectorAll('.river')];
                  const faces=[...table.querySelectorAll('.river .tile-svg')];
                  const hand=[...table.querySelectorAll(handSelector+' .tile-svg')];
                  const seatTiles=[...table.querySelectorAll('.seat .tile-back,.seat .open-meld .tile-svg,.seat .revealed-tile .tile-svg,.seat-bottom #player-hand .tile-svg,.online-concealed-hand .tile-back,.online-open-melds .tile-svg,.online-seat-bottom #online-player-hand .tile-svg')];
                  const center=table.querySelector('.center-info'),dora=[...center.querySelectorAll('.dora-area .tile-svg')];
                  const riverPairs=faces.every((a,i)=>faces.slice(i+1).every(b=>separate(rect(a),rect(b))));
                  const handClear=faces.every(a=>hand.every(b=>separate(rect(a),rect(b))));
                  const centerClear=faces.every(a=>separate(rect(a),rect(center)));
                  const doraClear=faces.every(a=>dora.every(b=>separate(rect(a),rect(b))));
                  const seatClear=faces.every(a=>seatTiles.every(b=>separate(rect(a),rect(b))));
                  const sideRivers=table.id==='online-table'
                    ?[table.querySelector('.river-right'),table.querySelector('.river-left')]
                    :[table.querySelector('.river[data-player-id="1"]'),table.querySelector('.river[data-player-id="3"]')];
                  const sideScaleCorrect=sideRivers.every(r=>count<=24
                    ?r.style.getPropertyValue('--river-tile-width')===''&&r.style.getPropertyValue('--river-tile-height')===''
                    :r.style.getPropertyValue('--river-tile-width')!==''&&r.style.getPropertyValue('--river-tile-height')!=='');
                  const tileBounds=faces.every(a=>inside(rect(a),t));
                  const riverBounds=rivers.every(a=>inside(rect(a),t));
                  const box=e=>{const b=rect(e);return [b.left,b.top,b.right,b.bottom].map(v=>Math.round(v*10)/10);};
                  const seatOfRiver=r=>r.dataset.playerId??({bottom:0,right:1,top:2,left:3}[['bottom','right','top','left'].find(position=>r.classList.contains(`river-${position}`))]);
                  const riverAt=seat=>table.id==='online-table'
                    ?table.querySelector(`.river-${({0:'bottom',1:'right',2:'top',3:'left'})[seat]}`)
                    :table.querySelector(`.river[data-player-id="${seat}"]`);
                  const owner=e=>seatOfRiver(e.closest('.river'));
                  const prefixCenters=rivers.map(r=>[...r.children].slice(0,18).map(e=>{
                    const b=rect(e.querySelector('.tile-svg'));
                    return [Math.round((b.left+b.right)*5)/10,Math.round((b.top+b.bottom)*5)/10];
                  }));
                  const riverOverlaps=[];
                  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++)if(!separate(rect(faces[i]),rect(faces[j])))
                    riverOverlaps.push({a:[owner(faces[i]),[...faces[i].closest('.river').children].indexOf(faces[i].closest('.river-tile')),box(faces[i])],
                      b:[owner(faces[j]),[...faces[j].closest('.river').children].indexOf(faces[j].closest('.river-tile')),box(faces[j])]});
                  const centerOverlaps=faces.filter(a=>!separate(rect(a),rect(center))).map(a=>
                    [owner(a),[...a.closest('.river').children].indexOf(a.closest('.river-tile')),box(a),box(center)]);
                  const handOverlaps=[];
                  for(const a of faces)for(const b of hand)if(!separate(rect(a),rect(b)))
                    handOverlaps.push([owner(a),[...a.closest('.river').children].indexOf(a.closest('.river-tile')),box(a),box(b)]);
                  const seatOverlaps=[];
                  for(const a of faces)for(const b of seatTiles)if(!separate(rect(a),rect(b)))
                    seatOverlaps.push([owner(a),[...a.closest('.river').children].indexOf(a.closest('.river-tile')),
                      b.closest('.seat')?.dataset.playerId??b.closest('.online-seat')?.dataset.onlineSeat,box(a),box(b)]);
                  const criticalSlotsCorrect=[1,3].every(seat=>{
                    if(count>24)return true;
                    const river=riverAt(seat);
                    const expected=seat===1?[[5,2],[4,2],[1,2],[0,2]]:[[2,0],[3,0],[6,0],[7,0]];
                    return [18,19,22,23].every((index,n)=>{
                      const tile=river?.children[index];
                      return count<index+1||Boolean(tile&&Number(tile.dataset.riverRow)===expected[n][0]&&
                        Number(tile.dataset.riverColumn)===expected[n][1]);
                    });
                  });
                  const criticalRects=[1,3].flatMap(seat=>{
                    const river=riverAt(seat);
                    return [18,19,22,23].filter(index=>count>index).map(index=>{
                      const tile=river.children[index];return {seat,index:index+1,slot:[Number(tile.dataset.riverRow),Number(tile.dataset.riverColumn)],rect:box(tile.querySelector('.tile-svg'))};
                    });
                  });
                  const expectedRows=river=>[1,3].includes(Number(seatOfRiver(river)))
                    ?Math.max(3,Math.ceil(count/8)):Math.max(3,Math.ceil(count/6));
                  return {tileCounts:rivers.map(e=>e.children.length),correctCount:rivers.every(e=>e.children.length===count),
                    allFourPositions:rivers.length===4,riverPairs,handClear,centerClear,doraClear,seatClear,sideScaleCorrect,criticalSlotsCorrect,tileBounds,riverBounds,
                    noPageOverflow:document.documentElement.scrollWidth<=innerWidth,
                    fourthRow:rivers.every(r=>Number(r.dataset.riverRows)===expectedRows(r)&&
                      new Set([...r.children].map(e=>`${e.dataset.riverRow},${e.dataset.riverColumn}`)).size===count),
                    riverOverlaps,centerOverlaps,handOverlaps,seatOverlaps,criticalRects,prefixCenters,
                    declarationCount:table.querySelectorAll('.river-tile[data-riichi-declaration="true"]').length,
                    declarationRotated:(()=>{const d=table.querySelector('.river-tile[data-riichi-declaration="true"] .tile-svg');
                      const n=d?.closest('.river')?.querySelector('.river-tile:not([data-riichi-declaration="true"]) .tile-svg');
                      if(!d||!n)return false;const a=rect(d),b=rect(n);
                      return Math.abs(a.width-b.height)<.35&&Math.abs(a.height-b.width)<.35;})()};
                }'''
                for mode, selector, hand_selector in [
                    ('offline', '#local-table', '#player-hand'),
                ]:
                    result = page.evaluate(measure, {'count': count, 'tableSelector': selector, 'handSelector': hand_selector})
                    assert all(value is True for key, value in result.items() if key not in ('tileCounts','declarationCount','riverOverlaps','centerOverlaps','handOverlaps','seatOverlaps','criticalRects','prefixCenters')) and not result['riverOverlaps'] and not result['centerOverlaps'] and not result['handOverlaps'] and not result['seatOverlaps'], (
                        width, height, count, declaration_seat, mode, result)
                    assert result['declarationCount'] == 1, (width, count, declaration_seat, mode, result)
                    del result['prefixCenters']
                    reports.append({'width': width, 'height': height, 'count': count, 'declarationSeat': declaration_seat, 'mode': mode, **result})
                    if count in [18, 24] and declaration_seat == 3:
                        page.screenshot(path=str(out / f"river-capacity-{os.environ.get('HEIBON_BROWSER', 'chromium')}-{width}-{count}-{mode}.png"), full_page=True)

                page.evaluate('''({count,declarationSeat})=>{
                  const {online,base,startMatch,createPlayerGameView}=window.riverFixture;
                  const players=riverShown.players.map(player=>({...player,control:'human'}));
                  const game={...riverShown,players};
                  const match={...startMatch(game),game};
                  const identities=players.map(player=>({seat:player.id,name:`Player ${player.id}`,control:'human',connected:true}));
                  const session={schemaVersion:1,gameRevision:count*10+declarationSeat+1,match,status:'playing',identities,hostSeat:0,decision:null,declarations:[]};
                  const view=createPlayerGameView(session,0,'RIVER1',new Set([0,1,2,3]));
                  online.receive({type:'game-state',view});
                }''', {'count': count, 'declarationSeat': declaration_seat})
                result = page.evaluate(measure, {'count': count, 'tableSelector': '#online-table', 'handSelector': '#online-player-hand'})
                assert all(value is True for key, value in result.items() if key not in ('tileCounts','declarationCount','riverOverlaps','centerOverlaps','handOverlaps','seatOverlaps','criticalRects','prefixCenters')) and not result['riverOverlaps'] and not result['centerOverlaps'] and not result['handOverlaps'] and not result['seatOverlaps'], (
                    width, height, count, declaration_seat, 'online', result)
                assert result['declarationCount'] == 1, (width, count, declaration_seat, 'online', result)
                del result['prefixCenters']
                reports.append({'width': width, 'height': height, 'count': count, 'declarationSeat': declaration_seat, 'mode': 'online', **result})
                if count in [18, 24] and declaration_seat == 3:
                    page.screenshot(path=str(out / f"river-capacity-{os.environ.get('HEIBON_BROWSER', 'chromium')}-{width}-{count}-online.png"), full_page=True)
                page.evaluate("window.riverFixture.online.receive({type:'online-session-ended'})")
        for mode, table_selector, hand_selector in [
            ('offline', '#local-table', '#player-hand'),
            ('online', '#online-table', '#online-player-hand'),
        ]:
            stable_centers = {}
            for count in [18, 24]:
                page.evaluate('''({count,mode})=>{
                  const {renderer,base,pool,online,startMatch,createPlayerGameView}=window.riverFixture;
                  online.receive({type:'online-session-ended'});
                  const players=base.players.map((player,seat)=>{
                    const river=pool.slice(seat*count,(seat+1)*count);
                    return {...player,river,discardHistory:river,
                      riichi:seat===0?{declarationTileId:river[5].id,ippatsuEligible:false}:null,
                      control:'human'};
                  });
                  const game={...base,players};
                  if(mode==='offline')renderer.renderTable(game,[25000,25000,25000,25000]);
                  else {
                    const match={...startMatch(game),game};
                    const identities=players.map(player=>({seat:player.id,name:`Player ${player.id}`,control:'human',connected:true}));
                    const session={schemaVersion:1,gameRevision:count,match,status:'playing',identities,hostSeat:0,decision:null,declarations:[]};
                    const view=createPlayerGameView(session,0,'RIVER1',new Set([0,1,2,3]));
                    online.receive({type:'game-state',view});
                  }
                }''', {'count': count, 'mode': mode})
                result = page.evaluate(measure, {'count': count, 'tableSelector': table_selector, 'handSelector': hand_selector})
                verify_original_river_positions(stable_centers, mode, 0, count, result['prefixCenters'], width)
                assert all(value is True for key, value in result.items() if key not in ('tileCounts','declarationCount','riverOverlaps','centerOverlaps','handOverlaps','seatOverlaps','criticalRects','prefixCenters')) and not result['riverOverlaps'] and not result['centerOverlaps'] and not result['handOverlaps'] and not result['seatOverlaps'], (
                    width, count, mode, 'stable-riichi-prefix', result)
            page.evaluate("window.riverFixture.online.receive({type:'online-session-ended'})")
        assert not errors, errors
        page.close()
    browser.close()
(out / f"river-capacity-{os.environ.get('HEIBON_BROWSER', 'chromium')}.json").write_text(
    json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'browser': os.environ.get('HEIBON_BROWSER', 'chromium'), 'checks': len(reports),
                  'viewports': viewports, 'riverCounts': [18, 19, 20, 23, 24, 25, 32, 33],
                  'modes': ['offline', 'online'], 'criticalRectSamples': [
                    {'width': r['width'], 'height': r['height'], 'count': r['count'], 'mode': r['mode'],
                     'tiles': r['criticalRects']}
                    for r in reports if r['width'] in (320, 390) and r['count'] in (19, 20, 24) and
                    r['declarationSeat'] == 0 and r['mode'] == 'offline'
                  ], 'failures': 0}, ensure_ascii=False))
