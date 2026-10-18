"""Measure rendered tile faces, backs, melds, rivers and collisions in Chromium."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright

widths = [(320,568),(355,812),(375,812),(390,844),(430,932),(1280,800)]
scenes = [
    ('empty', []),
    ('chi', ['chi']),
    ('pon', ['pon']),
    ('daiminkan', ['daiminkan']),
    ('ankan', ['ankan']),
    ('kakan', ['kakan']),
    ('chi-pon', ['chi','pon']),
    ('ankan-kakan', ['ankan','kakan']),
    ('three-meld-mix', ['chi','pon','daiminkan']),
    ('four-meld-mix', ['chi','pon','ankan','kakan']),
    ('four-kan-mix', ['daiminkan','ankan','kakan','daiminkan']),
    ('four-daiminkan', ['daiminkan','daiminkan','daiminkan','daiminkan']),
]
reports = []
maximum_kan_overlap = {'width':None,'player':None,'scene':None,'overlapX':0,'overlapY':0,'count':0}
previous_layout_cpu3_overlap = None
previous_side_layout_css = '''
.table .seat { --meld-tile-width:var(--table-tile-width); --meld-tile-height:var(--table-tile-height); gap:5px; }
.table .seat .tile-back { width:var(--table-tile-width); height:var(--table-tile-height); }
.table .seat .concealed-hand { flex-direction:row; gap:1px; }
.table .seat .open-melds { display:flex; flex-direction:row; flex-wrap:nowrap; gap:4px; width:auto; padding:0; align-self:auto; max-width:none; }
.table .seat-left,.table .seat-right { top:50%; left:50%; width:calc(100% - 60px); height:var(--table-tile-height); }
.table .seat-left { transform:translate(-50%,-50%) translateX(calc(-50cqw + var(--table-tile-height)*.5)) rotate(90deg); }
.table .seat-right { transform:translate(-50%,-50%) translateX(calc(50cqw - var(--table-tile-height)*.5)) rotate(270deg); }
.table .seat-left:has(.open-meld):not(:has(.open-meld:nth-child(4))),
.table .seat-right:has(.open-meld):not(:has(.open-meld:nth-child(4))) {
  --side-seat-lane-gap:calc(var(--table-tile-width)*.6 + 5px);
  --side-seat-lane-size:calc(var(--table-tile-height)*2 + var(--side-seat-lane-gap));
  height:var(--side-seat-lane-size);
  flex-direction:column;
  gap:var(--side-seat-lane-gap);
}
.table .seat-left:has(.open-meld):not(:has(.open-meld:nth-child(4))) { transform:translate(-50%,-50%) translateX(calc(-50cqw + var(--side-seat-lane-size)*.5)) rotate(90deg); }
.table .seat-right:has(.open-meld):not(:has(.open-meld:nth-child(4))) { transform:translate(-50%,-50%) translateX(calc(50cqw - var(--side-seat-lane-size)*.5)) rotate(270deg); }
'''
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in widths:
        page = browser.new_page(viewport={'width':width,'height':height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.wait_for_selector('#player-hand svg')
        page.evaluate('''async()=>{
          window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          window.base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
        }''')
        baseline = page.evaluate('''()=>{
          const rect=e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}};
          return {hand:rect(document.querySelector('#player-hand svg')),dora:rect(document.querySelector('.dora-slot svg'))};
        }''')
        for player in range(4):
            for scene, types in scenes:
                page.evaluate('''({player,types})=>{
                  const pool=[...base.liveWall,...base.deadWall,...base.players.flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])])];let offset=0;
                  const take=count=>{const result=pool.slice(offset,offset+count);offset+=count;return result;};
                  const melds=types.map(type=>{
                    const tiles=take(type==='chi'||type==='pon'?3:4);
                    return {type,tiles,calledTileId:type==='ankan'?'':tiles[1].id,
                      fromPlayerId:(player+3)%4,
                      ...(type==='kakan'?{addedTileId:tiles[3].id}:{})};
                  });
                  const hand=take(13-3*types.length),drawnTile=take(1)[0],rivers=Array.from({length:4},()=>take(18));
                  const game={...base,turnPlayerId:player,phase:'awaiting-discard',players:base.players.map(p=>p.id===player
                    ? {...p,hand,drawnTile,drawnTileSource:'live-wall',melds,river:rivers[p.id]}
                    : {...p,river:rivers[p.id]})};
                  window.layoutGame=game;
                  renderer.renderTable(game,[25000,25000,25000,25000]);
                }''', {'player':player,'types':types})
                if width==375 and player==3 and scene=='chi':
                    legacy_style=page.add_style_tag(content=previous_side_layout_css)
                    previous_layout_cpu3_overlap=page.evaluate('''()=>{
                      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
                      const hands=[...document.querySelectorAll('.seat[data-player-id="3"] .concealed-hand .tile-back')];
                      const river=[...document.querySelectorAll('.river[data-player-id="3"] .river-tile .tile-svg')];
                      let maximum={overlapX:0,overlapY:0,area:0,handTile:null,riverTile:null};
                      let count=0;
                      for(const hand of hands)for(const discard of river){
                        const h=rect(hand),d=rect(discard);
                        const overlapX=Math.max(0,Math.min(h.right,d.right)-Math.max(h.left,d.left));
                        const overlapY=Math.max(0,Math.min(h.bottom,d.bottom)-Math.max(h.top,d.top));
                        if(overlapX>0&&overlapY>0){count++;if(overlapX*overlapY>maximum.area)maximum={overlapX,overlapY,area:overlapX*overlapY,handTile:h,riverTile:d};}
                      }
                      return {width:innerWidth,player:3,scene:'chi',count,maximum};
                    }''')
                    legacy_style.evaluate('(style)=>style.remove()')
                result = page.evaluate('''({player,types,baseline})=>{
                  const rawRect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
                  const rect=e=>{const r=rawRect(e);return {
                    left:+r.left.toFixed(2),top:+r.top.toFixed(2),right:+r.right.toFixed(2),bottom:+r.bottom.toFixed(2),
                    width:+r.width.toFixed(2),height:+r.height.toFixed(2)};};
                  const overlap=(a,b)=>({
                    x:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),
                    y:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))});
                  const separate=(a,b)=>{const o=overlap(a,b);return o.x===0||o.y===0;};
                  const owner=e=>e.closest('.seat')?.dataset.playerId??(e.closest('#player-hand')?'0':null);
                  const meld=e=>e.closest('.open-meld');
                  const describe=e=>({player:Number(owner(e)),kind:e.classList.contains('tile-back')?'back':e.classList.contains('concealed-kan-back')?'ankan-back':'face',
                    type:meld(e)?.dataset.meldType||null,added:Boolean(e.closest('.added-kan-tile')),called:Boolean(e.closest('.called-tile')),rect:rect(e)});
                  const q=s=>document.querySelector(s),table=rawRect(q('.table')),center=rawRect(q('.center-info'));
                  const river=[...document.querySelectorAll(`.river[data-player-id="${player}"] .river-tile .tile-svg`)];
                  const riverSize=rect(river[0]);
                  const expected=[riverSize.width,riverSize.height].sort((a,b)=>a-b);
                  const faceTiles=[...document.querySelectorAll('.table .seat .tile-back,.table .seat .open-meld svg,.table .seat .open-meld .concealed-kan-back')];
                  const tiles=[...faceTiles,...document.querySelectorAll('#player-hand svg')];
                  const riverFaces=[...document.querySelectorAll('.table .river .river-tile .tile-svg')];
                  const handBack=player===0?null:q(`.concealed-hand[data-player-id="${player}"] .tile-back`);
                  const playerMeld=q(`.open-melds[data-player-id="${player}"]`);
                  const meldFaces=playerMeld?[...playerMeld.querySelectorAll('svg,.concealed-kan-back')]:[];
                  const meldTile=meldFaces.find(e=>!e.closest('.called-tile,.added-kan-tile'));
                  const calledTile=playerMeld?.querySelector('.called-tile .tile-svg')||null;
                  const addedKanTile=playerMeld?.querySelector('.added-kan-tile:not(.pending-kan-tile) .tile-svg')||null;
                  const dimensions=faceTiles.map(e=>{
                    const r=rect(e),actual=[r.width,r.height].sort((a,b)=>a-b);
                    return Math.max(Math.abs(actual[0]-expected[0]),Math.abs(actual[1]-expected[1]));
                  });
                  const orientationDeltas=faceTiles.map(e=>{
                    const r=rect(e),turned=Boolean(e.closest('.called-tile,.added-kan-tile'));
                    const ownRiver=q(`.river[data-player-id="${owner(e)}"] .river-tile .tile-svg`);
                    const ownRiverSize=rect(ownRiver);
                    const expectedWidth=turned?ownRiverSize.height:ownRiverSize.width;
                    const expectedHeight=turned?ownRiverSize.width:ownRiverSize.height;
                    return Math.max(Math.abs(r.width-expectedWidth),Math.abs(r.height-expectedHeight));
                  });
                  const inside=[];
                  const collisions={tilePairs:[],sameRiver:[],anyRiver:[],center:[],neighbors:[],selfVsSide:[],intentionalKakan:[]};
                  const record=(list,a,b,extra={})=>{const x=overlap(rawRect(a),rawRect(b));if(x.x>0&&x.y>0)list.push({a:describe(a),b:describe(b),overlapX:+x.x.toFixed(4),overlapY:+x.y.toFixed(4),...extra});};
                  for(const e of tiles){
                    const r=rawRect(e);
                    if(r.width===0||r.height===0||r.left<table.left-.1||r.top<table.top-.1||r.right>table.right+.1||r.bottom>table.bottom+.1)inside.push(describe(e));
                    if(!separate(r,center))record(collisions.center,e,q('.center-info'));
                  }
                  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
                    const a=tiles[i],b=tiles[j],sameMeld=meld(a)&&meld(a)===meld(b),added=sameMeld&&(a.closest('.added-kan-tile')||b.closest('.added-kan-tile'));
                    const x=overlap(rawRect(a),rawRect(b));
                    if(x.x===0||x.y===0)continue;
                    if(added)record(collisions.intentionalKakan,a,b);
                    else {
                      record(collisions.tilePairs,a,b);
                      if(owner(a)!==owner(b))record(collisions.neighbors,a,b);
                      if((owner(a)==='0'&&['1','3'].includes(owner(b)))||(owner(b)==='0'&&['1','3'].includes(owner(a))))record(collisions.selfVsSide,a,b);
                    }
                  }
                  for(const tile of tiles)for(const discard of riverFaces){
                    const id=owner(tile),riverOwner=discard.closest('.river').dataset.playerId;
                    const x=overlap(rawRect(tile),rawRect(discard));
                    if(x.x===0||x.y===0)continue;
                    record(collisions.anyRiver,tile,discard,{riverPlayer:Number(riverOwner)});
                    if(id===riverOwner)record(collisions.sameRiver,tile,discard,{riverPlayer:Number(riverOwner)});
                  }
                  const hand=player===0?q('#player-hand'):q(`.concealed-hand[data-player-id="${player}"]`);
                  const melds=q(`.open-melds[data-player-id="${player}"]`);
                  const h=rect(hand),m=rect(melds),hasMeld=types.length>0;
                  const gap=player===0?m.left-h.right:player===1?h.top-m.bottom:player===2?h.left-m.right:m.top-h.bottom;
                  const directionOK=!hasMeld||(player===0?h.right<=m.left+.1:player===1?m.bottom<=h.top+.1:player===2?m.right<=h.left+.1:m.top>=h.bottom-.1);
                  const gapOK=!hasMeld||gap>=(player===0?7.8:3.8);
                  const groups=[...melds.children],sequence=groups.map(e=>e.dataset.meldType);
                  const centers=groups.map(e=>{const r=rect(e);return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};});
                  const sequenceOK=centers.every((a,i)=>i===0||(player===0?a.x>centers[i-1].x:player===1?a.y<centers[i-1].y:player===2?a.x<centers[i-1].x:a.y>centers[i-1].y));
                  const cpuHands=[...document.querySelectorAll('.concealed-hand')];
                  const visibleTileIds=[...document.querySelectorAll('[data-tile-id]')].map(e=>e.dataset.tileId);
                  const hiddenCpuTiles=layoutGame.players.slice(1).flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])]);
                  const hiddenClean=cpuHands.every(hand=>[...hand.children].every(e=>e.className==='tile-back'&&!e.children.length&&!Object.keys(e.dataset).length))&&
                    hiddenCpuTiles.every(t=>!visibleTileIds.includes(t.id));
                  const handCount=player===0?q('#player-hand').children.length:q(`.concealed-hand[data-player-id="${player}"]`).children.length;
                  const selfSizes=[...document.querySelectorAll('#player-hand svg')].map(rect);
                  const dora=rect(q('.dora-slot svg'));
                  const unexpectedHits=[...collisions.tilePairs,...collisions.anyRiver,...collisions.center,...collisions.neighbors,...collisions.selfVsSide];
                  return {
                    table,square:Math.abs(table.width-table.height)<.5,noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                    expectedTile:{width:+expected[0].toFixed(2),height:+expected[1].toFixed(2)},
                    maxTileSizeDelta:+Math.max(...dimensions).toFixed(2),allTileSizesMatchRiver:dimensions.every(d=>d<=.15),
                    maxTileOrientationDelta:+Math.max(...orientationDeltas).toFixed(2),allTileOrientationsMatchRiver:orientationDeltas.every(d=>d<=.15),
                    handSizeOK:handCount===14-3*types.length,handMeldDirection:directionOK,handMeldGapOK:gapOK,handMeldGap:hasMeld?+gap.toFixed(2):null,
                    riverTileBCR:riverSize,handBackBCR:handBack?rect(handBack):null,
                    meldTileBCR:meldTile?rect(meldTile):null,calledTileBCR:calledTile?rect(calledTile):null,
                    addedKanTileBCR:addedKanTile?rect(addedKanTile):null,
                    meldOrder:JSON.stringify(sequence)===JSON.stringify(types),meldVisualOrder:sequenceOK,
                    tableContainment:inside.length===0,ownRiverClear:collisions.sameRiver.length===0,allRiversClear:collisions.anyRiver.length===0,
                    seatTilesClear:collisions.tilePairs.length===0,neighborSeatsClear:collisions.neighbors.length===0,
                    centerClear:collisions.center.length===0,selfVsCpu1Cpu3Clear:collisions.selfVsSide.length===0,
                    unexpectedOverlapCount:unexpectedHits.length,
                    unexpectedOverlapX:+Math.max(0,...unexpectedHits.map(hit=>hit.overlapX)).toFixed(2),
                    unexpectedOverlapY:+Math.max(0,...unexpectedHits.map(hit=>hit.overlapY)).toFixed(2),
                    hiddenCpuIdsProtected:hiddenClean,riverTileCount:river.length,
                    kakanStackCorrect:collisions.intentionalKakan.length===1&&collisions.intentionalKakan.every(hit=>(hit.a.added&&hit.b.called)||(hit.b.added&&hit.a.called)),
                    selfHandSizeUnchanged:selfSizes.every(r=>Math.abs(r.width-baseline.hand.width)<.15&&Math.abs(r.height-baseline.hand.height)<.15),
                    doraSizeUnchanged:Math.abs(dora.width-baseline.dora.width)<.15&&Math.abs(dora.height-baseline.dora.height)<.15,
                    tilePairCollisions:collisions.tilePairs,ownRiverCollisions:collisions.sameRiver,anyRiverCollisions:collisions.anyRiver,
                    neighborCollisions:collisions.neighbors,centerCollisions:collisions.center,selfSideCollisions:collisions.selfVsSide,
                    intentionalKakanOverlap:collisions.intentionalKakan
                  };
                }''', {'player':player,'types':types,'baseline':baseline})
                checks=['square','noHorizontalScroll','allTileSizesMatchRiver','allTileOrientationsMatchRiver','handSizeOK','handMeldDirection','handMeldGapOK','meldOrder','meldVisualOrder','tableContainment','ownRiverClear','allRiversClear','seatTilesClear','neighborSeatsClear','centerClear','selfVsCpu1Cpu3Clear','hiddenCpuIdsProtected','selfHandSizeUnchanged','doraSizeUnchanged']
                assert result['riverTileCount']==18, f'{width}px player {player} {scene}: expected 18 close river tiles: {result}'
                assert all(result[name] for name in checks), f'{width}px player {player} {scene}: {result}'
                if 'kakan' in types:
                    intentional=result['intentionalKakanOverlap']
                    assert intentional, f'{width}px player {player} {scene}: added-kan tile did not overlap its stack: {result}'
                    assert result['kakanStackCorrect'], f'{width}px player {player} {scene}: added-kan tile did not stack only on the called face: {result}'
                    for hit in intentional:
                        if hit['overlapX']*hit['overlapY']>maximum_kan_overlap['overlapX']*maximum_kan_overlap['overlapY']:
                            maximum_kan_overlap.update({'width':width,'player':player,'scene':scene,
                                'overlapX':hit['overlapX'],'overlapY':hit['overlapY']})
                    maximum_kan_overlap['count']+=len(intentional)
                reports.append({'width':width,'height':height,'player':player,'scene':scene,**{k:result[k] for k in ['table','expectedTile','maxTileSizeDelta','maxTileOrientationDelta','handMeldGap','riverTileBCR','handBackBCR','meldTileBCR','calledTileBCR','addedKanTileBCR','unexpectedOverlapCount','unexpectedOverlapX','unexpectedOverlapY','selfHandSizeUnchanged','doraSizeUnchanged']}})
                if width==320 and player==3 and scene=='empty':
                    page.screenshot(path=str(out/'cpu3-river-proximity-320.png'),full_page=True)
        assert not errors, f'{width}px page errors: {errors}'
        page.close()
    browser.close()

(out/'seat-kan-overlap.json').write_text(json.dumps({'layouts':reports,'intentionalKanOverlap':maximum_kan_overlap,'previousLayoutCpu3Overlap':previous_layout_cpu3_overlap},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
viewport_metrics = {}
for layout in reports:
    key = f"{layout['width']}x{layout['height']}"
    metric = viewport_metrics.setdefault(key, {'viewport':key,'players':{},'maxTileSizeDelta':0,'maxTileOrientationDelta':0,'maxUnexpectedOverlapX':0,'maxUnexpectedOverlapY':0,'minHandMeldGap':None})
    metric['maxTileSizeDelta'] = max(metric['maxTileSizeDelta'], layout['maxTileSizeDelta'])
    metric['maxTileOrientationDelta'] = max(metric['maxTileOrientationDelta'], layout['maxTileOrientationDelta'])
    metric['maxUnexpectedOverlapX'] = max(metric['maxUnexpectedOverlapX'], layout['unexpectedOverlapX'])
    metric['maxUnexpectedOverlapY'] = max(metric['maxUnexpectedOverlapY'], layout['unexpectedOverlapY'])
    if layout['handMeldGap'] is not None:
        metric['minHandMeldGap'] = layout['handMeldGap'] if metric['minHandMeldGap'] is None else min(metric['minHandMeldGap'], layout['handMeldGap'])
    seat = metric['players'].setdefault(str(layout['player']), {'river':layout['riverTileBCR'],'handBack':layout['handBackBCR'],'meld':None,'called':None,'addedKan':None})
    for field, report in [('meld',layout['meldTileBCR']),('called',layout['calledTileBCR']),('addedKan',layout['addedKanTileBCR'])]:
        if report is not None and seat[field] is None:
            seat[field] = report
measurement_notice = {'layouts':len(reports),'viewports':list(viewport_metrics.values()),'intentionalKanOverlap':maximum_kan_overlap,'previousLayoutCpu3Overlap':previous_layout_cpu3_overlap}
print(f"::notice title=Rendered tile BCR measurements::{json.dumps(measurement_notice,separators=(',',':'))}")
print(f'{len(reports)} layouts passed: six widths, four seats, 0–4 melds and all requested meld types.')
print(f'Kakan stack overlap measured separately: {maximum_kan_overlap}')
