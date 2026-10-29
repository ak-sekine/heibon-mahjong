# Issue #7 Browser UI失敗の原因調査 — 2026-10-29

[Issue #7](https://github.com/ak-sekine/heibon-mahjong/issues/7)の原因調査の完了記録。前回調査の基準、および記録作成開始時にfetchしたmainは `eaebe5f735b9fd2acf7cbe12859167d1d7bc0dde`。以下の反復結果は前回Codexが隔離コピーで実施した結果であり、文書作成時に再実行したものではない。過去CIの内部状態を完全に復元したわけではない。

調査A（オンライン結果画面から東2局への待機）と調査B（オンラインCPU手番進行）は別原因で、いずれも既存修正がmainにある。ゲーム本体の停止は両調査の直接原因として確認されていない。これはBrowser UI全体の恒久的な安定性を保証するものではない。

## 対象Actions

| 対象 | run | 結果・範囲 |
| --- | --- | --- |
| A | [40317932010](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40317932010) | `70173e7450f2f56e151ef18e34a95ccc5d5048c4`、Browser UIの `browser-online-waiting-room.py` で東2局待ち失敗。npm testとbuildは成功。 |
| A 比較 | [40315925328](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40315925328) | `3004ead02eb84703323925713596320dd75e7721`、結果画面待ちで失敗。 |
| B Deploy #356 | [40737437464](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40737437464) | `255fa05c67e4f1b84f1527654ff91d0f31170d92`、Browser UI job内の `npm test` で対象サブテスト失敗。verifyは成功。 |
| B 同一SHA Browser UI #264 | [40737436924](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40737436924) | 同じ `255fa05c67e4f1b84f1527654ff91d0f31170d92`、Browser UI成功。 |
| Issue #20最終検証 | [40876987847](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40876987847) | `d0dc154a0b0657dbfac7a916008fc7836f21c146`、成功。Chromium 32件・WebKit 18件を含む。詳細は[既存記録](offline-rules-2026-10-29.md)。 |
| docs-only CI | [40887474017](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40887474017) | `eaebe5f735b9fd2acf7cbe12859167d1d7bc0dde`、docs-check成功、verify・Browser UIはskip。文書用の確認であり、ゲームやBrowser UIの再検証成功を意味しない。 |

過去のrunの記録は[CPU手番診断](cpu-turn-render-diagnostics-2026-10-26.md)と[CI性能調査](ci-performance-2026-10-28.md)にも残す。

## 調査A：次局mockの初期化漏れ

`tests/browser-online-waiting-room.py` は結果画面から次局へ進み、`document.querySelector('#online-table-round').innerText.includes('東2局')` が30秒以内に成立するのを待った。次局mockは局数と河を初期化したが `declarationIndexes` に前局のリーチ状態を残していた。東2局・`playing`・空の河で、存在しないリーチ宣言牌を参照する不整合となり、描画時に `RangeError: Riichi declaration tile reference is missing from online seat 0` が発生する経路を確認した。局表示更新前に描画が止まるため、待機時間の延長では解決しない。

[25fcf3fc9c71f4259404b50ed21095f86a01deb9](https://github.com/ak-sekine/heibon-mahjong/commit/25fcf3fc9c71f4259404b50ed21095f86a01deb9) は次局mockに `declarationIndexes = [-1, -1, -1, -1];` を追加した。[run 40346215784](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40346215784) では東2局待ちを通過したが、別のfixture不整合でrun全体は失敗した。座席1の別の不整合は後続の `c21526d` で修正された。原因はテスト用mockの状態初期化漏れで、回帰テスト強化は #21 に引き継ぐ。

## 調査B：正常なCPU進行の誤判定

`tests/step14-0-1.test.ts` の親テスト `Step 14.0.1 local Durable Object protocol and state lifecycle` 内の `starts, persists, isolates, resumes and advances a two-human online game` は、旧判定 `gameRevision > beforeCpuRevision + 1 && (players[2].river.length > 0 || status !== 'playing')` でCPU2の河の残存枚数を使っていた。

調査ではCPU2が打牌し、CPU3がポンしてCPU2の河が0枚になり、CPU3が打牌して人間0の手番に進む経路を観測した。CPUは正常に進行したが旧判定は誤判定する。旧SHAの対象テスト50回は49成功・1失敗。デバッガ付き別反復でもこのポン経路を観測した。ただし過去CIの副露履歴は取得できず、同じ経路だった可能性はあっても断定できない。

[b7cd7f519d544311947eb35cf15f4ca0933f6b9d](https://github.com/ak-sekine/heibon-mahjong/commit/b7cd7f519d544311947eb35cf15f4ca0933f6b9d) はCPU2だけでなく他のCPUの河も考慮する判定に変更し、観測した経路の正常進行を検出できることを確認した。[d0dc154a0b0657dbfac7a916008fc7836f21c146](https://github.com/ak-sekine/heibon-mahjong/commit/d0dc154a0b0657dbfac7a916008fc7836f21c146) の乱数固定は、ランダム対局が期待する人間の手番より前に終了する別問題への対応である。CPU停止は確認されていない。回帰テスト強化は #21 に引き継ぐ。

## 前回調査のmain隔離コピーでの検証

| 条件 | 成功 | 失敗 |
| --- | ---: | ---: |
| 対象サブテスト単独反復 | 20 | 0 |
| 対象ファイル反復（関連テスト同時実行を含む） | 19 | 1 |
| 対象ファイル反復（他テストと同時実行しない） | 20 | 0 |
| 関連3ファイルまとめて実行 | 1 | 0 |
| npm test全体 | 1 | 0 |

1回の失敗は親テストの30秒タイムアウトで、CPU進行サブテスト自体は成功した。過去のCPU河枚数誤判定とは別問題として扱う。前回調査ではローカルChromium／WebKitによるUI反復を実施していない。上記ActionsのChromium 32件・WebKit 18件の成功とは区別する。

## 引き継ぎと未確認事項

- [Issue #21](https://github.com/ak-sekine/heibon-mahjong/issues/21)：リーチ結果後のmock初期化とCPU打牌がポンで河から除去される経路の固定テスト、河の残存枚数だけに依存しない進行判定の検討。
- [Issue #22](https://github.com/ak-sekine/heibon-mahjong/issues/22)：親テストの30秒タイムアウトの再現条件、並列負荷・テスト間干渉、非同期処理・タイマー・共有資源の影響を調査。

両Issueは未完了である。未確認事項は、調査Bの過去CIの正確な副露履歴、調査Aの過去失敗時のブラウザー内部状態とconsoleログの全容、取得できなかったActions artifactの画像、ローカルChromium／WebKitのUI反復、親テストタイムアウトの根本原因、CPU評価の実時間予算や実行負荷が失敗頻度に与える影響、将来の変更後も固定テストが十分な検出能力を持つか、である。
