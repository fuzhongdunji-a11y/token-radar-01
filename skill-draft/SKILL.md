---
name: sealed-data-ranking-dashboard
description: Build and submit a program/v1 bounty entry that turns a sealed offline snapshot into a ranked board with peer-calibrated scoring, a static offline dashboard, three screenshots and a byte-stable dossier. Use for make.fun-style "main.ts reads /input, writes /output" competitions judged by an AI on the dashboard.
---

# sealed-data-ranking-dashboard

## 目次
1. 適用場面と前提
2. 手順 ①ゲート制約表 ②ピア校正スコアリング ③適格条件 ④静的ダッシュボード ⑤アクションプラン ⑥スクリーンショット SOP ⑦決定性 ⑧提出予算
3. 今回踏んだ注意点
4. 雛形: CLAUDE.md の骨格

## 1. 適用場面と前提
- 形式は program/v1: リポジトリ直下の `main.ts`（Node 標準ライブラリのみ、ネットワークなし）が封印スナップショット `/input/snapshot.json` を読み、`/output` に board・data・dashboard・screenshots・dossier を書く。
- 採点は 2 段: ゲート（機械・0/1）→ AI 審査員がダッシュボードの dossier（スクショ + ソーステキスト上限）を 2 本ずつ比較。見た目と中身の一致が効く。
- 実行は 2 回走らされ、出力のバイト一致を見られる。提出は回数制限あり（今回: 1 日 5 回・計 10 回）。
- 向かない場面: ライブデータが必要な課題、実行時にパッケージ導入が要る課題。

## 2. 手順

### ① キットと requirements からゲート制約表を作る
`competition.yaml`（冒頭コメントと checks）、`RULES.txt`、requirements の `checks[]` を読み、**行 = 制約、列 = 数値・出典・自動検証の有無** の表を最初に作る。今回の表:

| 領域 | 制約 |
|---|---|
| board | 100〜4000 行、rank は 1..N 一度ずつ、implied は rank が上がっても増えない、全行同値不可 |
| watchlist | snapshot の全 slug を掲載 |
| farm_steps | 行ごと 3〜12 個、各 20〜600 字（trim 後） |
| dashboard | ソース合計 ≤ 65536 B、index.html と css・js 各 1 以上、http(s):// 参照禁止 |
| screenshots | 3 枚、各 ≤ 512 KiB、PNG/JPEG、長辺 ≤ 1440・短辺 ≥ 800、1 枚目が cover |
| dossier | `buildDossier('/output', {text_max_bytes: 65536})` とバイト一致（最後に書く）、≤ 1.5 MiB |
| repo | 公開 GitHub、OSI ライセンス、README に公式バッジ 3 つ、About にサイトと topic |

表の各行に対応する検証コードを `scripts/` に置く（§3 参照）。

### ② ピア校正スコアリング
- 形: `score = base × peer_multiple × growth × maturity × structure`。`base` はスナップショットの規模量（今回 TVL）。
- ピア倍率: 「実績あり」群（今回 live-token）の **カテゴリ内 比率（mcap/TVL）の中央値**。
- shrinkage: `w = n/(n+k)`（k=5）、`blended = w·raw + (1−w)·global_median`。n=0 は全体中央値。最後に clamp（0.10〜3.00）。
- 補正は有界にする: growth は入力を clamp して `1 + g/100 × 0.35`、maturity は `0.7 + 0.3 × min(age,1095)/1095`、chain は `1 + 0.02 × min(chains−1, 5)`。欠損は中立値（age 欠損は 365 日）。
- 定数は 1 つの `MODEL` オブジェクトに置き、`version` を持たせ、ダッシュボードの「モデル説明」はこのオブジェクトから生成する（コードと画面が食い違わない）。
- 最終値は整数に丸めて clamp。同点は slug 昇順。

### ③ 適格条件をフィールドルールで定義する
- 追加行は「トークン無し」（mcap・gecko_id・symbol がすべて null）かつ wrapped/staked/bridged/versioned/CEX でないもの。
- 判定は category の正規表現、name の語、バージョン接尾辞（`V3`, `2.0`）、LST 風の名前形式で行う。取引所名は**スナップショット内の CEX カテゴリ名の先頭語から導出**する。
- 個別 slug・名前の除外リストは作らない（審査基準で減点）。ただし必須掲載リスト（watchlist）は条件に関係なく全件入れる。
- 行数は固定しない。条件を満たす全件を載せ、ゲート範囲内かを `boardIssue()` で実行時に確認し、外れたら exit 1。

### ④ オフライン静的ダッシュボード
- ファイル: `index.html` + `app.css` + `app.js`。外部 URL・CDN・Web フォント禁止。
- **データは `data.js` に分離**（`/output` 直下、dashboard/ の外）。dossier のテキスト上限 64 KiB はソースにだけかかるので、大きなデータをソースへ埋めない。今回 dashboard/ は 30,135 B、data.js は約 430 KB。
- バイト予算を `wc -c` で毎回確認し、dossier の `text` 先頭の `Files: N (X bytes)` と一致を見る。
- 必須ビュー: ランキング表（ソート・フィルタ・検索）、詳細ビュー（式の分解・アクションプラン）、**トークン既発行と未発行の分離**（既発行はボードに混ぜず、市場値をそのまま別ビュー）、モデル説明。
- 配色・余白・タイポは独自に決める。フレームワーク丸写しは避ける。

### ⑤ アクションプラン生成
- 入力: カテゴリ（→ 行動キット: swap/LP, supply/borrow, vault, stake, bridge, perp, mint, subscribe, generic）× チェーン（ガス資産・主要チェーン）× 規模（TVL 帯 → 投入資金）× 年数（→ 保有日数）。
- 各ステップは **何を・いくらで・どこで** と末尾の `Cost: … Time: …` を必ず含む。20〜600 字、3〜12 個。今回は 7 個・168〜259 字。
- スローガン（「活発に使おう」など）は不可。金額・分数・日数を数式で出す。

### ⑥ スクリーンショット SOP
1. ビュー 3 つ: ①ボード全景（cover）②詳細 ③フィルタ後。コードに存在する画面だけを撮る。
2. 寸法 1440×1080 前後（長辺 ≤ 1440、短辺 ≥ 800）、各 300〜350 KB 目安、上限 512 KiB。
3. `file` で寸法・形式、`wc -c` で容量を確認。
4. **撮影後に画像を開いて目視確認**（文字化け・空表・重なり・ダミー値がない）。
5. `screenshots/` はコミットし、`main.ts` が `/output/screenshots` へコピーする。ダッシュボードを変えたら撮り直す。

### ⑦ 決定性チェックリスト
- [ ] `Date.now()`・引数なし `new Date()`・`Math.random()` を使わない。日付計算は `as_of` 基準。
- [ ] ソート・反復は常に明示。同点は slug 昇順。`Map`/`Set` の挿入順に依存しない。
- [ ] OS 固有パスなし。`node:path` の join と `import.meta.url`。絶対パスは `/input`・`/output` の既定値のみ。
- [ ] 2 回実行して `diff -r out1 out2` が空。
- [ ] `dossier.json` は最後に書く。

```sh
SNAP=<kit>/input/snapshot.json
MAKEFUN_OUTPUT_DIR=/tmp/a node main.ts --input $SNAP
MAKEFUN_OUTPUT_DIR=/tmp/b node main.ts --input $SNAP
diff -r /tmp/a /tmp/b && echo IDENTICAL
```

### ⑧ 提出予算管理
- 上限（今回 5/日・10 回）を超えない。**最終エントリー = 締切前の最後の提出**なので、検証用の提出を作ると最後に置いたものが最終になる点に注意。
- 提出前にローカルで `makefun check` 相当（kit の `cli/makefun.mjs check`）を通す。
- dev レートは、固定の 4 つの基準ダッシュボードに対する期待勝率と 90% 区間。区間が広い間は 1 回の差を過信しない。基準の中位以上に届く変更だけを次の提出に回す。
- 予算の目安: 初回 1 回（動作確認）、改善 2〜4 回、最終 1 回、予備 3 回以上。最終提出は「そのコミットを最終に決めた」記録をメモに残してから行う。
- リポジトリ・コミットは提出時にスナップショットされる。push 後に変えても反映されない。

## 3. 今回踏んだ注意点
- **ローカル採点器がキットに無い**: 採点器（scorer）は同梱されない。RULES / checks から自作の検証器（`scripts/check-board.ts`）を作り、ゲート表の各行を PASS/FAIL で出す。ただし自作は採点器そのものではないので、「通った」は十分条件ではない。
- **ブラウザ取得が通らない環境**: 公式配布物（kit.tar.gz、`cli/makefun.mjs`、requirements.json）で代替し、サイトの文面を取りに行かない。
- 動作確認用の `out1/out2` は必ず `.gitignore` に入れる。
- README の公式バッジは `{owner}`/`{repo}` のままだと check が落ちる。GitHub のオーナー名が確定してから埋める。
- 秘密値（キーペア・`.env`）はコミットにも履歴にも入れない。入ると提出が拒否され、履歴の書き換えが必要になる。
- スターターはコピーせず参照のみ。`vendor/makefun-board.ts` だけはライブラリとして必要。

## 4. 雛形: CLAUDE.md の骨格
```markdown
# CLAUDE.md — <repo> (<bounty title>)

## 基本条件
- 締切: <日時 JST / UTC>。最終エントリーは締切前の最後の提出。
- 形式: program/v1。`main.ts` が `/input/snapshot.json` を読み `/output` に書く。
- Node 標準ライブラリのみ。ネットワーク禁止。2 回実行で出力バイト一致。
- 出力: board.json, data.js, dashboard/, screenshots/, dossier.json（最後に書く）。

## ゲート制約（1 つでも落ちると無効）
<§2① の表>

## 審査優先順
1. 動くレーダー（網羅・順位・画面とコードの一致） 2. 価値モデル（データ由来・名前ハードコード禁止）
3. アクションプランの具体性 4. ソート／フィルタ／詳細 5. 独自デザイン

## 価値モデルの方針
<式、定数、shrinkage、clamp、適格条件>

## コーディング規約
- 時刻・乱数禁止。同点は slug 昇順。OS 固有パス禁止。
- main.ts とダッシュボードは自分で書く。

## ローカル実行
<コマンド>

## 現段階のスコープ
<やったこと／やらないこと（push・署名・提出など）>
```
