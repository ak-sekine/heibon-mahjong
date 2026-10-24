"""Round-end summary, CPU hand reveal, and narrow-table geometry regression."""
import json
import os
import pathlib
import re
import shutil
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-round-end-ui'))
OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [(320, 568), (355, 700), (375, 667), (390, 844), (430, 932), (1280, 800)]
ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
SUMMARY_YAKU_NAMES = {
    'menzen-tsumo': '門前清自摸和',
    'yakuhai-white': '役牌：白',
    'yakuhai-green': '役牌：發',
    'yakuhai-red': '役牌：中',
    'yakuhai-seat-wind': '役牌：自風',
    'yakuhai-round-wind': '役牌：場風',
    'double-riichi': 'ダブル立直',
    'tanyao': '断么九',
    'riichi': '立直', 'ippatsu': '一発', 'pinfu': '平和', 'iipeikou': '一盃口',
    'chiitoitsu': '七対子', 'toitoi': '対々和', 'rinshan': '嶺上開花', 'chankan': '槍槓',
    'sankantsu': '三槓子', 'suukantsu': '四槓子', 'kokushi-musou': '国士無双',
}
DETAIL_YAKU_NAMES = {
    'menzen-tsumo': '門前清自摸和', 'yakuhai-white': '役牌：白', 'yakuhai-green': '役牌：發',
    'yakuhai-red': '役牌：中', 'yakuhai-seat-wind': '役牌：自風', 'yakuhai-round-wind': '役牌：場風',
    'double-riichi': 'ダブル立直', 'tanyao': '断么九', 'riichi': '立直', 'ippatsu': '一発',
    'pinfu': '平和', 'iipeikou': '一盃口', 'chiitoitsu': '七対子', 'toitoi': '対々和',
    'rinshan': '嶺上開花', 'chankan': '槍槓', 'sankantsu': '三槓子', 'suukantsu': '四槓子',
    'kokushi-musou': '国士無双',
}

with sync_playwright() as p:
    browser_type = getattr(p, ENGINE)
    launch_options = {}
    if ENGINE == 'chromium':
        launch_options['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
        launch_options['args'] = ['--no-sandbox']
    browser = browser_type.launch(**launch_options)
    reports = []
    for width, height in WIDTHS:
        mobile = ENGINE == 'webkit' and width < 500
        page = browser.new_page(viewport={'width': width, 'height': height},
                                device_scale_factor=2 if mobile else 1,
                                is_mobile=mobile, has_touch=mobile)
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
          const [matches, ron, tsumo, fixed, ronFixture, cpu, red, wall, tsumoFixture, tileSvg, tileModel, kyuushu, specialDraws] = await Promise.all([
            import('/heibon-mahjong/src/game/match.ts'),
            import('/heibon-mahjong/src/game/ron.ts'),
            import('/heibon-mahjong/src/game/tsumo.ts'),
            import('/heibon-mahjong/tests/match-fixture.ts'),
            import('/heibon-mahjong/tests/ron-fixture.ts'),
            import('/heibon-mahjong/tests/cpu-tsumo-fixture.ts'),
            import('/heibon-mahjong/tests/cpu-reveal-fixture.ts'),
            import('/heibon-mahjong/src/game/wall.ts'),
            import('/heibon-mahjong/tests/tsumo-fixture.ts'),
            import('/heibon-mahjong/src/rendering/tile-svg.ts'),
            import('/heibon-mahjong/src/model/tile.ts'),
            import('/heibon-mahjong/tests/step13-10-fixture.ts'),
            import('/heibon-mahjong/src/game/special-draws.ts'),
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
            if (name === 'haneman-tsumo') {
              const game = tsumoFixture.tsumoGame(['555m', '456p', '567s', '234s', '22p'], false, [], 'man-4');
              const declaration = game.players[0].river.at(-1);
              if (!declaration) throw new Error('Missing riichi declaration discard');
              const pre = { ...game, players: game.players.map(player => player.id === 0
                ? { ...player, riichi: { declarationTileId: declaration.id } } : player) };
              return { pre, win: tsumo.declareTsumo(pre, 0) };
            }
            if (name === 'yakuman-ron') {
              const kokushi = [['1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z']];
              const win = ronFixture.ronGame(0, [1], kokushi, 'man-1', false);
              if (win.winResult?.winMethod !== 'ron') throw new Error('Yakuman ron fixture did not resolve');
              const pre = { ...win, phase: 'awaiting-ron', winResult: null,
                ronWindow: { kind: 'discard', discarderId: win.winResult.discarderId, tileId: win.winResult.winningTileId } };
              return { pre, win };
            }
            if (name === 'ura-tsumo') {
              const pre = tsumoFixture.tsumoGame();
              const deadWall = [...pre.deadWall];
              const source = pre.players.find(player => player.id !== 0 && player.hand.some(tile => tileModel.tileKindKey(tile.tile) === 'man-1'));
              if (!source) throw new Error('Missing fixed ura indicator');
              const sourceHand = [...source.hand];
              const uraIndex = sourceHand.findIndex(tile => tileModel.tileKindKey(tile.tile) === 'man-1');
              [deadWall[5], sourceHand[uraIndex]] = [sourceHand[uraIndex], deadWall[5]];
              const declaration = pre.players[0].river.at(-1);
              if (!declaration) throw new Error('Missing riichi declaration discard');
              const riichi = { ...pre, deadWall, players: pre.players.map(player => player.id === 0
                ? { ...player, riichi: { declarationTileId: declaration.id } }
                : player.id === source.id ? { ...player, hand: sourceHand } : player) };
              return { pre, win: tsumo.declareTsumo(riichi, 0) };
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
            if (name === 'adjusted-cpu1-ron') {
              return { ...cpuRon(0, [1]), adjustment: { honba: 2, depositSticks: 3, points: [25000,24000,25000,23000] } };
            }
            if (/^cpu-meld-[0-4]$/.test(name)) {
              const meldCount = Number(name.at(-1));
              const id = [1, 2, 3, 1, 2][meldCount];
              const win = red.cpuTsumoWithMelds(id, meldCount);
              return { pre: { ...win, phase: 'awaiting-discard', winResult: null }, win, meldCount };
            }
            const shortRivers = game => ({ ...game, players: game.players.map(player => ({ ...player, river: [] })) });
            if (name === 'draw') return { pre: null, win: shortRivers(fixed.fixedRound(0, [0, 2])) };
            const drawReady = {
              'draw-0': [], 'draw-1': [3], 'draw-2': [0, 2], 'draw-3': [1, 2, 3], 'draw-4': [0, 1, 2, 3],
              'draw-self': [0], 'draw-cpu1': [1], 'draw-cpu2': [2], 'draw-cpu3': [3], 'draw-cpu-only': [1, 2, 3],
            };
            if (Object.hasOwn(drawReady, name)) {
              const game = fixed.fixedRound(0, drawReady[name]);
              return { pre: null, win: { ...game, players: game.players.map(player => ({ ...player, river: player.river.slice(0, 18) })) } };
            }
            if (name === 'four-kans') return { pre: null, win: { ...shortRivers(fixed.fixedRound(0, [0, 2])), abortiveDraw: 'four-kans', kanCount: 4 } };
            if (name === 'kyuushu') {
              const pre = kyuushu.childKyuushuGame();
              return { pre: null, win: specialDraws.declareKyuushuKyuuhai(pre, pre.turnPlayerId) };
            }
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
          const finish = (game, matchEnd = false, fill = false, adjustment = null) => {
            game = fill ? fullBoard(game) : game;
            let match = matches.startMatch(game);
            if (adjustment) match = matches.settleRound({ ...match, status: 'playing', lastSettlement: null, ...adjustment });
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
                doraHan: entry.doraHan, uraDoraHan: entry.uraDoraHan, redDoraHan: entry.redDoraHan,
                totalHanIncludingDora: entry.totalHanIncludingDora, fu: entry.fu, yakumanCount: entry.yakumanCount,
                scoreTier: entry.scoreTier, totalPoints: entry.totalPoints,
                winningTileId: entry.winningTileId })),
              settlement: match.lastSettlement ? { honba: match.lastSettlement.honba,
                depositPoints: match.lastSettlement.deposits?.points ?? 0,
                paymentPoints: match.lastSettlement.payments.reduce((sum,payment) => sum + payment.points, 0) } : null,
              tenpai: match.lastSettlement?.tenpai ?? null,
              players: game.players.map(player => ({ id: player.id, control: player.control,
                handIds: player.hand.map(tile => tile.id), drawnId: player.drawnTile?.id ?? null,
                handCount: player.hand.length + Number(player.drawnTile !== null), meldCount: player.melds?.length ?? 0,
                handLabels: [...player.hand].sort((a,b) => {
                  const order = tile => tile.tile.category === 'suited'
                    ? ['man','pin','sou'].indexOf(tile.tile.suit)*9+tile.tile.rank-1
                    : 27+['east','south','west','north','white','green','red'].indexOf(tile.tile.honor);
                  return order(a)-order(b) || a.id.localeCompare(b.id);
                }).map(tile => tileSvg.tileLabel(tile.tile)) })),
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
              if (!game && scenario.win?.phase === 'wall-exhausted') {
                game = installPlaying(scenario.win);
                return { ...report(game, 'playing'), tenpai: controller.match.lastSettlement?.tenpai ?? null };
              }
              if (!game) throw new Error(`No pre-win state for ${name}`);
              game = fill ? fullBoard(game) : game;
              installPlaying(game);
              return { ...report(game, 'playing'), meldCount: scenario.meldCount ?? 0 };
            }
            return finish(scenario.win, matchEnd || scenario.matchEnd === true, fill, scenario.adjustment ?? null);
          };
          roundTest.renderFullGeometry = (name, mode = 'pre') => roundTest.prepare(name, mode, true);
        }''')

        initial = page.evaluate('''() => {
          const game = window.roundEndTest.controller.game;
          const html = document.querySelector('main').innerHTML;
          return { hidden: game.players.slice(1).flatMap(player => [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
            .map(tile => ({id: tile.id, exposed: html.includes(tile.id)}))),
            faces: document.querySelectorAll('.concealed-hand .tile-svg').length,
            backSizes: Object.fromEntries([1,2,3].map(id => {
              const tile = document.querySelector(`.concealed-hand[data-player-id="${id}"] .tile-back`);
              const r = tile.getBoundingClientRect(); return [id, {width:r.width,height:r.height}];
            })) };
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
              const center=rect(document.querySelector('#local-table .center-info'));
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
        variants = ['human-tsumo','human-ron','yakuman-tsumo','yakuman-ron','haneman-tsumo','ura-tsumo','cpu1-tsumo','cpu2-tsumo','cpu3-tsumo',
            'cpu1-ron','cpu2-ron','cpu3-ron','double-cpu-ron','triple-cpu-ron',
            'double-mixed-ron','triple-mixed-ron','adjusted-cpu1-ron','draw','draw-0','draw-1','draw-2','draw-3','draw-4',
            'draw-self','draw-cpu1','draw-cpu2','draw-cpu3','draw-cpu-only','four-kans','kyuushu']
        variant_reports = []
        for scenario in variants:
            if scenario.startswith('draw-') or scenario in ('four-kans', 'kyuushu'):
                pre = page.evaluate('(name) => window.roundEndTest.prepare(name, "pre")', scenario)
                assert pre['status'] == 'playing' and pre['tenpai'] is None, (width, scenario, pre)
                assert page.locator('#round-result-summary').is_hidden() and page.locator('#match-result').is_hidden(), (width, scenario, 'unconfirmed result visible')
                pre_html = page.locator('main').inner_html()
                for player in pre['players'][1:]:
                    seat = page.locator(f'.concealed-hand[data-player-id="{player["id"]}"]')
                    assert seat.locator('.tile-back').count() == player['handCount'] and seat.locator('svg').count() == 0, (width, scenario, player)
                    for tile_id in player['handIds'] + ([player['drawnId']] if player['drawnId'] else []):
                        assert tile_id not in pre_html, (width, scenario, player['id'], 'pre-settlement private ID leaked')
            try:
                meta = page.evaluate('(name) => window.roundEndTest.prepare(name)', scenario)
            except Exception as error:
                raise RuntimeError(f'{width}px result scenario failed before assertions: {scenario}') from error
            assert not page.locator('#result-dialog').is_visible(), (width, scenario, 'result auto-opened')
            assert page.locator('#round-result-summary').is_visible(), (width, scenario, 'summary hidden')
            assert page.locator('#show-result').is_visible(), (width, scenario)
            assert page.locator('#next-round').is_visible() == (meta['status'] == 'round-ended'), (width, scenario, meta)
            if meta['status'] == 'round-ended' and not meta['winners']:
                fit = page.evaluate('''() => {
                  const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
                  const viewport=window.visualViewport;
                  const table=rect('#local-table'), summary=rect('#round-result-summary'), controls=rect('#local-game-controls');
                  const show=rect('#show-result'), next=rect('#next-round');
                  const visibleBottom=(viewport?.offsetTop ?? 0)+(viewport?.height ?? innerHeight);
                  return {table,summary,controls,show,next,visibleBottom,
                    square:Math.abs(table.width-table.height)<1,
                    actionsVisible:show.top>=0&&next.top>=0&&show.bottom<=visibleBottom&&next.bottom<=visibleBottom,
                    actionsBeside:Math.abs(show.top-next.top)<1&&show.right<=next.left+1,
                    belowTable:summary.top>=table.bottom-1&&controls.top>=summary.bottom-1&&show.top>=table.bottom};
                }''')
                assert fit['square'] and fit['actionsVisible'] and fit['actionsBeside'] and fit['belowTable'], (width, scenario, fit)
            if meta['winners']:
                assert page.locator('.round-win-summary').count() == len(meta['winners']), (width, scenario, meta)
                seat_names = ['自分', 'CPU1', 'CPU2', 'CPU3']
                for result in meta['winners']:
                    section = page.locator(f'.winner-result[data-winner-id="{result["winnerId"]}"]')
                    winner_summary = page.locator(f'.round-win-summary').nth(meta['winners'].index(result))
                    method = 'ツモ' if result['winMethod'] == 'tsumo' else 'ロン'
                    score = f'{result["yakumanCount"]}役満' if result['yakumanCount'] else f'{result["totalHanIncludingDora"]}翻 {result["fu"]}符'
                    expected_heading = f'{seat_names[result["winnerId"]]} {method}・{score}・{result["totalPoints"]:,}点'
                    assert winner_summary.locator('.round-summary-winner').inner_text() == expected_heading, (width, scenario, expected_heading)
                    yaku_lines = section.locator('ul').first.locator('li').all_inner_texts()
                    detail_yaku = [re.sub(r'\s+\d+(?:翻|役満)$', '', line) for line in yaku_lines]
                    assert detail_yaku == [DETAIL_YAKU_NAMES[yaku_id] for yaku_id in result['yaku']], (width, scenario, detail_yaku, result['yaku'])
                    summary_yaku = winner_summary.locator('.round-summary-yaku').inner_text()
                    expected_summary_parts = [SUMMARY_YAKU_NAMES[yaku_id] for yaku_id in result['yaku']]
                    assert summary_yaku == '・'.join(expected_summary_parts), (width, scenario, expected_summary_parts, summary_yaku)
                    assert winner_summary.evaluate('element => element.scrollWidth <= element.clientWidth'), (width, scenario, 'summary overflows horizontally')
                    assert winner_summary.locator('.round-summary-yaku').evaluate('element => element.scrollWidth <= element.clientWidth'), (width, scenario, 'yaku line overflows horizontally')
                    total = winner_summary.locator('.round-summary-value').inner_text()
                    if result['yakumanCount']:
                        assert total == f'{result["yakumanCount"]}役満' and '翻' not in total, (width, scenario, total)
                    else:
                        assert total == f'{result["totalHanIncludingDora"]}翻 {result["fu"]}符', (width, scenario, total)
                        assert f'合計：{result["totalHanIncludingDora"]}翻' in section.inner_text(), (width, scenario)
                    points = f'{result["totalPoints"]:,}点'
                    points_node = winner_summary.locator('.round-summary-points')
                    assert points_node.inner_text() == points, (width, scenario, result, points_node.inner_text())
                    detail_score = section.locator('.win-score').inner_text()
                    detail_points = re.search(r'獲得点数：.*?([\d,]+)点', detail_score)
                    assert detail_points and int(detail_points.group(1).replace(',', '')) == result['totalPoints'], (width, scenario, result, detail_score)
                    total_layout = winner_summary.locator('.round-summary-winner')
                    assert total_layout.evaluate('element => element.scrollWidth <= element.clientWidth'), (width, scenario, 'summary total overflows horizontally')
                    assert total_layout.evaluate('''element => {
                      const left=element.querySelector('.round-summary-value').getBoundingClientRect();
                      const right=element.querySelector('.round-summary-points').getBoundingClientRect();
                      return Math.abs(left.top-right.top)<1 && left.left>=element.getBoundingClientRect().left && right.right<=element.getBoundingClientRect().right;
                    }'''), (width, scenario, 'han/yakuman and points must share one line')
                    assert 'ドラ込み' not in winner_summary.inner_text(), (width, scenario)
                    assert not re.search(r'東\d局|本場|支払|供託|親連荘|親交代', winner_summary.inner_text()), (width, scenario, winner_summary.inner_text())
                cpu_winners = [result['winnerId'] for result in meta['winners'] if result['winnerId'] != 0]
                for player in meta['players'][1:]:
                    seat = page.locator(f'.concealed-hand[data-player-id="{player["id"]}"]')
                    if player['id'] in cpu_winners:
                        expected = player['handCount'] + (1 if meta['winners'][0]['winMethod'] == 'ron' else 0)
                        assert seat.locator('.revealed-tile').count() == expected, (width, scenario, player, expected)
                    else:
                        assert seat.locator('.tile-back').count() > 0 and seat.locator('svg').count() == 0, (width, scenario, player)
            else:
                expected = {'four-kans':'途中流局（四開槓）','kyuushu-kyuuhai':'途中流局（九種九牌）'}.get(meta['reason'], '流局')
                summary_lines = page.locator('#round-result-summary').locator('p').all_inner_texts()
                if meta['reason'] == 'draw':
                    names = ['自分','CPU1','CPU2','CPU3']
                    ready = [names[id] for id, value in enumerate(meta['tenpai']) if value]
                    ready_text = 'なし' if not ready else '、'.join(ready)
                    round_number = page.evaluate('window.roundEndTest.controller.match.roundNumber')
                    assert summary_lines == [f'東{round_number}局 {meta["settlement"]["honba"]}本場・流局', f'テンパイ：{ready_text}'], (width, scenario, summary_lines)
                    for player in meta['players'][1:]:
                        seat = page.locator(f'.concealed-hand[data-player-id="{player["id"]}"]')
                        if meta['tenpai'][player['id']]:
                            assert seat.locator('.revealed-tile').count() == player['handCount'], (width, scenario, player)
                            faces = seat.locator('.revealed-tile svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))')
                            assert faces == player['handLabels'], (width, scenario, player['id'], faces, player['handLabels'])
                        else:
                            assert seat.locator('.tile-back').count() == player['handCount'] and seat.locator('svg').count() == 0, (width, scenario, player)
                        for tile_id in player['handIds'] + ([player['drawnId']] if player['drawnId'] else []):
                            assert tile_id not in page.locator('main').inner_html(), (width, scenario, player['id'], 'private tile ID leaked')

                    geometry = page.evaluate('''baseline => {
                      const rect = e => { const r=e.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
                      const overlaps = (a,b) => Math.min(a.right,b.right)>Math.max(a.left,b.left)+.05 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.05;
                      const table=rect(document.querySelector('.table'));
                      const faces=[...document.querySelectorAll('.table .concealed-hand .revealed-tile')];
                      const rivers=[...document.querySelectorAll('.table .river .river-tile .tile-svg')];
                      const hands=[...document.querySelectorAll('#player-hand svg,.table .concealed-hand .tile-back,.table .concealed-hand .revealed-tile')];
                      const melds=[...document.querySelectorAll('.table .open-meld svg,.table .concealed-kan-back')];
                      const center=rect(document.querySelector('#local-table .center-info'));
                      const violations=[];
                      for(const face of faces){
                        const r=rect(face);
                        if(r.left<table.left-.5||r.right>table.right+.5||r.top<table.top-.5||r.bottom>table.bottom+.5) violations.push({kind:'outside-table',rect:r});
                        for(const river of rivers) if(overlaps(r,rect(river))) violations.push({kind:'river',rect:r,other:rect(river)});
                        for(const other of hands) if(other!==face&&!face.contains(other)&&!other.contains(face)&&overlaps(r,rect(other))) violations.push({kind:'hand',rect:r,other:rect(other)});
                        for(const meld of melds) if(overlaps(r,rect(meld))) violations.push({kind:'meld',rect:r,other:rect(meld)});
                        if(overlaps(r,center)) violations.push({kind:'center',rect:r,other:center});
                      }
                      const sizes=faces.map(face=>{const r=rect(face),id=Number(face.closest('.concealed-hand').dataset.playerId),b=baseline[id];
                        return Math.max(Math.abs(r.width-b.width),Math.abs(r.height-b.height));
                      });
                      return {noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth,
                        tileSizeMatchesBack:sizes.every(delta=>delta<.2),violations,faces:faces.length};
                    }''', initial['backSizes'])
                    assert geometry['noHorizontalScroll'] and geometry['tileSizeMatchesBack'] and not geometry['violations'], (width, scenario, geometry)
                    assert geometry['faces'] == sum(player['handCount'] for player in meta['players'][1:] if meta['tenpai'][player['id']]), (width, scenario, geometry)
                else:
                    assert summary_lines == [expected], (width, scenario, summary_lines)
                assert page.locator('#round-result-summary').locator('.round-win-summary').count() == 0
                assert '翻' not in page.locator('#round-result-summary').inner_text()
            assert not page.locator('#public-winning-hands').count(), (width, 'old CPU hand block remains')
            page.locator('#show-result').click()
            assert page.locator('#result-dialog').is_visible(), (width, scenario, 'detail did not open')
            if meta['reason'] == 'draw':
                ready_names = ['自分','CPU1','CPU2','CPU3']
                detail_hands = page.locator('#match-result .winning-hand')
                assert detail_hands.count() == sum(meta['tenpai']), (width, scenario, 'detail hand count')
                for id, is_tenpai in enumerate(meta['tenpai']):
                    hand = page.locator(f'#match-result .winning-hand[aria-label="{ready_names[id]}の流局手牌"]')
                    assert hand.count() == int(is_tenpai), (width, scenario, id, 'detail visibility')
                detail_html = page.locator('#match-result').inner_html()
                for player in meta['players'][1:]:
                    for tile_id in player['handIds'] + ([player['drawnId']] if player['drawnId'] else []):
                        assert tile_id not in detail_html, (width, scenario, player['id'], 'detail leaked tile ID')
            ron_results = [result for result in meta['winners'] if result['winMethod'] == 'ron']
            if scenario == 'adjusted-cpu1-ron':
                assert meta['settlement']['honba'] == 2 and meta['settlement']['depositPoints'] == 3000, (width, scenario, meta['settlement'])
                assert meta['settlement']['paymentPoints'] > meta['winners'][0]['totalPoints'], (width, scenario, meta)
                settlement_text = page.locator('#match-result').inner_text()
                assert '本場600点' in settlement_text and '供託：CPU1 ＋3000点' in settlement_text, (width, scenario, settlement_text)
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
            variant_reports.append({'scenario': scenario, 'winners': len(meta['winners']), 'status': meta['status'],
                'scores': [{'tier':winner['scoreTier'],'han':winner['totalHanIncludingDora'],'yakuman':winner['yakumanCount'],
                    'points':winner['totalPoints']} for winner in meta['winners']]})

        rendered_scores = [score for variant in variant_reports for score in variant['scores']]
        assert any(score['tier'] == 'mangan' and score['han'] == 5 for score in rendered_scores), (width, 'mangan not covered', rendered_scores)
        assert any(score['tier'] == 'haneman' and score['han'] == 6 for score in rendered_scores), (width, 'haneman not covered', rendered_scores)
        assert any(score['tier'] == 'yakuman' and score['points'] == 32000 for score in rendered_scores), (width, 'child yakuman ron not covered', rendered_scores)

        # Use the real Controller button once, then dispatch a second click to
        # prove the already-started transition cannot advance the same result twice.
        next_meta = page.evaluate('(name) => window.roundEndTest.prepare(name)', 'cpu1-tsumo')
        assert page.locator('#next-round').is_visible()
        assert page.locator('#round-result-summary').inner_text().find('点') >= 0
        page.locator('#next-round').click()
        after_next = page.evaluate('''() => ({status:window.roundEndTest.controller.match.status,
          roundNumber:window.roundEndTest.controller.match.roundNumber,closed:!document.querySelector('#result-dialog').open,
          summaryHidden:document.querySelector('#round-result-summary').hidden,showHidden:document.querySelector('#show-result').hidden,
          nextHidden:document.querySelector('#next-round').hidden,win:window.roundEndTest.controller.game.winResult,
          faces:document.querySelectorAll('.concealed-hand .revealed-tile').length,
          backs:[1,2,3].every(id=>document.querySelectorAll(`.concealed-hand[data-player-id="${id}"] .tile-back`).length>0)})''')
        assert after_next['status'] == 'playing' and after_next['closed'] and after_next['summaryHidden'] and after_next['showHidden'] and after_next['nextHidden'] and after_next['win'] is None and after_next['faces'] == 0 and after_next['backs'], (width, after_next)
        assert page.locator('#round-result-summary').inner_text() == '', (width, 'previous round points remain after advancing')
        page.evaluate("document.querySelector('#next-round').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        assert page.evaluate('window.roundEndTest.controller.match.roundNumber') == after_next['roundNumber'], (width, 'double progression')

        # East 4 final draw leaves the last table visible and hides next round.
        final = page.evaluate('(name) => window.roundEndTest.prepare(name, "finish", false, true)', 'match-end')
        assert final['status'] == 'match-ended' and not page.locator('#result-dialog').is_visible()
        assert not page.locator('#next-round').is_visible()
        assert page.locator('#round-result-summary').locator('p').all_inner_texts() == ['東4局 0本場・流局', 'テンパイ：CPU2']
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
