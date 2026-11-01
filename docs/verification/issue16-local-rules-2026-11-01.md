# Issue #16: 赤ドラ・裏ドラ・一発・カンドラの個別設定

## 対象と調査

- Issue: [#16](https://github.com/ak-sekine/heibon-mahjong/issues/16)
- 関連: #6（共通ルールモデルとWorker正本）、#11（ドラ合算表示）、#13（オンライン再戦）、#27（新規対局画面）
- 実装基点: `6b3a992605e71fa330c1fc83f01d78fe9b33437a` (`origin/main`、2026-11-01に取得)
- 基点の作業ツリーはclean。Issue本文・コメント、関連Issue、`docs/SPEC.md`、`docs/ROADMAP.md`、最新の#27検証記録と現行コードを確認。
- 基点コードでは赤5が各色1枚、リーチ和了の裏ドラ、一発、カン成立ごとの追加ドラが固定で有効でした。4設定はすべて従来動作と一致するONを初期値にしました。

## 実装内容

- `GameRules` schema 2に`redDora`、`uraDora`、`ippatsu`、`kanDora`を追加。東風戦／半荘戦を含む共通モデルをオフライン・オンラインで使用。
- 旧schema 1の形式のみの設定、旧localStorage envelope、既存Workerルーム行は各形式と従来固定動作（4項目すべてON）へ移行。新しい不正型・未知フィールドをWorkerルーム作成時に拒否。
- オフライン・オンラインの新規対局画面に独立チェック項目を追加。既存の開始時保存タイミングを維持。オンライン待機中・対局中とオフライン対局中は同じ確定値を読み取り専用で表示。
- 赤ドラOFFでは赤5を同じ物理枚数の通常5牌として生成。既存のゲームsnapshotも赤牌面を通常牌へ変換し、牌ID・牌数を保持。
- 裏ドラOFFでは加点せず、裏表示牌を卓・結果に表示しない。非リーチ和了はONの場合も従来どおり裏ドラ対象外。
- 一発OFFでは一発権の成立・消滅状態を維持し、和了役・翻数への一発加算だけを止める。CPUのリーチ候補評価は共通和了評価器を使う。
- カンドラOFFでは暗槓・大明槓・加槓、嶺上牌補充、王牌移動、槓数、槍槓・四開槓などを維持し、追加の表ドラ表示牌を公開・加算しない。

## カンドラOFF時の槓裏

現行の王牌は追加の表ドラ表示牌と裏ドラ表示牌を隣接した組で管理し、リーチ和了時は表のカン表示牌数に対応する裏表示牌を参照します。この対応を保ち、カンドラOFF時は追加の表表示牌と対になる槓裏も表示・加算しません。通常の初期裏ドラ表示牌は、裏ドラONかつリーチ和了の場合のみ適用します。

## 自動検証

2026-11-01のローカル実行結果:

| コマンド | 結果 |
| --- | --- |
| `npm test` | 成功。74 test files、失敗0 |
| `npm run typecheck:worker` | 成功 |
| `npm run build` | 成功。TypeScript検査とVite production build |
| `git diff --check` | 成功 |

追加・更新した決定的テストは、全16通りのルール組み合わせと136枚の牌構成、赤牌置換・加点、リーチ／非リーチ裏ドラと表示、成立・無効化された一発の役と翻数、暗槓・大明槓・加槓のカンドラOFF、ルール保存・旧データ移行、不正値拒否、Workerルーム作成・Durable Object再構築後の復元、オンライン公開view、CPUのリーチ候補評価を対象にします。既存の東風戦・半荘戦、カン、ドラ、CPU、対局精算、結果表示の回帰テストも全体テスト内で成功しました。

## GitHub Actions・デプロイ

- 検証対象commit SHA: `98b0b5235d9faf62b5dfbf34c115154b416f2af1`（Issue #16実装と最終Browser UI fixture修正を含むmain commit）。
- GitHub Actions: [run #499](https://github.com/ak-sekine/heibon-mahjong/actions/runs/41287810895) がsuccess。`verify`は1,319 tests成功・失敗0、Worker型チェック、production buildを通過。Chromium Browser UI、WebKit Browser UI、既存engine matrix audit、release freshness、Worker production test、Deploy gateもsuccess。
- Worker deploy: success。公開URLは https://heibon-mahjong-online.ak-sekine.workers.dev 。production testもsuccess。
- Pages build／deploy: どちらもsuccess。公開URLは https://ak-sekine.github.io/heibon-mahjong/ 。
- Codex Cloud内のChromium／WebKit実行: GitHub Actionsの既存engine別matrixで実行するため未実施。

## iPhone Safari実機確認

未実施。自動テスト・Chromium／WebKit結果を実機確認済みとは扱いません。ユーザー本人による以下の確認を待ちます。

1. オフライン新規対局で4項目を個別にON/OFFでき、初期状態がすべてONであること。開始後の読み取り専用画面と、次局でも設定が維持されること。
2. オンラインでホストが選んだ設定が待機中に参加者全員へ表示され、参加者側では変更できないこと。対局中の読み取り専用画面も同じ値であること。
3. オンラインの再接続、次局、同じルームでの再戦後も設定が維持されること。
4. 赤牌OFFの牌表示、裏ドラOFFの情報非表示、一発OFF／カンドラOFF時の局結果・「ドラN」表示に不要な加算がないこと。

## 未確認事項とIssue状態

- ユーザー本人によるiPhone Safari実機確認は未実施。ActionsのBrowser UI成功を実機確認済みとは扱いません。
- Pagesのデプロイ後の独立したHTTP応答確認は未実施。GitHub Pages Deploy action自体はsuccessしました。
- Issue #16はユーザー本人のiPhone Safari確認を受けるまでOpenのまま維持する。
