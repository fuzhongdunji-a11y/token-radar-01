# CLAUDE.md — token-radar-01 (make.fun: Build the best token launch radar)

## 基本条件
- 締切: **2026-12-14 19:00 JST**（= 2026-12-14T10:00:00Z）。最終エントリーは締切前の最後の提出。
- 形式: **program/v1**。リポジトリ直下の `main.ts` が `/input/snapshot.json` を読み、`/output` に成果物を書く。
- `main.ts` は **Node 22 標準ライブラリのみ**（インストール不可、TypeScript はそのまま実行）。
- **ネットワーク禁止**（サンドボックスは無通信）。
- **2回実行で出力バイト完全一致**（決定的であること）。
- 出力: `board.json`、`data.js`、`dashboard/`、`screenshots/`、`dossier.json`（`vendor/makefun-board.ts` の `buildDossier` で最後に書く）。

## ゲート制約（1つでも落ちると無効）
- board: **100〜4000行**。`rank` は 1..N を一度ずつ、`implied_value_usd` は rank が上がっても増えない。全行同値は不可。
- watchlist: snapshot の `watchlist` の **全 slug をカバー**。
- farm_steps: 各行 **3〜12個**、各ステップ **20〜600字**（trim 後）。
- dashboard: ソース合計 **65536 bytes 以下**（dossier のテキスト上限。超過分は切られ、審査員は一部しか読めない）。`index.html` と `.css`・`.js` 各1以上。http(s):// のアドレスを属性・CSS・JS import に書かない。
- screenshots: **3枚**、各 **512KiB 以下**（目安は各300〜350KB）。PNG/JPEG、長辺 1440 以下・短辺 800 以上。1枚目が cover。
- `dossier.json` は `buildDossier('/output', {text_max_bytes: 65536})` の出力とバイト一致。

## 審査優先順（上ほど重要）
1. **動くレーダー**: 網羅（watchlist 全件）・順位・スクショとコードの一致。データやコードの裏付けがない画面は無価値。
2. **価値モデル**: snapshot の数値（TVL・7日成長・上場からの期間）のみから導出。**名前のハードコード禁止**。live-token（トークン既発行）と pre-token を分離して表示。
3. **farm plan の具体性**: 各ステップにコストと所要時間を書く。スローガン不可。
4. ソート／フィルタ／詳細ビュー。
5. 独自デザイン（配色・余白・タイポ。フレームワーク丸写しは不可）。

## 価値モデルの方針
- radar-2 方式: `implied = TVL × カテゴリ別ピア倍率 × growth × maturity × chain`。
- カテゴリ別ピア倍率: **live-token のカテゴリ内 mcap/TVL 中央値** を基準に、サンプルが少ないカテゴリは全体中央値へ **shrinkage**、最終倍率は **clamp 0.10〜3.00**。
- growth: `change_7d` を clamp した成長補正。maturity: `listed_at` からの経過日数（as_of 基準）。chain: `chains` から導出する補正。
- ボード行数は固定しない: **watchlist 全件 + 適格な追加行の全件**（現スナップショットで約190行）。100〜4000行のゲート内であること。
- 追加行の適格条件: `mcap_usd`・`gecko_id`・`symbol` がすべて null、かつ category / name / slug からのルールベースで wrapped・staked・bridged・versioned 性質（Bridge・Staking・Wrapper 系カテゴリ、名前の wrapped/staked/bridge/LST 等、バージョン接尾辞）、CEX カテゴリ、取引所名（スナップショット内の CEX カテゴリ名から導出）を除外。個別 slug・名前のハードコードリストは禁止。watchlist は条件にかかわらず全件掲載。
- live-token はボードに混ぜず、市場の mcap をそのまま別ビューで示す。

## コーディング規約
- **現在時刻・乱数を使わない**（`Date.now()`、`new Date()` 引数なし、`Math.random()` 禁止）。日付計算は snapshot の `as_of` 基準。
- 同点は **slug 昇順**で決める。ソート・反復順は常に明示して決定的にする。
- **OS固有パスを使わない**（`node:path` の `join` と `import.meta.url` 経由。ハードコードした絶対パスは `/input` と `/output` の既定値のみ。ローカルでは `MAKEFUN_OUTPUT_DIR` と `--input` で差し替え）。
- `main.ts` とダッシュボードは **エージェント自身が書く**。スターターのファイルはコピーせず参照のみ。`vendor/makefun-board.ts` だけはライブラリとして必要。
- 実行は **`--model sonnet`** で行う（デフォルトモデルは使わない）。

## ローカル実行
```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

## 現段階のスコープ
- 環境確認・キット理解・前提ファイル作成のみ完了。model / dashboard の実装、GitHub リポジトリ作成、キーペア作成、サインイン、提出はまだ行っていない。
