# オンライン待機ダイアログのコンパクト化

日付: 2026-10-24  
検証対象コミット: `0b44fba6d66a7f659714a38f422ae73ef523ba94`

## 検証結果

- `npm test`: 成功（55件）
- `npm run build`: 成功
- `python -m py_compile tests/browser-online-waiting-room.py`: 成功
- `git diff --check`: 成功
- GitHub Actions `Browser UI verification` run `40058025416`: 成功。Browser UIスイート全体とオンライン待機画面の検査が完了。
- GitHub Actions `Deploy to GitHub Pages and Cloudflare Workers` run `40058025428`: verify、Browser UI、Worker deploy、production test、Pages build、Pages deployの全ジョブが成功。

## 画面サイズ

GitHub-hosted runner上のPlaywright Chromiumで、ルーム作成直後に次のサイズを確認した。各サイズでダイアログが画面内に収まり、内部スクロールなし、操作ボタン表示、閉じるボタン44×44px以上、横スクロールなしを確認。

| サイズ | 結果 |
| --- | --- |
| 375×667 | 成功 |
| 375×812 | 成功 |
| 390×844 | 成功 |
| 414×896 | 成功 |
| 1280×900 | 成功 |

375×812では4席がすべて埋まった状態も確認した。座席順は東・南・西・北を維持し、長い参加者名は省略表示、横スクロールなし、下部操作ボタンは表示された。

スクリーンショット（作成直後、4席参加時）は [Browser UI run artifact](https://github.com/ak-sekine/heibon-mahjong/actions/runs/40058025416/artifacts/12546173604) に保存されている。ファイル名は `online-waiting-375x812-created.png` と `online-waiting-375x812-four-players.png`。

この確認はChromiumによるビューポート検査であり、iPhone Safari実機では未確認。Safariのアドレスバーを含む実機挙動は別途確認が必要。
