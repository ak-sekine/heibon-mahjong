"""Measure rendered tile faces, backs, melds, rivers and collisions in Chromium."""
import json, os, pathlib, shutil
from playwright.sync_api import sync_playwright

widths = [(320,568),(355,812),(375,812),(390,844),(430,932),(1280,800)]
scenes = [
    ('empty', [], 3),
    ('chi', ['chi'], 3),
    ('pon', ['pon'], 3),
    ('daiminkan', ['daiminkan'], 3),
    ('ankan', ['ankan'], 3),
    ('kakan-from-direction-3', ['kakan'], 3),
    ('chi-pon', ['chi','pon'], 3),
    ('ankan-kakan', ['ankan','kakan'], 3),
    ('three-meld-mix', ['chi','pon','daiminkan'], 3),
    ('four-meld-mix', ['chi','pon','ankan','kakan'], 3),
    ('four-kan-mix', ['daiminkan','ankan','kakan','daiminkan'], 3),
    ('four-daiminkan', ['daiminkan','daiminkan','daiminkan','daiminkan'], 3),
    ('pon-from-direction-1', ['pon'], 1),
    ('pon-from-direction-2', ['pon'], 2),
    ('daiminkan-from-direction-1', ['daiminkan'], 1),
    ('daiminkan-from-direction-2', ['daiminkan'], 2),
    ('kakan-from-direction-1', ['kakan'], 1),
    ('kakan-from-direction-2', ['kakan'], 2),
]
reports = []
kakan_measurements = []
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
        page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => app.controller.newGame())")
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
            for scene, types, direction in scenes:
                page.evaluate('''({player,types,direction})=>{
                  const pool=[...base.liveWall,...base.deadWall,...base.players.flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])])];let offset=0;
                  const take=count=>{const result=pool.slice(offset,offset+count);offset+=count;return result;};
                  const melds=types.map(type=>{
                    const tiles=take(type==='chi'||type==='pon'?3:4);
                    return {type,tiles,calledTileId:type==='ankan'?'':tiles[1].id,
                      fromPlayerId:(player+direction)%4,
                      ...(type==='kakan'?{addedTileId:tiles[3].id}:{})};
                  });
                  const hand=take(13-3*types.length),drawnTile=take(1)[0],rivers=Array.from({length:4},()=>take(18));
                  const game={...base,turnPlayerId:player,phase:'awaiting-discard',players:base.players.map(p=>p.id===player
                    ? {...p,hand,drawnTile,drawnTileSource:'live-wall',melds,river:rivers[p.id]}
                    : {...p,river:rivers[p.id]})};
                  window.layoutGame=game;
                  renderer.renderTable(game,[25000,25000,25000,25000]);
                }''', {'player':player,'types':types,'direction':direction})
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
                result = page.evaluate('''({player,types,direction,baseline})=>{
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
                  const q=s=>document.querySelector(s),table=rawRect(q('#local-table')),center=rawRect(q('#local-table .center-info'));
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
                  const kakanMeld=playerMeld?.querySelector('.open-meld[data-meld-type="kakan"]')||null;
                  const calledTile=kakanMeld?.querySelector('.called-tile .tile-svg')||null;
                  const addedKanTile=kakanMeld?.querySelector('.added-kan-tile:not(.pending-kan-tile) .tile-svg')||null;
                  const addedKanNode=addedKanTile?.closest('.added-kan-tile')||null;
                  const calledNode=calledTile?.closest('.called-tile')||null;
                  const kakanGeometry=calledTile&&addedKanTile?(()=>{
                    const called=rawRect(calledTile),added=rawRect(addedKanTile);
                    const axis=player===1||player===3?'x':'y';
                    const sign=player===0?-1:1;
                    const gap=axis==='x'
                      ? sign<0?called.left-added.right:added.left-called.right
                      : sign<0?called.top-added.bottom:added.top-called.bottom;
                    const intersection=overlap(called,added);
                    const overlapArea=intersection.x*intersection.y;
                    const crossOverlap=axis==='x'?intersection.y:intersection.x;
                    const crossSize=axis==='x'?Math.min(called.height,added.height):Math.min(called.width,added.width);
                    const expectedMeld=layoutGame.players[player].melds.find(m=>m.type==='kakan');
                    const calledIndex=direction===3?0:direction===2?1:2;
                    const calledGroup=calledNode?.closest('.open-meld')||null;
                    const calledIndexOK=Boolean(calledGroup)&&[...calledGroup.children].indexOf(calledNode)===calledIndex;
                    const visible=face=>{
                      const style=getComputedStyle(face),r=rawRect(face);
                      if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0||r.width===0||r.height===0)return false;
                      for(let parent=face.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
                        const parentStyle=getComputedStyle(parent),box=rawRect(parent);
                        if(['hidden','clip','auto','scroll'].includes(parentStyle.overflowX)&&(r.left<box.left-.1||r.right>box.right+.1))return false;
                        if(['hidden','clip','auto','scroll'].includes(parentStyle.overflowY)&&(r.top<box.top-.1||r.bottom>box.bottom+.1))return false;
                      }
                      return true;
                    };
                    const meldBox=rawRect(kakanMeld);
                    const insideMeld=face=>{const r=rawRect(face);return r.left>=meldBox.left-.1&&r.top>=meldBox.top-.1&&r.right<=meldBox.right+.1&&r.bottom<=meldBox.bottom+.1;};
                    const deltaSignOK=gap>=-.05;
                    const areaZero=overlapArea===0;
                    const spacingOK=deltaSignOK&&gap<=1.05;
                    const axisOK=(player===1||player===3)?axis==='x':axis==='y';
                    const alignedOK=Math.abs(crossOverlap-crossSize)<=.15;
                    const sameSize=Math.abs(called.width-added.width)<=.15&&Math.abs(called.height-added.height)<=.15;
                    const fullFaces=visible(calledTile)&&visible(addedKanTile)&&insideMeld(calledTile)&&insideMeld(addedKanTile);
                    const correctTiles=Boolean(expectedMeld)&&calledNode?.dataset.tileId===expectedMeld.calledTileId&&addedKanNode?.dataset.tileId===expectedMeld.addedTileId;
                    const parentIsCalled=addedKanNode?.parentElement===calledNode;
                    const geometryOK=areaZero&&spacingOK&&axisOK&&alignedOK&&sameSize&&fullFaces&&correctTiles&&parentIsCalled&&calledIndexOK;
                    return {axis,sign,gap:+gap.toFixed(4),overlapX:+intersection.x.toFixed(4),overlapY:+intersection.y.toFixed(4),overlapArea:+overlapArea.toFixed(4),
                      crossOverlap:+crossOverlap.toFixed(4),crossSize:+crossSize.toFixed(4),areaZero,spacingOK,axisOK,alignedOK,sameSize,fullFaces,
                      correctTiles,parentIsCalled,calledIndexOK,geometryOK};
                  })():null;
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
                  const collisions={tilePairs:[],sameRiver:[],anyRiver:[],center:[],neighbors:[],selfVsSide:[]};
                  const record=(list,a,b,extra={})=>{const x=overlap(rawRect(a),rawRect(b));if(x.x>0&&x.y>0)list.push({a:describe(a),b:describe(b),overlapX:+x.x.toFixed(4),overlapY:+x.y.toFixed(4),...extra});};
                  for(const e of tiles){
                    const r=rawRect(e);
                    if(r.width===0||r.height===0||r.left<table.left-.1||r.top<table.top-.1||r.right>table.right+.1||r.bottom>table.bottom+.1)inside.push(describe(e));
                    if(!separate(r,center))record(collisions.center,e,q('#local-table .center-info'));
                  }
                  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
                    const a=tiles[i],b=tiles[j];
                    const x=overlap(rawRect(a),rawRect(b));
                    if(x.x===0||x.y===0)continue;
                    record(collisions.tilePairs,a,b);
                    if(owner(a)!==owner(b))record(collisions.neighbors,a,b);
                    if((owner(a)==='0'&&['1','3'].includes(owner(b)))||(owner(b)==='0'&&['1','3'].includes(owner(a))))record(collisions.selfVsSide,a,b);
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
                  const compositionOK=groups.every((group,index)=>{
                    const type=types[index],backCount=group.querySelectorAll('.concealed-kan-back').length;
                    const faceCount=group.querySelectorAll('svg').length,expected=type==='chi'||type==='pon'?3:4;
                    if(type==='kakan') {
                      const called=group.querySelector('.called-tile'),added=group.querySelector('.added-kan-tile:not(.pending-kan-tile)');
                      return group.children.length===3&&backCount===0&&faceCount===4&&called&&added&&added.parentElement===called;
                    }
                    return group.children.length===expected&&(type==='ankan'?backCount===2&&faceCount===2:backCount===0&&faceCount===expected);
                  });
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
                    kakanGeometry,
                    meldOrder:JSON.stringify(sequence)===JSON.stringify(types),meldVisualOrder:sequenceOK,
                    meldCompositionCorrect:compositionOK,
                    tableContainment:inside.length===0,outsideTableTiles:inside,
                    ownRiverClear:collisions.sameRiver.length===0,allRiversClear:collisions.anyRiver.length===0,
                    seatTilesClear:collisions.tilePairs.length===0,neighborSeatsClear:collisions.neighbors.length===0,
                    centerClear:collisions.center.length===0,selfVsCpu1Cpu3Clear:collisions.selfVsSide.length===0,
                    unexpectedOverlapCount:unexpectedHits.length,
                    unexpectedOverlapX:+Math.max(0,...unexpectedHits.map(hit=>hit.overlapX)).toFixed(2),
                    unexpectedOverlapY:+Math.max(0,...unexpectedHits.map(hit=>hit.overlapY)).toFixed(2),
                    hiddenCpuIdsProtected:hiddenClean,riverTileCount:river.length,
                    selfHandSizeUnchanged:selfSizes.every(r=>Math.abs(r.width-baseline.hand.width)<.15&&Math.abs(r.height-baseline.hand.height)<.15),
                    doraSizeUnchanged:Math.abs(dora.width-baseline.dora.width)<.15&&Math.abs(dora.height-baseline.dora.height)<.15,
                    tilePairCollisions:collisions.tilePairs,ownRiverCollisions:collisions.sameRiver,anyRiverCollisions:collisions.anyRiver,
                    neighborCollisions:collisions.neighbors,centerCollisions:collisions.center,selfSideCollisions:collisions.selfVsSide,
                    kakanMeldBCR:kakanMeld?rect(kakanMeld):null
                  };
                }''', {'player':player,'types':types,'direction':direction,'baseline':baseline})
                checks=['square','noHorizontalScroll','allTileSizesMatchRiver','allTileOrientationsMatchRiver','handSizeOK','handMeldDirection','handMeldGapOK','meldOrder','meldVisualOrder','meldCompositionCorrect','tableContainment','ownRiverClear','allRiversClear','seatTilesClear','neighborSeatsClear','centerClear','selfVsCpu1Cpu3Clear','hiddenCpuIdsProtected','selfHandSizeUnchanged','doraSizeUnchanged']
                assert result['riverTileCount']==18, f'{width}px player {player} {scene}: expected 18 close river tiles: {result}'
                assert all(result[name] for name in checks), f'{width}px player {player} {scene}: {result}'
                assert result['unexpectedOverlapCount']==0, f'{width}px player {player} {scene}: unexpected face overlap: {result}'
                if 'kakan' in types:
                    assert result['kakanGeometry'] and result['kakanGeometry']['geometryOK'], f'{width}px player {player} {scene}: added-kan face is not fully visible and adjacent to its called face: {result}'
                    kakan_measurements.append({'width':width,'player':player,'scene':scene,**result['kakanGeometry']})
                reports.append({'width':width,'height':height,'player':player,'scene':scene,**{k:result[k] for k in ['table','expectedTile','maxTileSizeDelta','maxTileOrientationDelta','handMeldGap','riverTileBCR','handBackBCR','meldTileBCR','calledTileBCR','addedKanTileBCR','kakanMeldBCR','kakanGeometry','unexpectedOverlapCount','unexpectedOverlapX','unexpectedOverlapY','selfHandSizeUnchanged','doraSizeUnchanged']}})
                if scene=='kakan-from-direction-3':
                    page.screenshot(path=str(out/f'kakan-{width}-seat{player}.png'),full_page=True)
                if width==320 and player==3 and scene=='empty':
                    page.screenshot(path=str(out/'cpu3-river-proximity-320.png'),full_page=True)
        assert not errors, f'{width}px page errors: {errors}'
        page.close()
    browser.close()

(out/'seat-kan-overlap.json').write_text(json.dumps({'layouts':reports,'kakanGeometry':kakan_measurements,'previousLayoutCpu3Overlap':previous_layout_cpu3_overlap},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
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
measurement_notice = {'layouts':len(reports),'viewports':list(viewport_metrics.values()),'kakanGeometry':{
    'count':len(kakan_measurements),
    'minimumGap':min((m['gap'] for m in kakan_measurements),default=None),
    'maximumGap':max((m['gap'] for m in kakan_measurements),default=None),
    'maximumOverlapArea':max((m['overlapArea'] for m in kakan_measurements),default=None),
    'allCorrectTiles':all(m['correctTiles'] for m in kakan_measurements),
    'allFullFacesVisible':all(m['fullFaces'] for m in kakan_measurements)
  },'previousLayoutCpu3Overlap':previous_layout_cpu3_overlap}
print(f"::notice title=Rendered tile BCR measurements::{json.dumps(measurement_notice,separators=(',',':'))}")
print(f'{len(reports)} layouts passed: six widths, four seats, 0–4 melds and all requested meld types.')
print(f"Kakan faces: {measurement_notice['kakanGeometry']['count']} pairs, {measurement_notice['kakanGeometry']['minimumGap']}–{measurement_notice['kakanGeometry']['maximumGap']}px gap, maximum overlap area {measurement_notice['kakanGeometry']['maximumOverlapArea']}px².")
