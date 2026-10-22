"""Browser checks for shared declaration bubbles on local and online tables."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'))
    for width, height in [(320, 568), (1280, 800)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE_URL)
        page.wait_for_selector('#player-hand svg')
        page.evaluate('''async()=>{
          const bubbleModule=await import('/heibon-mahjong/src/rendering/declaration-bubbles.ts');
          const riverModule=await import('/heibon-mahjong/src/rendering/river-layout.ts');
          window.bubbleTools={...bubbleModule,...riverModule};
          window.localTable=document.querySelector('#local-table');
          window.localBubbles=new bubbleModule.DeclarationBubbleRenderer(localTable);
          const localRivers=[...localTable.querySelectorAll('.river')];
          for(const river of localRivers) riverModule.applyRiverLayout(river,
            riverModule.calculateRiverLayout(river.classList.contains('river-top')?'top':
              river.classList.contains('river-right')?'right':river.classList.contains('river-left')?'left':'bottom',6));
        }''')

        for mode in ['local', 'online']:
            if mode == 'online':
                page.evaluate('''()=>{
                  document.body.classList.add('online-game-active');
                  const match=document.querySelector('#online-match');match.hidden=false;
                  const table=document.querySelector('#online-table');table.className='table';
                  table.querySelector('[data-online-summary]')?.classList.add('table-summary');
                  table.querySelector('[data-online-rivers]')?.classList.replace('online-rivers','rivers');
                  table.querySelector('[data-online-center-info]')?.classList.replace('online-center-info','center-info');
                  for(const seat of table.querySelectorAll('[data-online-seat]')){
                    seat.className=`seat seat-${seat.dataset.onlineSeat}`;
                  }
                  for(const hand of table.querySelectorAll('[data-online-hand]')) hand.classList.replace('online-concealed-hand','concealed-hand');
                  for(const melds of table.querySelectorAll('[data-online-melds]')) melds.classList.replace('online-open-melds','open-melds');
                  const rivers=[...table.querySelectorAll('[data-online-river]')];
                  for(const river of rivers){
                    const position=river.dataset.onlineRiver;
                    river.className=`river river-${position}`;
                    bubbleTools.applyRiverLayout(river,bubbleTools.calculateRiverLayout(position,6));
                  }
                  window.activeTable=table;
                  window.activeBubbles=new bubbleTools.DeclarationBubbleRenderer(table);
                }''')
            else:
                page.evaluate('''()=>{
                  document.body.classList.remove('online-game-active');
                  window.activeTable=localTable;
                  window.activeBubbles=localBubbles;
                }''')

            page.evaluate('''mode=>{
              const positions=['bottom','right','top','left'];
              const labels=['リーチ','ポン','カン','チー'];
              for(let index=0;index<4;index++){
                const seat=index;
                const position=mode==='local'?positions[index]:bubbleTools.riverPositionFor(2,seat);
                const river=mode==='local'
                  ? document.querySelector(`.river[data-player-id="${seat}"]`)
                  : document.querySelector(`[data-online-river="${position}"]`);
                activeBubbles.show(seat,['riichi','pon','kan','chi'][index],position,river);
              }
              window.bubbleLabels=labels;
            }''', mode)
            metrics = page.evaluate('''()=>{
              const rect=element=>element.getBoundingClientRect();
              const table=rect(activeTable);
              const bubbles=[...activeTable.querySelectorAll('.declaration-bubble')].map(node=>{
                const box=rect(node),style=getComputedStyle(node);
                const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
                return {label:node.textContent,seat:node.dataset.seat,classes:[...node.classList],
                  left:box.left,top:box.top,right:box.right,bottom:box.bottom,
                  within:box.left>=table.left+10&&box.top>=table.top+10&&box.right<=table.right-10&&box.bottom<=table.bottom-10,
                  fontSize:parseFloat(style.fontSize),fontWeight:style.fontWeight,writingMode:style.writingMode,
                  transform:style.transform,pointerEvents:style.pointerEvents,hitBubble:Boolean(hit?.closest('.declaration-bubble'))};
              });
              return {bubbles,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
            }''')
            assert len(metrics['bubbles']) == 4, f'{mode} {width}px should show four simultaneous seats: {metrics}'
            assert [bubble['label'] for bubble in metrics['bubbles']] == ['リーチ','ポン','カン','チー'], metrics
            assert all(bubble['within'] for bubble in metrics['bubbles']), f'{mode} bubble escaped table at {width}px: {metrics}'
            assert all(bubble['fontSize'] >= 21 and int(bubble['fontWeight']) >= 700 for bubble in metrics['bubbles']), metrics
            assert all(bubble['writingMode'] == 'horizontal-tb' and bubble['transform'] == 'none' for bubble in metrics['bubbles']), metrics
            assert all(bubble['pointerEvents'] == 'none' and not bubble['hitBubble'] for bubble in metrics['bubbles']), metrics
            assert metrics['scrollWidth'] <= metrics['viewport'], f'{mode} causes horizontal scroll at {width}px: {metrics}'
            expected_positions = ['bottom','right','top','left'] if mode == 'local' else ['top','left','bottom','right']
            actual_positions = [next(name for name in ['bottom','right','top','left'] if f'declaration-bubble-{name}' in bubble['classes']) for bubble in metrics['bubbles']]
            assert actual_positions == expected_positions, f'{mode} tail directions do not match seat positions: {metrics}'
            page.screenshot(path=str(OUT / f'declaration-bubbles-{mode}-{width}.png'))
            print(f'{mode} {width}px declaration bubbles passed: {json.dumps(metrics, ensure_ascii=False)}')
            page.evaluate('activeBubbles.clearAll()')

        page.evaluate('''()=>{
          document.body.classList.remove('online-game-active');
          document.querySelector('#online-match').hidden=true;
          const river=document.querySelector('.river[data-player-id="0"]');
          localBubbles.show(0,'riichi','bottom',river);
        }''')
        page.wait_for_timeout(1100)
        page.evaluate('''()=>{
          const river=document.querySelector('.river[data-player-id="0"]');
          localBubbles.show(0,'ron','bottom',river);
        }''')
        page.wait_for_timeout(1050)
        assert page.locator('#local-table .declaration-bubble').inner_text() == 'ロン', 'a repeated seat declaration should replace its bubble and reset the timer'
        page.wait_for_timeout(1100)
        assert page.locator('#local-table .declaration-bubble').count() == 0, 'a declaration bubble should clear two seconds after its latest declaration'
        assert not errors, f'page errors: {errors}'
        print(f'{width}px repeated declaration reset and two-second expiry passed')
        page.close()
    browser.close()
