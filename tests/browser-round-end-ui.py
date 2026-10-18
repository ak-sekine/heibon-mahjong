"""Round-end summary, CPU hand reveal, and narrow-table geometry regression."""
import json
import os
import pathlib
import re
import shutil
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-round-end-ui'))
OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [(320, 568), (355, 700), (375, 812), (390, 844), (430, 932), (1280, 800)]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    reports = []
    for width, height in WIDTHS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def expose_app(route):
            response = route.fetch()
            source = response.text() + '\nwindow.roundEndTest = { controller, render };\n'
            route.fulfill(response=response, body=source)

        page.route('**/src/main.ts', expose_app)
        page.goto('http://127.0.0.1:4173/heibon-mahjong/')
        page.wait_for_selector('#player-hand svg')
        page.wait_for_function('typeof window.roundEndTest === "object"')
        page.evaluate('''async () => {
          const [matches, ron, tsumo, fixed, ronFixture, cpu, red, wall, tsumoFixture] = await Promise.all([
            import('/heibon-mahjong/src/game/match.ts'),
            import('/heibon-mahjong/src/game/ron.ts'),
            import('/heibon-mahjong/src/game/tsumo.ts'),
            import('/heibon-mahjong/tests/match-fixture.ts'),
            import('/heibon-mahjong/tests/ron-fixture.ts'),
            import('/heibon-mahjong/tests/cpu-tsumo-fixture.ts'),
            import('/heibon-mahjong/tests/cpu-reveal-fixture.ts'),
            import('/heibon-mahjong/src/game/wall.ts'),
            import('/heibon-mahjong/tests/tsumo-fixture.ts'),
          ]);
          const roundTest = window.roundEndTest;
          const { controller, render } = roundTest;
          const cpuRon = (discarder, winners) => {
            const win = ronFixture.ronGame(discarder, winners);
            if (win.winResult?.winMethod !== 'ron') throw new Error('CPU ron fixture did not resolve');
            const pre = { ...win, phase: 'awaiting-ron', winResult: null,
              ronWindow: { kind: 'discard', discarderId: win.winResult.discarderId, tileId: win.winResult.winningTileId } };
            return { pre, win };
          };
          const make = name => {
            if (name === 'human-tsumo') {
              const pre = tsumoFixture.tsumoGame();
              return { pre, win: tsumo.declareTsumo(pre, 0) };
            }
            if (name === 'yakuman-tsumo') {
              const pre = tsumoFixture.tsumoGame(['19m', '19p', '19s', '12345677z'], false, undefined, 'man-9');
              return { pre, win: tsumo.declareTsumo(pre, 0) };
            }
            if (name === 'human-ron') {
              const pre = window.roundEndModules.ronGame(1, [0]);
              return { pre, win: ron.declareRon(pre, 0) };
            }
            if (/^cpu[123]-tsumo$/.test(name)) {
              const id = Number(name[3]);
              const pre = cpu.cpuTsumoGame(id);
              return { pre, win: tsumo.declareTsumo(pre, id) };
            }
            if (/^cpu[123]-ron$/.test(name)) {
              const id = Number(name[3]);
              return cpuRon((id + 3) % 4, [id]);
            }
            if (name === 'double-cpu-ron') {
              return cpuRon(0, [1, 2]);
            }
            if (name === 'triple-cpu-ron') {
              return cpuRon(0, [1, 2, 3]);
            }
            if (name === 'double-mixed-ron') {
              const pre = window.roundEndModules.ronGame(1, [0, 2]);
              return { pre, win: ron.declareRon(pre, 0) };
            }
            if (name === 'triple-mixed-ron') {
              const pre = window.roundEndModules.ronGame(3, [0, 1, 2]);
              return { pre, win: ron.declareRon(pre, 0) };
            }
            if (/^cpu-meld-[0-4]$/.test(name)) {
              const meldCount = Number(name.at(-1));
              const id = [1, 2, 3, 1, 2][meldCount];
              const win = red.cpuTsumoWithMelds(id, meldCount);
              return { pre: { ...win, phase: 'awaiting-discard', winResult: null }, win, meldCount };
            }
            const shortRivers = game => ({ ...game, players: game.players.map(player => ({ ...player, river: [] })) });
            if (name === 'draw') return { pre: null, win: shortRivers(fixed.fixedRound(0, [0, 2])) };
            if (name === 'four-kans') return { pre: null, win: { ...shortRivers(fixed.fixedRound(0, [0, 2])), abortiveDraw: 'four-kans', kanCount: 4 } };
            if (name === 'match-end') return { pre: null, win: shortRivers(fixed.fixedRound(0, [2])), matchEnd: true };
            throw new Error(`Unknown round-end scenario ${name}`);
          };
          const fullBoard = game => {
            const winner = game.winResult?.winMethod === 'ron' ? null
              : game.winResult?.winMethod === 'tsumo' ? game.winResult.winnerId
              : game.players.find(player => player.id !== 0 && player.drawnTile)?.id;
            if (winner === null || winner === undefined || game.players[winner].control !== 'cpu') return game;
            const target = game.players[winner];
            const used = new Set([
              ...target.hand, ...(target.drawnTile ? [target.drawnTile] : []),
              ...(target.melds ?? []).flatMap(meld => meld.tiles),
              ...game.players[0].hand, ...(game.players[0].drawnTile ? [game.players[0].drawnTile] : []),
              ...game.deadWall,
            ].map(tile => tile.id));
            const available = wall.createWall().filter(tile => !used.has(tile.id));
            const players = game.players.map(player => {
              const river = available.splice(0, 18);
              if (player.id === winner || player.id === 0) return { ...player, river };
              return { ...player, hand: available.splice(0, 10), drawnTile: null, drawnTileSource: null, melds: [], river };
            });
            return { ...game, players, liveWall: available };
          };
          const installPlaying = (game, fill = false) => {
            game = fill ? fullBoard(game) : game;
            controller.match = { ...controller.match, game, roundNumber: 1, dealerId: game.dealerId,
              honba: 0, status: 'playing', lastSettlement: null, depositSticks: 0, points: [25000,25000,25000,25000] };
            render();
            return game;
          };
          const finish = (game, matchEnd = false, fill = false) => {
            game = fill ? fullBoard(game) : game;
            let match = matches.startMatch(game);
            if (matchEnd) match = matches.settleRound({ ...match, status: 'playing', lastSettlement: null,
              roundNumber: 4, dealerId: game.dealerId });
            controller.match = match;
            render();
            const result = game.winResult?.winMethod === 'ron' ? game.winResult.winners
              : game.winResult ? [game.winResult] : [];
            return {
              status: match.status, reason: match.lastSettlement?.reason ?? null,
              winners: result.map(entry => ({ winnerId: entry.winnerId, winMethod: entry.winMethod,
                discarderId: entry.winMethod === 'ron' ? entry.discarderId : null,
                yaku: entry.candidate.yaku.map(yaku => yaku.id),
                totalHanIncludingDora: entry.totalHanIncludingDora, yakumanCount: entry.yakumanCount,
                winningTileId: entry.winningTileId })),
              players: game.players.map(player => ({ id: player.id, control: player.control,
                handIds: player.hand.map(tile => tile.id), drawnId: player.drawnTile?.id ?? null,
                handCount: player.hand.length + Number(player.drawnTile !== null), meldCount: player.melds?.length ?? 0 })),
              meldCount: game.players.find(player => player.id === result[0]?.winnerId)?.melds?.length ?? 0,
            };
          };
          const report = (game, status = controller.match.status) => {
            const result = game.winResult?.winMethod === 'ron' ? game.winResult.winners
              : game.winResult ? [game.winResult] : [];
            return { status, winnerIds: result.map(entry => entry.winnerId),
              phase: game.phase, gameId: game.players[0].hand[0]?.id,
              players: game.players.map(player => ({id:player.id,control:player.control,
                handIds:player.hand.map(tile=>tile.id),drawnId:player.drawnTile?.id??null,
                handCount:player.hand.length+Number(player.drawnTile!==null)})) };
          };
          roundTest.modules = { ...matches, ...ron, ...tsumo, ...fixed, ...ronFixture, ...cpu, ...red, ...wall, ...tsumoFixture };
          window.roundEndModules = { ...fixed, ...ronFixture, ...cpu, ...ron, ...tsumo, ...red, ...tsumoFixture };
          roundTest.prepare = (name, mode = 'finish', fill = false, matchEnd = false) => {
            const scenario = make(name);
            if (mode === 'pre') {
              let game = scenario.pre;
              if (!game) throw new Error(`No pre-win state for ${name}`);
              game = fill ? fullBoard(game) : game;
              installPlaying(game);
              return { ...report(game, 'playing'), meldCount: scenario.meldCount ?? 0 };
            }
            return finish(scenario.win, matchEnd || scenario.matchEnd === true, fill);
          };
          roundTest.renderFullGeometry = (name, mode = 'pre') => roundTest.prepare(name, mode, true);
        }''')

        initial = page.evaluate('''() => {
          const game = window.roundEndTest.controller.game;
          const html = document.querySelector('main').innerHTML;
          return { hidden: game.players.slice(1).flatMap(player => [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
            .map(tile => ({id: tile.id, exposed: html.includes(tile.id)}))),
            faces: document.querySelectorAll('.concealed-hand .tile-svg').length };
        }''')
        assert initial['faces'] == 0 and all(not tile['exposed'] for tile in initial['hidden']), initial

        # Each CPU seat and all 0–4 meld counts are measured against a full,
        # unique 18-tile-per-river board at every requested viewport.
        meld_cases = []
        for meld_count in range(5):
            scenario = f'cpu-meld-{meld_count}'
            meta_pre = page.evaluate('(name) => window.roundEndTest.renderFullGeometry(name, "pre")', scenario)
            assert meta_pre['status'] == 'playing' and meta_pre['winnerIds'] == [], (width, scenario, meta_pre)
            assert page.locator('#round-result-summary').is_hidden() and page.locator('#round-result-actions').is_hidden()
            pre_html = page.locator('main').inner_html()
            for player in meta_pre['players'][1:]:
                seat = page.locator(f'.concealed-hand[data-player-id="{player["id"]}"]')
                assert seat.locator('.tile-back').count() == player['handCount'] and seat.locator('svg').count() == 0, (width, scenario, player)
                for tile_id in player['handIds'] + ([player['drawnId']] if player['drawnId'] else []):
                    assert tile_id not in pre_html, (width, scenario, player['id'], tile_id)
            baseline = page.evaluate('''() => Object.fromEntries([1,2,3].map(id => {
              const tile = document.querySelector(`.concealed-hand[data-player-id="${id}"] .tile-back`);
              if (!tile) return [id, null];
              const r = tile.getBoundingClientRect(); return [id, {width:r.width,height:r.height}];
            }))''')
            meta = page.evaluate('(name) => window.roundEndTest.renderFullGeometry(name, "finish")', scenario)
            assert meta['status'] == 'round-ended' and len(meta['winners']) == 1, (width, scenario, meta)
            winner = meta['winners'][0]['winnerId']
            assert meta['meldCount'] == meld_count, (width, scenario, meta)
            assert page.locator(f'.concealed-hand[data-player-id="{winner}"] .revealed-tile').count() == meta['players'][winner]['handCount'], (width, scenario)
            assert page.locator(f'.concealed-hand[data-player-id="{winner}"] .revealed-tile svg[aria-label^="赤"]').count() == 1, (width, scenario)
            geometry = page.evaluate('''({winner, baseline}) => {
              const rect = e => { const r=e.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
              const overlaps = (a,b) => Math.min(a.right,b.right)>Math.max(a.left,b.left)+.05 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.05;
              const table=rect(document.querySelector('.table'));
              const faces=[...document.querySelectorAll('.table .concealed-hand .revealed-tile')];
              const rivers=[...document.querySelectorAll('.table .river .river-tile .tile-svg')];
              const handTiles=[...document.querySelectorAll('#player-hand svg,.table .concealed-hand .tile-back,.table .concealed-hand .revealed-tile')];
              const meldTiles=[...document.querySelectorAll('.table .open-meld svg,.table .concealed-kan-back')];
              const center=rect(document.querySelector('.center-info'));
              const violations=[];
              for(const face of faces){
                const r=rect(face);
                if(r.left<table.left-.5||r.right>table.right+.5||r.top<table.top-.5||r.bottom>table.bottom+.5) violations.push({kind:'outside-table',seat:face.closest('.concealed-hand').dataset.playerId,rect:r});
                for(const river of rivers) if(overlaps(r,rect(river))) violations.push({kind:'river',seat:face.closest('.concealed-hand').dataset.playerId,rect:r,other:rect(river)});
                for(const other of handTiles) if(other!==face && !face.contains(other) && !other.contains(face) && overlaps(r,rect(other))) violations.push({kind:'hand',seat:face.closest('.concealed-hand').dataset.playerId,rect:r,other:rect(other)});
                for(const meld of meldTiles) if(overlaps(r,rect(meld))) violations.push({kind:'meld',seat:face.closest('.concealed-hand').dataset.playerId,rect:r,other:rect(meld)});
                if(overlaps(r,center)) violations.push({kind:'center',seat:face.closest('.concealed-hand').dataset.playerId,rect:r,other:center});
              }
              const winnerFaces=faces.filter(face=>face.closest('.concealed-hand').dataset.playerId===String(winner));
              const sizeDeltas=winnerFaces.map(face=>{const r=rect(face),b=baseline[winner];return Math.max(Math.abs(r.width-b.width),Math.abs(r.height-b.height));});
              const privacy=[1,2,3].filter(id=>id!==winner).every(id=>[...document.querySelectorAll(`.concealed-hand[data-player-id="${id}"] .tile-back`)].length>0 && !document.querySelector(`.concealed-hand[data-player-id="${id}"] svg`));
              return {square:Math.abs(table.width-table.height)<.5,noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                tileSizeMatchesBack:sizeDeltas.every(delta=>delta<.2),maxSizeDelta:Math.max(0,...sizeDeltas),
                winnersOnly:privacy,violations,publicCount:winnerFaces.length,
                rivers:[...document.querySelectorAll('.table .river')].map(river=>river.children.length)};
            }''', {'winner': winner, 'baseline': baseline})
            assert geometry['square'] and geometry['noHorizontalScroll'] and geometry['tileSizeMatchesBack'] and geometry['winnersOnly'], (width, scenario, geometry)
            assert not geometry['violations'], (width, scenario, geometry)
            assert geometry['rivers'] == [18,18,18,18], (width, scenario, geometry)
            win_html = page.locator('main').inner_html()
            for player in meta['players'][1:]:
                if player['id'] != winner:
                    for tile_id in player['handIds'] + ([player['drawnId']] if player['drawnId'] else []):
                        assert tile_id not in win_html, (width, scenario, player['id'], tile_id)
            meld_cases.append({'meldCount': meld_count, 'winner': winner, 'publicTiles': geometry['publicCount'],
                'maxTileSizeDelta': round(geometry['maxSizeDelta'], 3), 'overlaps': 0})

        # Result variants verify dynamic yaku totals, no automatic dialog,
        # repeatable table/detail toggling, flow labels, and match-end actions.
        variants = ['human-tsumo','human-ron','yakuman-tsumo','cpu1-tsumo','cpu2-tsumo','cpu3-tsumo',
            'cpu1-ron','cpu2-ron','cpu3-ron','double-cpu-ron','triple-cpu-ron',
            'double-mixed-ron','triple-mixed-ron','draw','four-kans']
        variant_reports = []
        for scenario in variants:
            try:
                meta = page.evaluate('(name) => window.roundEndTest.prepare(name)', scenario)
            except Exception as error:
                raise RuntimeError(f'{width}px result scenario failed before assertions: {scenario}') from error
            assert not page.locator('#result-dialog').is_visible(), (width, scenario, 'result auto-opened')
            assert page.locator('#round-result-summary').is_visible(), (width, scenario, 'summary hidden')
            assert page.locator('#show-result').is_visible(), (width, scenario)
            assert page.locator('#next-round').is_visible() == (meta['status'] == 'round-ended'), (width, scenario, meta)
            if meta['winners']:
                assert page.locator('.round-win-summary').count() == len(meta['winners']), (width, scenario, meta)
                for result in meta['winners']:
                    section = page.locator(f'.winner-result[data-winner-id="{result["winnerId"]}"]')
                    winner_summary = page.locator(f'.round-win-summary').nth(meta['winners'].index(result))
                    if result['winMethod'] == 'ron':
                        assert f'ロン（' in winner_summary.locator('.round-summary-winner').inner_text(), (width, scenario)
                    else:
                        assert 'ツモ' in winner_summary.locator('.round-summary-winner').inner_text(), (width, scenario)
                    yaku_lines = section.locator('ul').first.locator('li').all_inner_texts()
                    expected_yaku = [re.sub(r'\s+\d+(?:翻|役満)$', '', line) for line in yaku_lines]
                    summary_yaku = winner_summary.locator('.round-summary-yaku').inner_text()
                    assert all(name in summary_yaku for name in expected_yaku), (width, scenario, expected_yaku, summary_yaku)
                    total = winner_summary.locator('.round-summary-total').inner_text()
                    if result['yakumanCount']:
                        assert total == f'{result["yakumanCount"]}役満' and '翻' not in total, (width, scenario, total)
                    else:
                        assert total == f'合計{result["totalHanIncludingDora"]}翻（ドラ込み）', (width, scenario, total)
                        assert f'合計：{result["totalHanIncludingDora"]}翻' in section.inner_text(), (width, scenario)
                cpu_winners = [result['winnerId'] for result in meta['winners'] if result['winnerId'] != 0]
                for player in meta['players'][1:]:
                    seat = page.locator(f'.concealed-hand[data-player-id="{player["id"]}"]')
                    if player['id'] in cpu_winners:
                        expected = player['handCount'] + (1 if meta['winners'][0]['winMethod'] == 'ron' else 0)
                        assert seat.locator('.revealed-tile').count() == expected, (width, scenario, player, expected)
                    else:
                        assert seat.locator('.tile-back').count() > 0 and seat.locator('svg').count() == 0, (width, scenario, player)
            else:
                expected = '途中流局（四開槓）' if scenario == 'four-kans' else '流局'
                assert page.locator('#round-result-summary').inner_text() == expected, (width, scenario)
                assert page.locator('#round-result-summary').locator('.round-win-summary').count() == 0
                assert '翻' not in page.locator('#round-result-summary').inner_text()
            assert not page.locator('#public-winning-hands').count(), (width, 'old CPU hand block remains')
            page.locator('#show-result').click()
            assert page.locator('#result-dialog').is_visible(), (width, scenario, 'detail did not open')
            ron_results = [result for result in meta['winners'] if result['winMethod'] == 'ron']
            if ron_results:
                shared_id = ron_results[0]['winningTileId']
                id_copies = page.evaluate('''tileId => {
                  const game=window.roundEndTest.controller.game;
                  const physical=[...game.liveWall,...game.deadWall,...game.players.flatMap(player=>[
                    ...player.hand,...(player.drawnTile?[player.drawnTile]:[]),...player.river,
                    ...(player.melds??[]).flatMap(meld=>meld.tiles)])];
                  const count=selector=>[...document.querySelectorAll(selector)].filter(element=>element.dataset.tileId===tileId).length;
                  return {stateCount:physical.filter(tile=>tile.id===tileId).length,
                    stateUnique:new Set(physical.map(tile=>tile.id)).size===physical.length,
                    river:count('.river [data-tile-id]'),details:count('#win-result .winning-hand [data-tile-id]'),
                    cpuSeats:count('.concealed-hand [data-tile-id]'),main:count('main [data-tile-id]')};
                }''', shared_id)
                assert id_copies == {'stateCount':1,'stateUnique':True,'river':1,
                    'details':0,'cpuSeats':0,'main':1}, (width, scenario, id_copies)
            if meta['status'] == 'match-ended':
                assert page.locator('#result-title').inner_text() == '東風戦終了'
                assert not page.locator('#next-round').is_visible()
            page.locator('#view-table').click()
            assert not page.locator('#result-dialog').is_visible()
            assert page.locator('#round-result-summary').is_visible()
            page.locator('#show-result').click()
            assert page.locator('#result-dialog').is_visible()
            page.locator('#view-table').click()
            variant_reports.append({'scenario': scenario, 'winners': len(meta['winners']), 'status': meta['status']})

        # Use the real Controller button once, then dispatch a second click to
        # prove the already-started transition cannot advance the same result twice.
        next_meta = page.evaluate('(name) => window.roundEndTest.prepare(name)', 'human-tsumo')
        assert page.locator('#next-round').is_visible()
        page.locator('#next-round').click()
        after_next = page.evaluate('''() => ({status:window.roundEndTest.controller.match.status,
          roundNumber:window.roundEndTest.controller.match.roundNumber,closed:!document.querySelector('#result-dialog').open,
          summaryHidden:document.querySelector('#round-result-summary').hidden,showHidden:document.querySelector('#show-result').hidden,
          nextHidden:document.querySelector('#next-round').hidden,win:window.roundEndTest.controller.game.winResult})''')
        assert after_next['status'] == 'playing' and after_next['closed'] and after_next['summaryHidden'] and after_next['showHidden'] and after_next['nextHidden'] and after_next['win'] is None, (width, after_next)
        page.evaluate("document.querySelector('#next-round').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        assert page.evaluate('window.roundEndTest.controller.match.roundNumber') == after_next['roundNumber'], (width, 'double progression')

        # East 4 final draw leaves the last table visible and hides next round.
        final = page.evaluate('(name) => window.roundEndTest.prepare(name, "finish", false, true)', 'match-end')
        assert final['status'] == 'match-ended' and not page.locator('#result-dialog').is_visible()
        assert not page.locator('#next-round').is_visible()
        assert page.locator('#round-result-summary').inner_text() == '流局'
        page.locator('#show-result').click()
        assert page.locator('#result-title').inner_text() == '東風戦終了'
        assert not page.locator('#next-round').is_visible()
        page.locator('#result-new-game').click()
        page.locator('#confirm-new-game').click()
        reset = page.evaluate('''() => {
          const game=window.roundEndTest.controller.game,html=document.querySelector('main').innerHTML;
          return {status:window.roundEndTest.controller.match.status,summaryHidden:document.querySelector('#round-result-summary').hidden,
            showHidden:document.querySelector('#show-result').hidden,dialogOpen:document.querySelector('#result-dialog').open,
            faces:document.querySelectorAll('.concealed-hand .tile-svg').length,
            privateIds:game.players.slice(1).flatMap(player=>[...player.hand,...(player.drawnTile?[player.drawnTile]:[])]).every(tile=>!html.includes(tile.id))};
        }''')
        assert reset == {'status':'playing','summaryHidden':True,'showHidden':True,'dialogOpen':False,'faces':0,'privateIds':True}, (width, reset)
        assert not errors, errors
        reports.append({'viewport': [width, height], 'squareTable': True, 'meldLayouts': meld_cases,
            'roundVariants': variant_reports, 'nextRoundOnce': True, 'eastEndAndReset': True})
        page.screenshot(path=str(OUT / f'{width}-round-end.png'), full_page=True)
        page.close()
    browser.close()

(OUT / 'round-end-ui.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(reports)} viewport suites passed: {OUT}')
