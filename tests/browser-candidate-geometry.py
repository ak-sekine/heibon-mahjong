"""Issue 32: record the original operation-area baseline before every candidate screen.

--baseline observes the pre-fix TypeScript/CSS without weakening current assertions.
Both passes use real game fixtures, local/online controllers and their state factories.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
BASE_URL = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
BASELINE_SHA = '274348dc941285401ac198c88072073078a5a1d0'
VIEWPORTS = [(320, 568), (375, 560), (375, 635), (375, 634), (390, 844), (430, 932), (768, 1024),
             (1024, 768), (1280, 720), (1366, 768), (1440, 900), (1660, 825), (1920, 1080)]
SCENARIOS = [('pon-multiple', 'call-pon', 2), ('chi', 'call-chi', 5),
             ('daiminkan', 'call-kan', 0), ('ankan', 'kan-toggle', 0),
             ('opening', 'kan-toggle', 2), ('kakan', 'kan-toggle', 0),
             ('mixed-kan', 'kan-toggle', 2)]
ROOT = Path.cwd()
sys.path.insert(0, str(ROOT / 'tests'))
from browser_main_fixtures import fixed_seat_fixture
from browser_focus_assertions import tab_candidates
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', action='store_true', default=os.environ.get('HEIBON_CANDIDATE_BASELINE') == '1')
parser.add_argument('--viewport', action='append', help='Limit to one or more WxH viewport sizes.')
parser.add_argument('--mode', choices=['online', 'local'], help='Limit to one game mode.')
parser.add_argument('--scenario', choices=[scenario[0] for scenario in SCENARIOS], help='Limit to one candidate scenario.')
args = parser.parse_args()
if not args.viewport:
    args.viewport = [os.environ['HEIBON_CANDIDATE_VIEWPORT']] if os.environ.get('HEIBON_CANDIDATE_VIEWPORT') else None
if not args.mode:
    args.mode = os.environ.get('HEIBON_CANDIDATE_MODE')
if not args.scenario:
    args.scenario = os.environ.get('HEIBON_CANDIDATE_SCENARIO')
selected_viewports = VIEWPORTS if not args.viewport else [tuple(map(int, value.lower().split('x'))) for value in args.viewport]
selected_modes = (False, True) if not args.mode else (args.mode == 'online',)
selected_scenarios = SCENARIOS if not args.scenario else [item for item in SCENARIOS if item[0] == args.scenario]
OUT = Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'candidate-geometry'
OUT.mkdir(parents=True, exist_ok=True)
report = {'browser': ENGINE, 'pass': 'baseline' if args.baseline else 'current',
          'baselineSHA': BASELINE_SHA, 'measurements': [], 'result': 'running'}
REPORT_PATH = OUT / f'candidate-geometry-{report["pass"]}-{ENGINE}.json'

# Install before ActionPanel attaches listeners. This simulates Safari chrome /
# keyboard changes without resizing the layout viewport or altering the table.
VISUAL_VIEWPORT = r'''(() => {
  const viewport = new EventTarget();
  let height = null, offsetTop = 0;
  Object.defineProperties(viewport, {
    width: {get: () => innerWidth}, height: {get: () => height ?? innerHeight},
    offsetTop: {get: () => offsetTop}, offsetLeft: {get: () => 0}, scale: {get: () => 1},
    pageTop: {get: () => scrollY + offsetTop}, pageLeft: {get: () => scrollX},
  });
  Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => viewport});
  window.issue32SetVisualViewport = (nextHeight = null, nextOffset = 0) => {
    height = nextHeight; offsetTop = nextOffset;
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  };
  const geometry = online => {
    const root = document.querySelector(online ? '#online-game-controls' : '#local-game-controls');
    const panel = root?.querySelector('[data-panel-part="candidate-controls"]');
    const rect = node => node?.getBoundingClientRect().toJSON() ?? null;
    const vars = node => Object.fromEntries(['--candidate-panel-left','--candidate-panel-width',
      '--candidate-panel-bottom','--candidate-panel-available-height'].map(name => [name, {
        inline: node?.style.getPropertyValue(name) ?? '', computed: node ? getComputedStyle(node).getPropertyValue(name).trim() : '',
      }]));
    return {innerWidth, innerHeight, root: rect(root), panel: rect(panel), variables: vars(panel)};
  };
  window.issue32ResizeTrace = [];
  window.issue32ResizeTraceActive = false;
  const nativeGetBounds = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(...args) {
    const bounds = nativeGetBounds.apply(this, args);
    if (issue32ResizeTraceActive && ['online-game-controls','local-game-controls'].includes(this.id)) {
      const stack = new Error().stack ?? '';
      issue32ResizeTrace.push({phase:stack.includes('repositionCandidatePanel') ? 'action-panel-root-read' : 'root-read',
        id:this.id, innerWidth, root:{x:bounds.x,left:bounds.left,right:bounds.right,width:bounds.width,bottom:bounds.bottom},
        stack:stack.split('\n').slice(0,5)});
    }
    return bounds;
  };
  window.addEventListener('resize', () => {
    issue32ResizeTraceActive = true;
    issue32ResizeTrace.push({phase:'capture', innerWidth});
    queueMicrotask(() => issue32ResizeTrace.push({phase:'after-event-listeners', ...geometry(
      Boolean(document.querySelector('#online-game-controls [data-panel-part="candidate-controls"]:not([hidden])')))}));
    requestAnimationFrame(() => {
      issue32ResizeTrace.push({phase:'animation-frame-1', ...geometry(
        Boolean(document.querySelector('#online-game-controls [data-panel-part="candidate-controls"]:not([hidden])')))});
      requestAnimationFrame(() => issue32ResizeTrace.push({phase:'animation-frame-2', ...geometry(
        Boolean(document.querySelector('#online-game-controls [data-panel-part="candidate-controls"]:not([hidden])')))}));
    });
  }, {capture:true});
})();'''

# Main's real renderers/controllers provide the production DOM, fonts, state
# factories, countdown text, pending-action behavior and legal candidates.
MAIN_APPEND = r'''
window.issue32Geometry = { controller, online: onlineGameController, local: localActionPanel,
  render, resetLocalActionChoices,
  load: async function(mode, online) {
    const [{scenarioGame}, {callStart}, {discardTile}, {startMatch}, {createPlayerGameView}] = await Promise.all([
      import('/heibon-mahjong/src/verification/scenarios.ts'),
      import('/heibon-mahjong/tests/calls-fixture.ts'),
      import('/heibon-mahjong/src/game/discard.ts'),
      import('/heibon-mahjong/src/game/match.ts'),
      import('/heibon-mahjong/src/online/game-view.ts'),
    ]);
    this.online.receive({type:'online-rematch-preparing'});
    this.local.clear(); controller.clearGame(); resetLocalActionChoices();
    let game;
    if (mode === 'chi') {
      const start=callStart(3,{0:['23m','444m','50m','6m','789p','12z']},'man-4');
      game=discardTile(start,3,start.players[3].drawnTile.id);
    } else if (mode === 'mixed-kan') {
      const {kanGame}=await import('/heibon-mahjong/src/verification/kan-fixture.ts');
      game=kanGame({hands:{0:['1111m','234p','67s','2z']},
        melds:{0:[{type:'pon',group:'111z'}]},draw:'east',rinshan:['south']});
    } else game=scenarioGame(mode);
    game={...game,players:game.players.map((player,seat)=>({...player,control:seat?'cpu':'human'}))};
    this.game=game; this.match=startMatch(game); this.sent=[];
    if (!online) {controller.match=this.match;controller.selectedTileId=null;render();return;}
    const revision=++this.revision, now=Date.now();
    const identities=[0,1,2,3].map(seat=>({seat,name:seat?'CPU'+seat:'自分',control:seat?'cpu':'human',connected:true}));
    const decision=game.phase==='awaiting-call'?{windowId:'geometry-'+revision,type:'call',openedAt:now,
      expiresAt:now+600000,baseGameRevision:revision,requiredSeats:[0],responses:{0:'pending'}}:null;
    const session={schemaVersion:1,gameRevision:revision,match:this.match,status:'playing',identities,
      hostSeat:0,decision,declarations:[]};
    this.online.setActionSender((action,revision,requestId)=>{this.sent.push({action,revision,requestId});return true;});
    this.online.receive({type:'game-started',view:createPlayerGameView(session,0,'GEOM32',new Set([0]))});
  }, revision:0,
  fingerprint: function(online) {return JSON.stringify(online?this.online.view:controller.game);},
};
'''


def save():
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def settle(page):
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


def snapshot(page, online):
    return page.evaluate(r'''online=>{
      const root=document.querySelector(online?'#online-game-controls':'#local-game-controls');
      const part=name=>root.querySelector(`[data-panel-part="${name}"]`);
      const rect=node=>node.getBoundingClientRect().toJSON();
      const visible=node=>Boolean(node&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
      const target=node=>{const r=rect(node),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {...r,enabled:!node.disabled,hit:hit===node||node.contains(hit),
          inViewport:r.top>=visualViewport.offsetTop-.5&&r.bottom<=visualViewport.offsetTop+visualViewport.height+.5};};
      const panel=part('candidate-controls'), list=part('candidate-options');
      return {root:rect(root),callRect:visible(part('call-controls'))?rect(part('call-controls')):null,
        table:rect(document.querySelector(online?'#online-table':'#local-table')),
        panel:visible(panel)?rect(panel):null,back:visible(panel)?target(part('candidate-back')):null,
        candidates:[...list.querySelectorAll('button')].map(target),
        normalHidden:part('normal-controls').hidden,callHidden:part('call-controls').hidden,
        visibleNormalButtons:[...part('normal-controls').querySelectorAll('button')].filter(visible).length,
        list:{clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollTop:list.scrollTop,
          overflow:getComputedStyle(list).overflowY},
        panelVariables:Object.fromEntries(['--candidate-panel-left','--candidate-panel-width',
          '--candidate-panel-bottom','--candidate-panel-available-height'].map(name=>[name,{
            inline:panel.style.getPropertyValue(name), computed:getComputedStyle(panel).getPropertyValue(name).trim()}])),
        scrollY,visual:{height:visualViewport.height,offsetTop:visualViewport.offsetTop},
        layoutViewport:{width:innerWidth,height:innerHeight},
        rootMinHeight:getComputedStyle(root).minHeight,
        rootFrame:getComputedStyle(root,'::before').display,
        frame: Object.fromEntries(['backgroundColor','borderTopColor','borderTopWidth','borderRadius'].map(key=>
          [key,getComputedStyle(panel.hidden?root:panel,'::before')[key]])),
      };
    }''', online)


def check(record, condition, message):
    if condition:
        return
    record.setdefault('violations', []).append(message)
    save()
    if not args.baseline:
        print('::error title=Issue 32 geometry evidence::' + json.dumps(record, ensure_ascii=False, separators=(',', ':')))
        raise AssertionError(f'{record["viewport"]} {record["mode"]} {record["scenario"]}: {message}; measurements={record}')


def same_rect(record, before, after, label, tolerance=1):
    for key in ('x', 'y', 'width', 'height'):
        check(record, abs(before[key] - after[key]) < tolerance,
              f'{label}.{key} changed {before[key]} -> {after[key]}')


def click_part(page, online, part, record):
    selector = ('#online-game-controls' if online else '#local-game-controls') + f' [data-panel-part="{part}"]'
    target = page.locator(selector).evaluate(r'''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {x:r.x+r.width/2,y:r.y+r.height/2,top:r.top,bottom:r.bottom,ok:hit===node||node.contains(hit),disabled:node.disabled};}''')
    # Mouse coordinates avoid Playwright's implicit scrollIntoView, which can
    # otherwise hide an initial layout failure before we measure it.
    check(record, target['ok'] and not target['disabled'] and target['top'] >= -.5 and
          target['bottom'] <= page.viewport_size['height'] + .5, f'{part} was not initially operable: {target}')
    if args.baseline and not target['ok']:
        page.locator(selector).evaluate('node=>node.click()')
    else:
        page.mouse.click(target['x'], target['y'])
    settle(page)


def verify_open(record, before, after):
    check(record, after['panel'] is not None, 'candidate panel did not open')
    if not after['panel']:
        return
    delta = after['panel']['bottom'] - before['root']['bottom']
    record['bottomDelta'] = delta
    record['visibleCallBottomDelta'] = (after['panel']['bottom'] - before['callRect']['bottom']
                                        if before['callRect'] else None)
    check(record, abs(delta) <= 2, f'candidate bottom moved from original root bottom by {delta}px')
    for key in ('left', 'right', 'width'):
        check(record, abs(before['root'][key] - after['panel'][key]) <= 1,
              f'candidate {key} differs from common operation frame')
    check(record, after['rootFrame'] == 'none', 'reserved area still paints a frame')
    check(record, before['frame'] == after['frame'], 'candidate frame decoration differs')
    same_rect(record, before['root'], after['root'], 'reserved operation area')
    same_rect(record, before['table'], after['table'], 'table')
    check(record, after['scrollY'] == before['scrollY'], 'opening candidates changed scrollY')
    check(record, after['normalHidden'] and after['callHidden'] and not after['visibleNormalButtons'],
          'ordinary/type controls remained visible')
    check(record, after['back']['inViewport'] and after['back']['hit'] and after['back']['enabled'],
          'Back is outside the visible viewport or covered')
    check(record, all(item['inViewport'] and item['hit'] and item['enabled'] for item in after['candidates']),
          'candidate is outside the visible viewport or covered')
    check(record, after['panel']['top'] < before['root']['top'], 'candidate did not expand above the original operation area')


def exercise(page, width, height, scenario, trigger, expected_count, online):
    record = {'viewport': f'{width}x{height}', 'mode': 'online' if online else 'local', 'scenario': scenario}
    report['measurements'].append(record)
    save()
    page.evaluate('issue32SetVisualViewport()')
    page.evaluate('({scenario,online})=>issue32Geometry.load(scenario,online)', {'scenario': scenario, 'online': online})
    settle(page)
    record['before'] = before = snapshot(page, online)
    page.screenshot(path=str(OUT / f'{ENGINE}-{width}x{height}-{record["mode"]}-{scenario}-before.png'))
    check(record, before['scrollY'] == 0, 'normal-size scenario started after page scrolling')
    if before['callRect']:
        check(record, before['callRect']['top'] >= before['root']['top'] and
              before['callRect']['bottom'] <= before['root']['bottom'] + 1,
              'visible call operation area is outside the measured root baseline')
    fingerprint = page.evaluate('online=>issue32Geometry.fingerprint(online)', online)
    if scenario in ('ankan', 'kakan', 'opening', 'mixed-kan'):
        unchanged = page.evaluate('''online=>{
          const t=issue32Geometry;
          const signature=melds=>JSON.stringify(melds.map(m=>[m.type,m.tiles.map(t=>t?.id ?? null)]));
          return signature(online ? t.online.view.seats[0].melds : t.controller.game.players[0].melds) ===
            signature(t.game.players[0].melds);
        }''', online)
        check(record, unchanged, 'kan executed before button press')
    if args.baseline and scenario in ('ankan', 'kakan'):
        expected_count = 1
    click_part(page, online, trigger, record)
    record['open'] = after = snapshot(page, online)
    page.screenshot(path=str(OUT / f'{ENGINE}-{width}x{height}-{record["mode"]}-{scenario}-open.png'))
    save()
    if expected_count == 0:
        check(record, not after['panel'] and not after['candidates'], 'single candidate must execute without a candidate screen')
        same_rect(record, before['table'], after['table'], 'table after immediate selection')
        check(record, after['scrollY'] == before['scrollY'], 'immediate selection changed scrollY')
        record['immediateExecution'] = True
        if online:
            sent = page.evaluate('issue32Geometry.sent')
            check(record, len(sent) == 1, 'single candidate did not send exactly one action')
            expected_action = 'declare-call' if scenario == 'daiminkan' else 'declare-kan'
            check(record, sent[0]['action']['type'] == expected_action, 'wrong immediate action')
            legal_id = page.evaluate('''scenario=>{
              const v=issue32Geometry.online.view;
              return scenario==='daiminkan'?v.self.callOptions.find(o=>o.type===scenario)?.id:
                v.self.kanOptions.find(o=>o.type===scenario)?.id;
            }''', scenario)
            check(record, sent[0]['action']['optionId'] == legal_id, 'immediate action lost the legal option ID')
            root = '#online-game-controls'
            page.locator(root + f' [data-panel-part="{trigger}"]').evaluate('node=>{node.click();node.click()}')
            check(record, len(page.evaluate('issue32Geometry.sent')) == 1, 'pending immediate selection executed twice')
            if scenario in ('ankan', 'kakan'):
                # The waiting-room timeout path blocks input while synchronizing;
                # state confirmation releases the same request without a retry.
                page.evaluate("""()=>issue32Geometry.online.receive({type:'game-connection-state',ready:false,
                  message:'対局状態を同期しています。操作結果を確認するまでお待ちください。'})""")
                check(record, page.locator('#online-kan').is_disabled(), 'timeout synchronization allowed another kan')
                page.evaluate("""()=>{
                  const t=issue32Geometry;
                  t.online.receive({type:'game-action-state-confirmed',requestId:t.sent[0].requestId});
                  t.online.receive({type:'game-connection-state',ready:true});
                }""")
                check(record, len(page.evaluate('issue32Geometry.sent')) == 1, 'state confirmation retried automatically')
                check(record, page.locator('#online-kan').is_enabled(), 'state confirmation did not restore Kan')
                click_part(page, True, trigger, record)
                page.evaluate("""()=>{
                  const t=issue32Geometry;
                  t.online.receive({type:'game-action-result',requestId:t.sent.at(-1).requestId,ok:false});
                }""")
                check(record, len(page.evaluate('issue32Geometry.sent')) == 2, 'rejection retried automatically')
                check(record, page.locator('#online-kan').is_enabled(), 'rejection did not restore Kan')
                # Failure to hand the action to the transport also recovers.
                page.evaluate("""()=>issue32Geometry.online.setActionSender((action,revision,requestId)=>{
                  issue32Geometry.sent.push({action,revision,requestId});return false;
                })""")
                click_part(page, True, trigger, record)
                check(record, len(page.evaluate('issue32Geometry.sent')) == 3, 'send failure retried automatically')
                check(record, page.locator('#online-kan').is_enabled(), 'send failure did not restore Kan')
                check(record, snapshot(page, True)['panel'] is None, 'recovery opened a candidate panel')
                record['recovery'] = ['pending-double-click', 'timeout-sync', 'state-confirmed', 'rejection', 'send-failed']
        else:
            page.wait_for_function("""scenario=>issue32Geometry.controller.game.players[0].melds.some(m=>m.type===scenario)""", arg=scenario)
            if scenario in ('ankan', 'kakan'):
                check(record, page.evaluate('issue32Geometry.controller.game.kanCount') == 1, 'immediate kan did not execute exactly once')
        return
    check(record, len(after['candidates']) == expected_count, f'expected {expected_count} candidate buttons')
    verify_open(record, before, after)
    if not after['panel']:
        return
    root_selector = '#online-game-controls' if online else '#local-game-controls'

    if not args.baseline and (width, height) in ((320, 568), (390, 844), (1280, 720)):
        tab_candidates(page, root_selector)
        check(record, page.evaluate('online=>issue32Geometry.fingerprint(online)', online) == fingerprint,
              'keyboard focus changed game state')
        check(record, not page.evaluate('issue32Geometry.sent'), 'keyboard focus sent an action')
        record['keyboardFocus'] = 'all candidates and Back: Tab order, name, focus-visible, clipping, no action'

    # Resize the layout viewport, then recover the original table and baseline.
    page.evaluate('issue32ResizeTrace.splice(0); issue32ResizeTraceActive=false')
    page.set_viewport_size({'width': width + 24, 'height': height})
    record['windowResizeImmediately'] = snapshot(page, online)
    settle(page)
    resized = snapshot(page, online)
    record['windowResized'] = resized
    record['windowResizeTrace'] = page.evaluate('issue32ResizeTrace.splice(0)')
    check(record, any(item['phase'] == 'capture' for item in record['windowResizeTrace']),
          'window resize event was not observed')
    check(record, any(item['phase'] == 'after-event-listeners' for item in record['windowResizeTrace']),
          'window resize listeners did not complete')
    for key in ('left', 'right', 'width'):
        check(record, abs(resized['root'][key] - resized['panel'][key]) <= 1,
              f'window resize lost common {key}')
    record['windowResizeActionPanelReads'] = [item for item in record['windowResizeTrace']
      if item['phase'] == 'action-panel-root-read']
    for key, actual in [('left', 'x'), ('width', 'width')]:
      value = resized['panelVariables']['--candidate-panel-' + key]['inline']
      try:
        measured = float(value.removesuffix('px'))
      except ValueError:
        measured = float('inf')
      check(record, abs(measured - resized['root'][actual]) <= 0.5,
            f'window resize left stale --candidate-panel-{key}: {value}; root {actual}={resized["root"][actual]}')
    check(record, abs(resized['panel']['bottom'] - before['root']['bottom']) <= 2,
          'window resize lost candidate bottom anchor')
    page.set_viewport_size({'width': width, 'height': height})
    record['windowRestoreImmediately'] = snapshot(page, online)
    settle(page)
    recovered = snapshot(page, online)
    record['windowRestoreTrace'] = page.evaluate('issue32ResizeTrace.splice(0)')
    page.evaluate('issue32ResizeTraceActive=false')
    for key, actual in [('left', 'x'), ('width', 'width')]:
      value = recovered['panelVariables']['--candidate-panel-' + key]['inline']
      try:
        measured = float(value.removesuffix('px'))
      except ValueError:
        measured = float('inf')
      check(record, abs(measured - recovered['root'][actual]) <= 0.5,
            f'viewport restoration left stale --candidate-panel-{key}: {value}; root {actual}={recovered["root"][actual]}')
    for key in ('left', 'right', 'width'):
      check(record, abs(recovered['root'][key] - recovered['panel'][key]) <= 1,
            f'viewport restoration lost common {key}')
    check(record, abs(recovered['panel']['bottom'] - before['root']['bottom']) <= 2,
          'window resize restoration lost bottom anchor')
    same_rect(record, before['table'], recovered['table'], 'table after resize restoration')
    print('::notice title=Issue 32 resize evidence::' + json.dumps({
      'browser':ENGINE,'viewport':record['viewport'],'mode':record['mode'],'scenario':record['scenario'],
      'before':{'root':before['root'],'panel':before['panel'],'variables':before['panelVariables'],'table':before['table']},
      'immediate':{'root':record['windowResizeImmediately']['root'],'panel':record['windowResizeImmediately']['panel'],
        'variables':record['windowResizeImmediately']['panelVariables']},
      'stable':{'root':resized['root'],'panel':resized['panel'],'variables':resized['panelVariables'],
        'trace':record['windowResizeTrace'],'actionPanelRootReads':record['windowResizeActionPanelReads']},
      'restored':{'root':recovered['root'],'panel':recovered['panel'],'variables':recovered['panelVariables'],
        'table':recovered['table'],'trace':record['windowRestoreTrace']},
    },ensure_ascii=False,separators=(',',':')))

    # Add visual rows without inventing selectable game actions. Real options
    # remain unchanged and confirmation below always clicks an actual button.
    page.locator(root_selector + ' [data-panel-part="candidate-options"]').evaluate(r'''list=>{
      const template=list.querySelector('button');
      for(let i=0;i<200;i++){const clone=template.cloneNode(true);clone.dataset.geometryOverflow='true';list.append(clone);}
    }''')
    settle(page)
    record['grown'] = grown = snapshot(page, online)
    check(record, abs(grown['panel']['bottom'] - before['root']['bottom']) <= 2, 'extra candidate rows moved the bottom')
    check(record, grown['panel']['height'] > after['panel']['height'] and grown['panel']['top'] < after['panel']['top'],
          'extra rows did not grow upward')
    same_rect(record, before['root'], grown['root'], 'reserved area during growth')
    same_rect(record, before['table'], grown['table'], 'table during growth')
    check(record, grown['list']['overflow'] == 'auto' and grown['list']['scrollHeight'] > grown['list']['clientHeight'],
          'long list does not scroll internally')
    page.locator(root_selector + ' [data-panel-part="candidate-options"]').evaluate('list=>list.scrollTop=list.scrollHeight')
    settle(page)
    scrolled = snapshot(page, online)
    record['internallyScrolled'] = scrolled
    check(record, scrolled['list']['scrollTop'] > 0 and scrolled['candidates'][-1]['hit'] and scrolled['back']['hit'],
          'last row/Back cannot be reached by internal scroll')
    check(record, scrolled['scrollY'] == before['scrollY'], 'internal scrolling changed page scrollY')
    page.locator(root_selector + ' [data-panel-part="candidate-options"]').evaluate(r'''list=>{
      list.querySelectorAll('[data-geometry-overflow]').forEach(node=>node.remove());list.scrollTop=0;
    }''')
    settle(page)

    # Shrink only the visual viewport, including a nonzero Safari offset.
    visual_bottom = before['root']['bottom'] - 64
    page.evaluate('bottom=>issue32SetVisualViewport(bottom-20,20)', visual_bottom)
    settle(page)
    record['visualViewportChanged'] = changed = snapshot(page, online)
    expected_bottom = min(before['root']['bottom'], visual_bottom - 8)
    check(record, abs(changed['panel']['bottom'] - expected_bottom) <= 2, 'visual viewport change did not make the minimal bottom adjustment')
    check(record, changed['panel']['top'] >= 27.5 and changed['back']['inViewport'] and changed['back']['hit'],
          'visual viewport change left panel/Back outside the usable area')
    same_rect(record, before['root'], changed['root'], 'reserved area after visual viewport change')
    same_rect(record, before['table'], changed['table'], 'table after visual viewport change')
    check(record, changed['scrollY'] == before['scrollY'], 'visual viewport change scrolled the page')
    page.evaluate('issue32SetVisualViewport()')
    settle(page)
    record['visualViewportRestored'] = restored_viewport = snapshot(page, online)
    check(record, abs(restored_viewport['panel']['bottom'] - before['root']['bottom']) <= 2,
          'restoring visual viewport did not restore original bottom')

    # A visual viewport can pan below the saved baseline (for example after
    # zoom/keyboard changes). Retain room for one real candidate row and Back,
    # moving the bottom downward only by the minimum required distance.
    minimum_panel_height = page.locator(root_selector + ' [data-panel-part="candidate-controls"]').evaluate(r'''panel=>{
      const s=getComputedStyle(panel), candidate=panel.querySelector('[data-panel-part="candidate-options"] button'),
        back=panel.querySelector('[data-panel-part="candidate-back"]');
      const listStyle=getComputedStyle(candidate.parentElement);
      return candidate.getBoundingClientRect().height + back.getBoundingClientRect().height +
        parseFloat(listStyle.paddingTop) + parseFloat(listStyle.paddingBottom) +
        parseFloat(s.rowGap) + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) +
        parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
    }''')
    large_offset = before['root']['bottom'] + 8
    if height - large_offset >= minimum_panel_height + 16:
        page.evaluate('({height,offset})=>issue32SetVisualViewport(height-offset,offset)',
                      {'height': height, 'offset': large_offset})
        settle(page)
        record['largeVisualViewportOffset'] = large = snapshot(page, online)
        record['minimumCandidatePanelHeight'] = minimum_panel_height
        minimum_bottom = large_offset + 8 + minimum_panel_height
        check(record, abs(large['panel']['bottom'] - minimum_bottom) <= 2,
              'large visual offset did not apply the minimum downward adjustment')
        check(record, large['panel']['top'] >= large_offset + 7.5 and large['back']['inViewport'] and large['back']['hit'],
              'large visual offset clipped the candidate panel or Back')
        check(record, any(item['inViewport'] and item['hit'] for item in large['candidates']),
              'large visual offset left no candidate row operable')
        same_rect(record, before['root'], large['root'], 'reserved area after large visual offset')
        same_rect(record, before['table'], large['table'], 'table after large visual offset')
        check(record, large['scrollY'] == before['scrollY'], 'large visual viewport offset scrolled the page')
        page.evaluate('issue32SetVisualViewport()')
        settle(page)
        record['largeVisualViewportOffsetRestored'] = large_restored = snapshot(page, online)
        check(record, abs(large_restored['panel']['bottom'] - before['root']['bottom']) <= 2,
              'restoring large visual offset did not recover the original bottom')
    else:
        record['largeVisualViewportOffset'] = {'skipped': 'remaining visible region cannot fit one candidate row and Back',
                                              'offsetTop': large_offset, 'availableHeight': height-large_offset,
                                              'requiredHeight': minimum_panel_height+16}

    click_part(page, online, 'candidate-back', record)
    record['back'] = back = snapshot(page, online)
    check(record, back['panel'] is None, 'Back did not close the candidate screen')
    same_rect(record, before['root'], back['root'], 'restored operation area')
    same_rect(record, before['table'], back['table'], 'table after Back')
    check(record, back['scrollY'] == before['scrollY'], 'Back changed scrollY')
    check(record, page.evaluate('online=>issue32Geometry.fingerprint(online)', online) == fingerprint, 'Back mutated the game')
    if online:
        check(record, not page.evaluate('issue32Geometry.sent'), 'Back sent a game action')
        # Confirm through the real online ActionSender, then try the same DOM
        # button again synchronously: only the first action may be transmitted.
        click_part(page, online, trigger, record)
        page.locator(root_selector + ' [data-panel-part="candidate-options"] button').first.evaluate('node=>{node.click();node.click()}')
        settle(page)
        record['sentActions'] = page.evaluate('issue32Geometry.sent')
        check(record, len(record['sentActions']) == 1, 'online candidate confirmation executed twice')
    save()


baseline_path = ROOT / 'src/ui/issue32-baseline-action-panel.ts'
baseline_created = False
try:
    old_css = None
    if args.baseline:
        if baseline_path.exists():
            raise RuntimeError(f'Unexpected existing baseline source: {baseline_path}')
        baseline_path.write_bytes(subprocess.check_output(['git', 'show', f'{BASELINE_SHA}:src/ui/action-panel.ts']))
        baseline_created = True
        old_css = subprocess.check_output(['git', 'show', f'{BASELINE_SHA}:src/style.css'], text=True)
    with sync_playwright() as p:
        browser = getattr(p, ENGINE).launch()
        try:
            for width, height in selected_viewports:
                page = browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script(VISUAL_VIEWPORT)

                def expose_main(route):
                    response = route.fetch()
                    route.fulfill(response=response, body=fixed_seat_fixture(response.text()) + MAIN_APPEND)

                page.route('**/src/main.ts', expose_main)
                if args.baseline:
                    def baseline_action_panel(route):
                        response = route.fetch(url=BASE_URL + 'src/ui/issue32-baseline-action-panel.ts')
                        route.fulfill(response=response)
                    page.route('**/src/ui/action-panel.ts', baseline_action_panel)
                page.goto(BASE_URL)
                page.wait_for_function('Boolean(window.issue32Geometry)')
                if args.baseline:
                    page.evaluate(r'''()=>{
                      document.querySelectorAll('style[data-vite-dev-id]').forEach(node=>{
                        if(node.dataset.viteDevId.endsWith('/src/style.css'))node.remove();
                      });
                    }''')
                    page.add_style_tag(content=old_css)
                for online in selected_modes:
                    for scenario, trigger, count in selected_scenarios:
                        exercise(page, width, height, scenario, trigger, count, online)
                if errors:
                    raise AssertionError(f'{width}x{height}: page errors: {errors}')
                print(f'{ENGINE} {width}x{height}: candidate geometry {report["pass"]} recorded', flush=True)
                page.close()
        finally:
            browser.close()
    report['result'] = 'observed' if args.baseline else 'passed'
except Exception as error:
    report['result'] = 'failed'
    report['error'] = str(error)
    raise
finally:
    save()
    if baseline_created and baseline_path.exists():
        baseline_path.unlink()
    print(f'Issue 32 candidate geometry: {REPORT_PATH}', flush=True)
