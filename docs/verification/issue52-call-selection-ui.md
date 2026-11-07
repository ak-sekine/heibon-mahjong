# Issue #52 鳴き選択UIの検証

実施日: 2026-11-07

対象Issue: [#52 鳴き選択UIをダイアログから卓上ボタンに変更](https://github.com/ak-sekine/heibon-mahjong/issues/52)

## 実装

- オフラインとオンラインで共有する `ActionPanel` に種類選択、牌候補、戻る操作を配置し、鳴き専用ダイアログを削除した。
- 種類を選ぶまで候補を隠し、種類選択後は1候補でも牌候補を表示する。候補ボタンは牌画像のみを見せ、アクセシブル名を維持する。
- 候補は幅に応じて列数が変わる Grid とし、操作パネルの下端に固定して候補行を上方向に増やす。狭い画面で候補数が高さを超える場合は候補一覧内をスクロールさせ、戻る／見送るを操作領域に残す。
- ゲーム状態遷移、合法性判定、オンライン送信と同期は既存の選択イベント経路を使う。

## 自動検証

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 tests passed |
| `npm run build` | 成功: TypeScript・Vite build・PWA shell build |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI regression selection / Python syntax | 成功 |
| Chromium Playwright UI | 成功: [GitHub Actions run #707](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42325846848)、commit `a896b3f034631f952ede6984e0709b7c97a9926991` |
| WebKit Playwright UI | 成功: [GitHub Actions run #707](https://github.com/ak-sekine/heibon-mahjong/actions/runs/42325846848)、commit `a896b3f034631f952ede6984e0709b7c97a9926991` |
| iPhone Safari 実機 | 未確認。公開後に実機確認が必要 |

Browser UI の鳴き選択シナリオは、複数候補・単一候補・複数鳴き種・カン・ロン・戻る・見送り、候補列数と上方向の伸長を、375×634、320×568、375×844、844×390、1280×900 の viewport で確認する。オンラインの同期・タイムアウト・再接続は既存のオンライン対局 Browser UI シナリオで確認する。

GitHub Actions run #707 は全体成功。regression test、Worker 型チェック、Pages/itch build、Chromium / WebKit Browser UI、browser-ui matrix audit、Worker deploy、production test、Pages build/deploy がすべて成功した。対象 commit SHA は `a896b3f034631f952ede6984e0709b7c97a9926991`。

Playwright の Chromium / WebKit 結果は iPhone Safari 実機確認とは区別する。iPhone Safari 実機確認が完了するまで Issue #52 は Open のままにする。

## 追加修正 — iPhone Safari実機指摘、2026-11-07

### 指摘と原因

ユーザー本人の2026-11-07のiPhone Safari確認で、鳴きメニューが通常操作パネルより画面下端に離れて表示されること、牌候補選択画面にも「見送る」が残ることが報告されました。実機確認の報告範囲はこの2点です。

CSSを調べると、モバイルでは `.discard-controls:has(.call-controls:not([hidden]))` を `position:fixed` と `bottom:...` でviewport下端に固定し、PCでは `.call-controls` を絶対配置して親の `bottom:0` に寄せていました。種類選択と候補選択で基準を揃える制御もなく、通常の卓直下レイアウトから分離されていました。さらに `--call-viewport-inset` を `main` の下paddingへ加算し、表示時に画面下部の余白を増やしていました。

### 修正

- 通常の打牌などを含む `.discard-controls` の配置を保ち、鳴き選択パネルをその操作領域の下端に重ねるよう共通化しました。viewport下端への固定を削除し、`main` に加算していた鳴き用viewport insetも除去しました。
- 牌候補一覧は鳴きパネルの上端から上向きに展開する絶対配置にし、`max-height`、内部スクロール、overscroll containmentを設定しました。候補の行数はページの通常フローに影響しません。
- 牌候補選択では「戻る」だけを残し、「見送る」を隠します。「戻る」は種類選択へ戻して「見送る」を再表示し、鳴き判断イベントを発生させません。種類選択画面の見送り、候補が1つでも選択前には候補を明示する既存動作、時間切れ処理は維持します。

### 今回の自動検証

| 検証 | 結果 |
|---|---|
| `npm test` | 成功: 85 test files passed |
| `npm run build` | 成功: TypeScript・Vite build・PWA shell build |
| `npm run typecheck:worker` | 成功 |
| `git diff --check` | 成功 |
| Browser UI Python syntax | 成功: Issue #52関連3スクリプトをcompile確認 |
| Chromium / WebKit Browser UI | GitHub Actionsの結果待ち。iPhone Safari実機確認とは区別して後日追記 |
| GitHub Actions | push後の対象commit runを確認して追記 |
| 修正後のiPhone Safari実機 | 未確認。ユーザー本人による再確認が必要 |

Browser UIでは通常の操作領域と卓の位置が鳴き判断中に変化しないこと、候補画面の「見送る」非表示と「戻る」による状態復帰、5件のチー候補の複数行表示、単一候補表示と選択前の未確定状態、320×568／375×634／375×844／844×390／1280×900 viewportを追加確認します。オンラインシナリオでは種類・候補選択、戻る、候補選択中のタイムアウトを確認します。実機の2指摘はユーザー報告に基づくもので、修正後の実機確認は未実施です。
