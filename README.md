# 安心退休規劃 PWA

- 正式網站：[https://retirement-planner-pwa.pages.dev](https://retirement-planner-pwa.pages.dev)
- GitHub：[beach1807-max/retirement-planner-pwa](https://github.com/beach1807-max/retirement-planner-pwa)（私有儲存庫）

以主要規劃人為核心、同時整合家庭可用資源的退休資產規劃工具。第一版回答：

1. 依目前資料與假設，最早約在什麼月份可以退休？
2. 退休時與規劃終點約有多少資產？

## 完整第一版功能

- 建立家庭、主要規劃人與選配伴侶。
- 維護家庭成員、收入、平均支出、資產、帳戶／持有部位與負債。
- 設定資產為個人使用、家庭退休可用或排除。
- 建立每月投入與投入停止規則。
- 按月計算最早退休月份、正向預測、退休目標、準備率與指定年齡資產。
- 依版本化臺灣規則估算成員別勞保與勞退，並併入家庭退休時間軸。
- 設定可投資資產範圍、目標配置與允許偏離，產生可解釋的再平衡提醒。
- 建立提早退休、增加投入與勞退自提等情境，不修改正式家庭資料即可比較。
- 主動取得臺灣證券交易所上市股票／ETF 收盤價與中央銀行 USD/TWD 收盤匯率；失敗保留上次有效值。
- 家庭／主要規劃人／伴侶三種資料檢視。
- IndexedDB 本機儲存及版本化 JSON 備份還原。
- 可安裝、可離線重新開啟的 PWA。

目前版本已完成七階段補齊計畫所定義的完整第一版。稅務、交易成本、多市場／即時／自動行情、Monte Carlo、雲端同步與自動交易仍不在範圍內。

## 隱私邊界

Cloudflare Pages 提供 PWA 資產，Pages Function 只代理使用者主動查詢的上市代碼至官方行情來源。家庭成員、數量、金額、負債與退休設定仍留在目前瀏覽器的 IndexedDB，不會傳送到 GitHub、Cloudflare Function 或行情來源。

清除瀏覽器網站資料或更換裝置可能遺失規劃，請定期使用「備份還原」匯出 JSON。

## 本機開發

需求：Node.js 22.16.0 或以上版本。

```bash
npm install
npm run dev
```

完整驗證：

```bash
npm run check
npm run test:e2e
```

- `npm run check`：ESLint、43 項單元／整合測試、TypeScript 與正式建置。
- `npm run test:e2e`：28 項桌面／行動版操作、IndexedDB、備份、響應式及離線 PWA 測試。

## Cloudflare Pages

正式建置命令為 `npm run build`，輸出目錄為 `dist`。直接部署：

```bash
npm run build
npm run deploy
```

預覽分支部署：

```bash
npm run deploy:preview
```

詳細設定見 [部署手冊](docs/部署手冊.md)。

## 規格與決策

- [個人與家庭退休資產規劃方案](個人與家庭退休資產規劃_PWA_方案統整_2026-09-01%20(1).md)
- [第一版計算契約與決策附錄](第一版計算契約與決策附錄_2026-09-01.md)
- [技術架構 ADR](docs/adr/0001-技術架構.md)
- [第一版暫定決策](docs/adr/0002-第一版暫定決策.md)
- [完整第一版發布與階段一契約](docs/adr/0003-完整第一版發布與階段一契約.md)
- [臺灣勞保勞退規則版本](docs/adr/0006-臺灣勞保勞退規則版本.md)
- [投資組合與再平衡邊界](docs/adr/0007-投資組合與再平衡邊界.md)
- [情境覆寫與結果重現](docs/adr/0008-情境覆寫與結果重現.md)
- [官方手動行情與快取](docs/adr/0009-官方手動行情與快取.md)
- [開工規格閘門](docs/開工規格閘門.md)

## 重要聲明

本工具結果依使用者提供的資料與固定假設估算，不保證未來投資報酬、實際支出或法規結果。第一版不提供個別證券推介、交易指示或自動下單。實際勞保、勞退資格及金額以主管機關核定為準。
