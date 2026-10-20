"""Scale and spacing regressions for riichi declaration tiles in every river."""
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

screenshots = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
screenshots.mkdir(parents=True, exist_ok=True)
widths = [(320, 568), (355, 812), (375, 812), (390, 844), (430, 932), (1280, 900)]
positions = range(18)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in widths:
        cpu2_normal_main = []
        cpu2_riichi_main = []
        cpu2_riichi_cross = []
        cpu2_line_alignment = 0
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.wait_for_selector('#player-hand svg')
        page.evaluate('''async()=>{
          window.renderer=await import('/heibon-mahjong/src/rendering/table.ts');
          window.dora=await import('/heibon-mahjong/src/game/dora.ts');
          window.base=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          window.pool=[...base.liveWall,...base.deadWall];
        }''')
        for seat in range(4):
            for position in positions:
                page.evaluate('''({seat,position})=>{
                  const river=pool.slice(seat*18,seat*18+18);
                  const shown={...base,players:base.players.map((p,id)=>({...p,
                    river:river.slice(0,18),
                    riichi:id===seat?{declarationTileId:river[position].id}:null
                  }))};
                  renderer.renderTable(shown,[25000,25000,25000,25000]);
                  window.shown=shown;
                }''', {'seat': seat, 'position': position})
                metrics = page.evaluate('''({seat,position})=>{
                  const rect=e=>e.getBoundingClientRect(), q=s=>document.querySelector(s);
                  const river=q(`main > .table .river[data-player-id="${seat}"]`), items=[...river.children];
                  const dec=river.querySelector('[data-riichi-declaration="true"]'), decSvg=dec.querySelector('svg');
                  const normalSvg=items.find(e=>e!==dec).querySelector('svg');
                  const n=rect(normalSvg), d=rect(decSvg), table=rect(q('main > .table'));
                  const close=(a,b)=>Math.abs(a-b)<.35;
                  const overlaps=(a,b)=>a.left<b.right-.1&&b.left<a.right-.1&&a.top<b.bottom-.1&&b.top<a.bottom-.1;
                  const side=river.classList.contains('river-left')||river.classList.contains('river-right');
                  const mainAxis=side?'vertical':'horizontal';
                  const svgs=items.map(e=>rect(e.querySelector('svg')));
                  const normalRowCenters=items.reduce((result,item,index)=>{
                    if(item.dataset.riichiDeclaration==='true')return result;
                    const row=item.dataset.riverRow;(result[row]??=[]).push(svgs[index].top+svgs[index].height/2);return result;
                  },{});
                  const normalRowAlignment=Math.max(0,...Object.values(normalRowCenters).map(values=>Math.max(...values)-Math.min(...values)));
                  const lineGroups=items.reduce((result,item,index)=>{
                    const line=side?item.dataset.riverColumn:item.dataset.riverRow;
                    (result[line]??=[]).push(svgs[index]);return result;
                  },{});
                  const lineOrigins=Object.values(lineGroups).map(line=>side
                    ? Math.min(...line.map(r=>r.top+r.height/2))
                    : Math.min(...line.map(r=>r.left+r.width/2)));
                  const lineOriginSpread=Math.max(...lineOrigins)-Math.min(...lineOrigins);
                  const preservesPerspectiveOrder=items.every((item,index)=>{
                    const row=Math.floor(index/6),column=index%6;
                    const screenRow=seat===1?5-column:seat===3?column:seat===2?2-row:row;
                    const screenColumn=seat===1?row:seat===3?2-row:seat===2?5-column:column;
                    return +item.dataset.riverRow===screenRow&&+item.dataset.riverColumn===screenColumn;
                  });
                  const adjacentGaps=[];
                  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
                    const ri=+items[i].dataset.riverRow, ci=+items[i].dataset.riverColumn;
                    const rj=+items[j].dataset.riverRow, cj=+items[j].dataset.riverColumn;
                    const hasDeclaration=items[i].dataset.riichiDeclaration==='true'||items[j].dataset.riichiDeclaration==='true';
                    if(ri===rj&&Math.abs(ci-cj)===1){const left=ci<cj?svgs[i]:svgs[j],right=ci<cj?svgs[j]:svgs[i];adjacentGaps.push({gap:right.left-left.right,axis:'horizontal',hasDeclaration});}
                    if(ci===cj&&Math.abs(ri-rj)===1){const top=ri<rj?svgs[i]:svgs[j],bottom=ri<rj?svgs[j]:svgs[i];adjacentGaps.push({gap:bottom.top-top.bottom,axis:'vertical',hasDeclaration});}
                  }
                  const normalMainGaps=adjacentGaps.filter(g=>g.axis===mainAxis&&!g.hasDeclaration).map(g=>g.gap);
                  const normalCrossGaps=adjacentGaps.filter(g=>g.axis!==mainAxis&&!g.hasDeclaration).map(g=>g.gap);
                  const riichiMainGaps=adjacentGaps.filter(g=>g.axis===mainAxis&&g.hasDeclaration).map(g=>g.gap);
                  const riichiCrossGaps=adjacentGaps.filter(g=>g.axis!==mainAxis&&g.hasDeclaration).map(g=>g.gap);
                  const crossSizeDelta=side?Math.abs(n.width-d.width):Math.abs(n.height-d.height);
                  const mainSizeDelta=side?Math.abs(n.height-d.height):Math.abs(n.width-d.width);
                  const riichiCrossGapExpected=1+crossSizeDelta/2;
                  const regularMainGapExpected=1+mainSizeDelta/2;
                  const regularCrossGapExpected=1;
                  const riichiMainGapExpected=1;
                  const publicIds=new Set([...document.querySelectorAll('[data-tile-id]')].map(e=>e.dataset.tileId));
                  const visibleIds=new Set([...shown.players.flatMap(p=>p.river),...shown.players.flatMap(p=>p.melds.flatMap(m=>m.tiles)),...dora.exposedDoraIndicators(shown)].map(t=>t.id));
                  const privateTiles=[...shown.players.slice(1).flatMap(p=>[...p.hand,...(p.drawnTile?[p.drawnTile]:[])]),...shown.liveWall,...shown.deadWall].filter(t=>!visibleIds.has(t.id));
                  const allRiverSvgs=[...document.querySelectorAll('main > .table .river svg')].map(rect);
                  const ratio=Math.max(n.width,n.height)/Math.min(n.width,n.height);
                  const rotatedRatio=Math.max(d.width,d.height)/Math.min(d.width,d.height);
                  const outsideViewport=[...document.querySelectorAll('body *')].map(e=>({e,r:rect(e)}))
                    .filter(({e,r})=>r.width>0&&r.height>0&&(r.left<-.5||r.right>innerWidth+.5))
                    .slice(0,12).map(({e,r})=>({tag:e.tagName,cls:e.getAttribute('class'),left:+r.left.toFixed(2),right:+r.right.toFixed(2),width:+r.width.toFixed(2)}));
                  return {
                    count:items.length,cols:river.classList.contains('river-left')||river.classList.contains('river-right')?3:6,
                    widthEqual:close(n.width,d.height),heightEqual:close(n.height,d.width),
                    rotatedAspect:close(ratio,rotatedRatio),
                    computedFaceEqual:close(parseFloat(getComputedStyle(normalSvg).width),parseFloat(getComputedStyle(decSvg).width))&&close(parseFloat(getComputedStyle(normalSvg).height),parseFloat(getComputedStyle(decSvg).height)),
                    noSvgOverlap:allRiverSvgs.every((a,i)=>allRiverSvgs.slice(i+1).every(b=>!overlaps(a,b))),
                    normalMainGaps,normalCrossGaps,riichiMainGaps,riichiCrossGaps,
                    regularMainGapExpected,regularCrossGapExpected,riichiCrossGapExpected,
                    riichiMainGapExpected,
                    lineOriginSpread:+lineOriginSpread.toFixed(3),
                    normalRowAlignment:+normalRowAlignment.toFixed(3),
                    order:items.every((e,i)=>e.dataset.tileId===shown.players[seat].river[i].id),
                    cellsSixByThree:items.length===18&&preservesPerspectiveOrder,
                    noScroll:document.documentElement.scrollWidth<=innerWidth,
                    viewport:{scrollWidth:document.documentElement.scrollWidth,innerWidth,outsideViewport},
                    inTable:allRiverSvgs.every(a=>a.left>=table.left-.2&&a.right<=table.right+.2&&a.top>=table.top-.2&&a.bottom<=table.bottom+.2),
                    privateIds:privateTiles.every(t=>!publicIds.has(t.id)&&!q('main').innerHTML.includes(t.id)),
                    decBox:{x:d.x,y:d.y,width:d.width,height:d.height},normalBox:{x:n.x,y:n.y,width:n.width,height:n.height}
                  };
                }''', {'seat':seat,'position':position})
                checks = {k:v for k,v in metrics.items() if k not in (
                    'decBox','normalBox','normalMainGaps','normalCrossGaps','riichiMainGaps',
                    'riichiCrossGaps','regularMainGapExpected','regularCrossGapExpected',
                    'riichiCrossGapExpected','riichiMainGapExpected','viewport','lineOriginSpread',
                    'normalRowAlignment'
                )}
                assert all(checks.values()), f'{width}px seat {seat} riichi {position+1}: {metrics}'
                assert metrics['lineOriginSpread']<.35, f'{width}px seat {seat} riichi {position+1} six-discard origin alignment: {metrics}'
                assert metrics['normalMainGaps'] and all(abs(g-metrics['regularMainGapExpected'])<.35 for g in metrics['normalMainGaps']), f'{width}px seat {seat} riichi {position+1} regular line spacing: {metrics}'
                assert metrics['normalCrossGaps'] and all(abs(g-metrics['regularCrossGapExpected'])<.35 for g in metrics['normalCrossGaps']), f'{width}px seat {seat} riichi {position+1} regular cross spacing: {metrics}'
                assert metrics['riichiMainGaps'] and all(abs(g-metrics['riichiMainGapExpected'])<.35 for g in metrics['riichiMainGaps']), f'{width}px seat {seat} riichi {position+1} declaration line spacing: {metrics}'
                assert metrics['riichiCrossGaps'] and all(abs(g-metrics['riichiCrossGapExpected'])<.35 for g in metrics['riichiCrossGaps']), f'{width}px seat {seat} riichi {position+1} declaration cross spacing: {metrics}'
                rowAlignmentLimit = metrics['riichiCrossGapExpected']-1+.35 if seat in (1,3) else .35
                assert metrics['normalRowAlignment']<rowAlignmentLimit, f'{width}px seat {seat} riichi {position+1} normal tile alignment: {metrics}'
                full_boxes=page.evaluate('''seat=>[...document.querySelectorAll(`.river[data-player-id="${seat}"] .river-tile`)].map(item=>{
                  const r=item.getBoundingClientRect();return [r.left,r.top,r.width,r.height];
                })''',seat)
                page.evaluate('''({seat,position})=>{
                  const partial={...shown,players:shown.players.map((p,id)=>id===seat?{...p,river:p.river.slice(0,position+1)}:p)};
                  renderer.renderTable(partial,[25000,25000,25000,25000]);
                }''',{'seat':seat,'position':position})
                partial_boxes=page.evaluate('''seat=>[...document.querySelectorAll(`.river[data-player-id="${seat}"] .river-tile`)].map(item=>{
                  const r=item.getBoundingClientRect();return [r.left,r.top,r.width,r.height];
                })''',seat)
                assert len(partial_boxes)==position+1 and all(
                    max(abs(a-b) for a,b in zip(partial,full))<.35
                    for partial,full in zip(partial_boxes,full_boxes)
                ), f'{width}px seat {seat} riichi {position+1} moved existing river tiles after later discards'
                if seat == 2:
                    cpu2_normal_main.extend(metrics['normalMainGaps'])
                    cpu2_riichi_main.extend(metrics['riichiMainGaps'])
                    cpu2_riichi_cross.extend(metrics['riichiCrossGaps'])
                    cpu2_line_alignment=max(cpu2_line_alignment,metrics['lineOriginSpread'])
                if width == 390 and position in (0, 5, 6, 11, 12, 17):
                    page.screenshot(path=str(screenshots/f'riichi-seat-{seat}-position-{position+1}.png'), full_page=True)
        print(f'{width}px CPU2 SVG gaps: fixed-slot normal={min(cpu2_normal_main):.2f}–{max(cpu2_normal_main):.2f}px; riichi line neighbors={min(cpu2_riichi_main):.2f}–{max(cpu2_riichi_main):.2f}px; riichi cross-axis={min(cpu2_riichi_cross):.2f}–{max(cpu2_riichi_cross):.2f}px; max line-origin drift={cpu2_line_alignment:.2f}px')
        print(f'{width}px riichi layout passed for all seats and declaration positions')
        page.close()
    browser.close()
