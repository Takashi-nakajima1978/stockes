# Stock Signal

20銘柄まで管理し、SearXNGまたはGoogle検索、3年価格データ、LM Studioのローカル生成AIを組み合わせる株式分析アプリです。

## できること

- 初期銘柄: 東急、JAL、NTT、SoftBankを含む管理リスト
- 購入日、購入単価、株数を複数明細で登録し、平均取得単価、合計株数、含み損益、保有期間を表示
- 「買いたい価格」を入力し、現在値、3年レンジ、長期トレンド、移動平均、変動率から買値の妥当性を評価
- 3年分の価格データから、3年リターン、年率リターン、最大下落率、長期トレンドを計算
- 一括分析の結果をローカルに保存し、次に開いた時も前回の判定を自動表示
- 候補検索は、好業績材料、3年の目安価格、直近モメンタム、変動率、既存リストとの分散、検索材料をスコア化して最大100件まで提案
- 好みではない会社は「出さない」フラグで次回以降の候補から除外
- グラフにマウスを乗せると、その日の価格と日付を表示
- 過去1年の安値帯から、買い時になりやすかった時期を表示
- 候補ごとに「事業」「割安」「買い時」「リスク」「相性」の5段階で発掘プロセスを表示
- 標準では1単元100株、30万円くらいで買える候補を優先
- 候補は自動追加せず、「好調割安」メニューから必要な銘柄だけ追加
- SearXNGまたはGoogle Custom Search JSON APIでニュースや決算材料を検索
- LM StudioのOpenAI互換APIで、購入情報と価格傾向を踏まえて買い寄り、保有、売り寄り、要注意を判定
- 検索エンジンやLM Studioが未接続でも、価格ルール分析にフォールバック

## 必要な設定

`.env.example` を参考に、必要なら `.env` を作成します。`node server.mjs` 起動時に `.env` は自動で読み込まれます。

```bash
SEARCH_PROVIDER=searxng
SEARXNG_URL=http://127.0.0.1:8081/search
GOOGLE_API_KEY=
GOOGLE_CSE_ID=
LM_STUDIO_URL=http://127.0.0.1:1234/v1
LM_STUDIO_TIMEOUT_MS=180000
PORT=5173
HOST=127.0.0.1
```

SearXNGを使う場合は `http://127.0.0.1:8081/search` を設定します。Google検索を使うには、Google Custom Search JSON APIのAPIキーとProgrammable Search Engine IDが必要です。アプリ内の「設定」メニューからも保存できます。

## ローカル起動

```bash
node server.mjs
```

ブラウザで `http://127.0.0.1:5173` を開きます。

## Docker起動

```bash
docker compose up --build
```

DockerからMac上のLM Studioへつなぐため、composeでは `http://host.docker.internal:1234/v1` を使います。起動後、Docker Desktopには `local-stock-signal` が表示されます。

## 注意

このアプリは投資判断の補助ツールです。利益を保証するものではありません。「買いたい価格」の評価は、過去3年の値動きに対してその価格が高すぎないか、下落リスクを取りすぎていないかを確認するための目安です。検索エンジンが未接続の場合はWeb材料を読めないため、価格データ中心の暫定判定になります。
