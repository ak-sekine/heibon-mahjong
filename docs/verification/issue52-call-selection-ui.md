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
| Chromium Playwright UI | push後の GitHub Actions で確認予定 |
| WebKit Playwright UI | push後の GitHub Actions で確認予定 |
| iPhone Safari 実機 | 未確認。公開後に実機確認が必要 |

Browser UI の鳴き選択シナリオは、複数候補・単一候補・複数鳴き種・カン・ロン・戻る・見送り、候補列数と上方向の伸長を、375×634、320×568、375×844、844×390、1280×900 の viewport で確認する。オンラインの同期・タイムアウト・再接続は既存のオンライン対局 Browser UI シナリオで確認する。

GitHub Actions の実行結果は、push後に対象 commit SHA とともに追記する。Playwright の Chromium / WebKit 結果は iPhone Safari 実機確認とは区別する。実機確認が完了するまで Issue #52 は Open のままにする。
