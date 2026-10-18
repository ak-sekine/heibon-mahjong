"""Check actual player tile faces against CPU backs and meld faces."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright

widths = [(320,568),(355,812),(375,812),(390,844),(430,932),(1280,800)]
scenes = [
    'cpu1-kan-pending',
    'cpu1-kan-resolved',
    'cpu1-pon-chi-multiple',
    'cpu1-kan-multiple',
    'cpu1-four-melds',
    'self-14',
    'self-kan',
    'cpu2-kan',
    'cpu3-kan',
]
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in widths:
        page = browser.new_page(viewport={'width':width,'height':height})
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.wait_for_selector('#player-hand svg')
        page.evaluate('''async()=>{
          window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          window.base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          window.scenarios=await import('/heibon-mahjong/src/verification/scenarios.ts');
          window.kan=await import('/heibon-mahjong/src/game/kan.ts');
          window.ron=await import('/heibon-mahjong/src/game/ron.ts');
          window.kanFixture=await import('/heibon-mahjong/src/verification/kan-fixture.ts');
        }''')
        for scene in scenes:
            page.evaluate('''scene=>{
              const makeCpuMelds=(target,types,handCount)=>{
                const pool=[...base.liveWall,...base.deadWall];let index=0;
                const take=count=>{const result=pool.slice(index,index+count);index+=count;return result;};
                const melds=types.map(type=>{
                  const tiles=take(type==='pon'||type==='chi'?3:4);
                  return {type,tiles,calledTileId:type==='ankan'?'':tiles[1].id,
                    fromPlayerId:type==='ankan'?target:(target+3)%4,
                    ...(type==='kakan'?{addedTileId:tiles[3].id}:{})};
                });
                const hand=take(handCount),drawnTile=take(1)[0];
                const players=base.players.map(player=>player.id===target
                  ? {...player,hand,drawnTile,drawnTileSource:'live-wall',melds,river:[]}
                  : player);
                return {...base,turnPlayerId:target,phase:'awaiting-discard',players};
              };
              let game;
              if(scene==='cpu1-kan-pending'||scene==='cpu1-kan-resolved') {
                game=scenarios.scenarioGame('chankan');
                const option=kan.getKanOptions(game,1)[0];
                if(!option)throw new Error('CPU1 kakan fixture has no kan option');
                game=kan.declareKan(game,1,option.id);
                if(scene==='cpu1-kan-resolved')game=ron.passRon(game,0);
                if(game.players[1].melds[0].type!==(scene==='cpu1-kan-resolved'?'kakan':'pon'))
                  throw new Error(`Unexpected CPU1 kan state: ${game.players[1].melds[0].type}`);
              } else if(scene==='cpu1-pon-chi-multiple') {
                game=makeCpuMelds(1,['pon','chi'],7);
              } else if(scene==='cpu1-kan-multiple') {
                game=makeCpuMelds(1,['pon','chi','kakan'],4);
              } else if(scene==='cpu1-four-melds') {
                game=makeCpuMelds(1,['pon','chi','pon','kakan'],1);
              } else if(scene==='self-14') {
                game=base;
              } else if(scene==='self-kan') {
                game=scenarios.scenarioGame('multiple');
                const option=kan.getKanOptions(game,0)[0];
                if(!option)throw new Error('Self kan fixture has no kan option');
                game=kan.declareKan(game,0,option.id);
                if(!game.players[0].melds.some(meld=>meld.type==='ankan'))
                  throw new Error('Self kan did not complete');
              } else if(scene==='cpu2-kan'||scene==='cpu3-kan') {
                const target=scene==='cpu2-kan'?2:3;
                game=kanFixture.kanGame({hands:{},turn:target,draw:'north',melds:{[target]:[{type:'ankan',group:'1111z'}]}});
              }
              window.layoutGame=game;
              renderer.renderTable(game,[25000,25000,25000,25000]);
            }''',scene)
            result = page.evaluate('''()=>{
              const rect=e=>{const b=e.getBoundingClientRect();return {
                left:+b.left.toFixed(2),top:+b.top.toFixed(2),right:+b.right.toFixed(2),bottom:+b.bottom.toFixed(2),
                width:+b.width.toFixed(2),height:+b.height.toFixed(2)};};
              const owner=e=>e.closest('.seat')?.dataset.playerId;
              const tileLabel=e=>e.closest('.open-meld')?.dataset.meldType||
                (e.closest('.concealed-hand')?'concealed':'unknown');
              const self=[...document.querySelectorAll('#player-hand svg')];
              const cpu=[...document.querySelectorAll(
                '.seat:not([data-player-id="0"]) .concealed-hand .tile-back,'+
                '.seat:not([data-player-id="0"]) .open-melds .open-meld svg,'+
                '.seat:not([data-player-id="0"]) .open-melds .concealed-kan-back')];
              const intersects=[];
              for(let i=0;i<self.length;i++)for(const other of cpu){
                const a=self[i].getBoundingClientRect(),b=other.getBoundingClientRect();
                const x=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
                const y=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
                if(x>.1&&y>.1)intersects.push({selfTile:i,selfDrawn:self[i].closest('li').classList.contains('drawn-tile'),
                  cpuPlayer:owner(other),cpuTile:tileLabel(other),overlapX:+x.toFixed(2),overlapY:+y.toFixed(2),
                  selfRect:rect(self[i]),cpuRect:rect(other)});
              }
              const table=rect(document.querySelector('.table'));
              const outside=[...self,...cpu].filter(e=>{
                const b=e.getBoundingClientRect();return b.width===0||b.height===0||b.left<table.left-.5||b.top<table.top-.5||b.right>table.right+.5||b.bottom>table.bottom+.5;
              }).map(e=>({player:owner(e),className:e.getAttribute('class'),rect:rect(e)}));
              const handItems=[...document.querySelectorAll('#player-hand > li')];
              return {table,square:Math.abs(table.width-table.height)<1,
                noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                handCount:handItems.length,drawnCount:handItems.filter(e=>e.classList.contains('drawn-tile')).length,
                cpuTileCount:cpu.length,intersects,outside};
            }''')
            assert result['square'], f'{width}px {scene}: table is not square: {result}'
            assert result['noHorizontalScroll'], f'{width}px {scene}: page has horizontal overflow: {result}'
            assert not result['outside'], f'{width}px {scene}: rendered tile face/back leaves the table: {result["outside"]}'
            assert not result['intersects'], f'{width}px {scene}: player and CPU tile faces overlap: {result["intersects"]}'
            if scene=='self-14':
                assert result['handCount']==14 and result['drawnCount']==1, f'{width}px: 14-tile hand lost its drawn-tile marker: {result}'
            if scene=='self-kan':
                assert result['drawnCount']==1, f'{width}px: kan replacement tile lost its drawn-tile marker: {result}'
            reports.append({'width':width,'height':height,'scene':scene,**result})
        page.close()
    browser.close()

out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS','/tmp/heibon-table-ui'))
out.mkdir(parents=True,exist_ok=True)
(out/'seat-kan-overlap.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(reports)} seat tile-overlap layouts passed across widths {", ".join(str(w) for w,_ in widths)}; face/back rectangles had zero intersections.')
