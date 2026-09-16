# 安心退休規劃

免費、台灣在地化的個人／家庭退休資產模擬工具。它優先回答三件事：現在的資產怎麼分配、未來 10～35 年可能累積多少、以及那些金額相當於今天多少購買力。

## 隱私

財務資料只儲存在使用者目前瀏覽器的 IndexedDB；不需要帳號，也不會傳送資產金額、收入、支出、負債或個人資料。請定期在「資料與備份」匯出 JSON 備份。

## 功能

- 快速試算：只填生日、目前投資資產、每月投入與資產配置。
- 完整規劃：可再補家庭、收入支出、勞保與勞退資料。
- 展示模式：可先瀏覽範例；展示資料不會寫入本機資料庫。
- 本機優先、可離線開啟的 PWA 與版本化 JSON 備份。

## 開發

需求：Node.js 22.16.0 或以上版本。

```bash
npm install
npm run dev
npm run check
npm run test:e2e
```

目前公版驗收環境固定為 Cloudflare Pages 專案 `retirement-planner-public` 的 `preview` 分支：

```bash
npm run deploy
```

此命令會先建置，再明確使用 `--project-name retirement-planner-public --branch preview` 上傳，最後列出部署記錄供核對。驗收網址為 `https://preview.retirement-planner-public.pages.dev/`。完整流程與架構請見 `docs/部署手冊.md`。

專案識別為 `retirement-planner-public`，與私版 `retirement-planner-pwa` 完全分離；備份格式仍相容 `retirement-planner-backup-v0.1` 至 `v0.8`。

## 聲明

結果為依使用者資料與固定假設產生的試算，不代表投資建議或保證。勞保、勞退資格與金額以主管機關最終核定為準。
