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
with sync_playwright() as p:
    browser_type = getattr(p, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    for width in [320, 355, 375, 390, 430]:
        page = browser.new_page(viewport={'width': width, 'height': 844})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base)
        page.wait_for_selector('#online-game-controls', state='attached')
        page.evaluate('''async()=>{
          const renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          const base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          const pool=[...base.liveWall,...base.deadWall,...base.players.slice(1).flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])])];
          const {OnlineGameController}=await import('/heibon-mahjong/src/online/game-controller.ts');
          const {ActionPanel}=await import('/heibon-mahjong/src/ui/action-panel.ts');
          const {ResultDialog}=await import('/heibon-mahjong/src/ui/result-dialog.ts');
          const {startMatch}=await import('/heibon-mahjong/src/game/match.ts');
          const {createPlayerGameView}=await import('/heibon-mahjong/src/online/game-view.ts');
          window.riverFixture={renderer,base,pool,OnlineGameController,ActionPanel,ResultDialog,startMatch,createPlayerGameView,
            online:new OnlineGameController(new ActionPanel(document.querySelector('#online-game-controls')),new ResultDialog())};
        }''')
        for count in range(18, 25):
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
                  const center=table.querySelector('.center-info'),dora=[...center.querySelectorAll('.dora-area .tile-svg')];
                  const riverPairs=faces.every((a,i)=>faces.slice(i+1).every(b=>separate(rect(a),rect(b))));
                  const handClear=faces.every(a=>hand.every(b=>separate(rect(a),rect(b))));
                  const centerClear=faces.every(a=>separate(rect(a),rect(center)));
                  const doraClear=faces.every(a=>dora.every(b=>separate(rect(a),rect(b))));
                  const tileBounds=faces.every(a=>inside(rect(a),t));
                  const riverBounds=rivers.every(a=>inside(rect(a),t));
                  return {tileCounts:rivers.map(e=>e.children.length),correctCount:rivers.every(e=>e.children.length===count),
                    allFourPositions:rivers.length===4,riverPairs,handClear,centerClear,doraClear,tileBounds,riverBounds,
                    noPageOverflow:document.documentElement.scrollWidth<=innerWidth,
                    fourthRow:count<19||rivers.every(r=>Number(r.dataset.riverRows)>=4&&
                      new Set([...r.children].map(e=>`${e.dataset.riverRow},${e.dataset.riverColumn}`)).size===count),
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
                    assert all(value is True for key, value in result.items() if key != 'tileCounts' and key != 'declarationCount'), (
                        width, count, declaration_seat, mode, result)
                    assert result['declarationCount'] == 1, (width, count, declaration_seat, mode, result)
                    reports.append({'width': width, 'count': count, 'declarationSeat': declaration_seat, 'mode': mode, **result})
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
                assert all(value is True for key, value in result.items() if key != 'tileCounts' and key != 'declarationCount'), (
                    width, count, declaration_seat, 'online', result)
                assert result['declarationCount'] == 1, (width, count, declaration_seat, 'online', result)
                reports.append({'width': width, 'count': count, 'declarationSeat': declaration_seat, 'mode': 'online', **result})
                if count in [18, 24] and declaration_seat == 3:
                    page.screenshot(path=str(out / f"river-capacity-{os.environ.get('HEIBON_BROWSER', 'chromium')}-{width}-{count}-online.png"), full_page=True)
                page.evaluate("window.riverFixture.online.receive({type:'online-session-ended'})")
        assert not errors, errors
        page.close()
    browser.close()
(out / f"river-capacity-{os.environ.get('HEIBON_BROWSER', 'chromium')}.json").write_text(
    json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'browser': os.environ.get('HEIBON_BROWSER', 'chromium'), 'checks': len(reports),
                  'widths': [320, 355, 375, 390, 430], 'riverCounts': list(range(18, 25)),
                  'modes': ['offline', 'online'], 'failures': 0}, ensure_ascii=False))
