# AI Agent 開發接交文檔 (Engineering Handover for AI Agents)

**專案名稱**：安心退休規劃 (Retirement Planner Public)

**專案類型**：離線優先 PWA、純前端本機財務規劃與資產投影工具

**基準安全標籤 (Rollback Tag)**：`v0.1.0-pre-ui-enhancement` (Commit: `e8aa47377e7e0f33a2d3770746afb331b103bdad`)

**最後更新時間**：2026-09-16

---

## 1. 核心設計哲學與約束（Core Principles & Constraints）

接手本專案的 AI Agent，**請務必嚴格遵守以下四項鐵律**：

1. **本機優先與零知識隱私（Local-First & Privacy by Design）**：
   * 所有使用者財務數據（資產、薪資、負債、年資）**只允許儲存在瀏覽器的 IndexedDB（透過 Dexie.js）**。
   * **絕對禁止**在任何後端或第三方伺服器保存或傳輸使用者的財務隱私明細。
   * `analytics.ts` 必須保持無個資追蹤（`noopAnalytics`）。
2. **純領域層與金融級數值精度（Domain Purity & Financial Precision）**：
   * 領域計算核心位於 `src/domain/`，**禁止引入任何 UI 狀態（React Hooks）或 I/O 副作用**。
   * 所有金額與利率運算**一律使用 `decimal.js`**，嚴格禁止原生浮點數 `number` 直接相加減乘除，防止二進位精度誤差。
3. **契約版本化與向後相容性（Contract Versioning & Backward Compatibility）**：
   * 系統已支援從 `planner-data-v0.1` 平滑升級至 `v0.8`（參見 `src/application/planner-migration.ts`）。
   * 任何資料結構變更均需更新 Zod Schema（`src/infrastructure/backup.ts`）並在 Migration 鏈中補齊向上相容邏輯，保證使用者的歷史 JSON 備份檔永遠能夠讀取。
4. **可重現性與確定性（Determinism）**：
   * 輸入結構透過 `src/domain/canonical.ts` 規格化鍵值排序並產生 SHA-256 雜湊，相同輸入必須保證產出 100% 相同之結果。

---

## 2. 專案目錄與架構分層（DDD / Layered Architecture）

```text
retirement-planner-public/
├── src/
│   ├── domain/                  # 【領域核心層】純商業/精算模型，100% 無副作用純函式
│   │   ├── models.ts            # 領域實體與合約定義（CalculationInput, ProjectionResult 等）
│   │   ├── calculation-engine.ts# 退休資金流與提領模擬引擎
│   │   ├── projection-engine.ts # 10～35 年情境複利與資產投影引擎
│   │   ├── rebalancing-engine.ts# 資產再平衡與偏離度（Drift）計算
│   │   ├── retirement-system.ts # 台灣法規（2026 勞保老年年金雙公式擇優、勞退生命表年金）
│   │   ├── canonical.ts         # 規格化 JSON 與 SHA-256 簽章
│   │   └── date.ts              # 月份時間軸輕量計算
│   ├── application/             # 【應用服務層】協調領域、存儲與第三方服務
│   │   ├── planner-service.ts   # 主要業務門面（Facade）
│   │   ├── planner-migration.ts # v0.1 至 v0.8 資料庫/備份平滑遷移鏈
│   │   ├── planner-data.ts      # 持久化資料模型與展示資料產生器
│   │   ├── scenario-service.ts  # 情境對比邏輯
│   │   └── market-data-service.ts # 台灣股市行情與匯率同步
│   ├── infrastructure/          # 【基礎設施層】外部適配器
│   │   ├── dexie-planner-repository.ts # IndexedDB 本機持久化
│   │   ├── backup.ts            # Zod 多版本驗證、JSON 備份匯出與匯入
│   │   └── market-data-provider.ts     # 串接 Cloudflare 反向代理 API
│   ├── components/              # 【UI 呈現層】React 19 元件
│   │   ├── CurrencyInput.tsx    # 金融金額輸入元件（千分位、中文單位「萬/億」輔助）
│   │   ├── DemoBanner.tsx       # 展示模式提示橫條與離開引導
│   │   ├── CalculationHelp.tsx  # 公式與專有名詞 Popover 說明（高無障礙 a11y）
│   │   ├── QuickStartWizard.tsx # 新手三步驟極速試算精靈
│   │   ├── Dashboard.tsx        # 核心儀表板（Recharts 購買力折線圖與情境表）
│   │   ├── DataPage.tsx         # 家庭、成員、資產與投入維護
│   │   ├── FinancialDataSections.tsx # 收支、負債與帳戶編輯
│   │   ├── PortfolioPage.tsx    # 投資組合納入資產與目標比例設定
│   │   ├── RetirementSystemsPage.tsx # 勞保/勞退個人參數輸入
│   │   ├── ScenarioPage.tsx     # 額外自訂情境比較
│   │   ├── MarketDataPage.tsx   # 證交所收盤價與匯率手動同步
│   │   ├── BackupPage.tsx       # 資料匯出、匯入與清空
│   │   └── MobileNavigation.tsx # 手機版底部導航與抽屜選單
│   └── styles.css               # 全域樣式與 Design Tokens
├── functions/api/               # 【Cloudflare Pages Functions】無伺服器代理
│   └── market-data.js           # TWSE 證交所與 CBC 央行匯率反向代理（避免 CORS）
├── docs/                        # 架構決策記錄 (ADR) 與規範
│   ├── adr/                     # 0001 至 0010 號架構決策
│   └── AGENT_HANDOVER.md        # 本交接手冊
└── design-system/default/
    └── MASTER.md                # 視覺設計規範（已校正為現行森林綠主題）
```

---

## 3. 本次 UI/UX 改善工程變更紀錄

本次變更完全專注於**前端互動體驗與視覺輔助**，完全未改動任何精算邏輯與資料合約：

1. **`src/components/CurrencyInput.tsx`（新增）**：
   * 自動為數字加入千分位逗點（如 `1,000,000`）。
   * 動態換算中文繁體大額輔助單位（如 `約 100 萬`、`約 1.25 億`），徹底防止使用者在輸入長串數字時數錯 `0` 的個數。
   * 包含對應的單元測試 `CurrencyInput.test.tsx`。
2. **`QuickStartWizard.tsx` 與 `FinancialDataSections.tsx`（更新）**：
   * 將資產、每月投入、收支、負債的數字輸入框全面替換為 `CurrencyInput`。
3. **`DataPage.tsx`（更新）**：
   * 資產價值與每月投入輸入框升級為 `CurrencyInput`。
4. **`DemoBanner.tsx`（新增）與 `App.tsx`（更新）**：
   * 當處於展示模式時，頂部常駐顯著提示列，並附帶「開始我的個人規劃」一鍵切換按鈕，避免使用者在範例資料上徒勞編輯。
5. **`Dashboard.tsx`（更新）**：
   * 在未來資產預測表格中，於「今天購買力」旁即時顯示「通膨折減比例（如：通膨折減 33%）」，使通膨侵蝕概念更一目了然。
6. **`design-system/default/MASTER.md`（校正）**：
   * 將舊有草稿中的 Dark Mode 色票，全面校正為現行的森林綠金融主題（`--primary: #12372a`、`--accent: #d5a94e`）。

---

## 4. 日常開發、測試與建置指令

專案執行環境：Node.js $\ge$ `22.16.0`（Windows 環境請使用 `npm.cmd` 或 Powershell）。

```bash
# 1. 完整品質檢查（必須通過始可 Commit）
npm run check
# 等同於：eslint . && vitest run && tsc -b && vite build

# 2. 單元測試
npm run test
npm run test:watch

# 3. 瀏覽器端對端測試 (Playwright E2E)
npm run test:e2e

# 4. 本地開發伺服器
npm run dev

# 5. Cloudflare Pages 公版 preview 驗收環境部署
npm run deploy
```

---

## 5. 安全復原操作指引（Rollback SOP）

部署位置、部署前後驗證與完整復原程序以 [`docs/部署手冊.md`](./部署手冊.md) 為準。禁止對共用分支執行 `git reset --hard` 後 `git push --force`；應建立可稽核的 revert commit，再測試、推送並重新部署 `preview`。

```bash
# 撤銷普通 commit
git revert <commit>

# 撤銷 merge commit時使用
git revert -m 1 <merge-commit>

npm run check
git push origin preview
npm run deploy
```

---

## 6. 未來接續待辦事項與後端依賴回報（Roadmap）

後續接手開發的 Agent 若欲進一步增強功能，需特別注意以下**需後端支援**的項目：

1. **擴充上櫃證券（TPEx）與美股報價**：
   * 目前 `functions/api/market-data.js` 僅支援 TWSE 上市股票與 ETF。
   * 許多熱門債券 ETF（如 00679B）為櫃買中心上櫃標的，需在 Cloudflare Functions 增加 TPEx API 代理。若欲支援美股（VT、VOO），亦需建立後端 Yahoo/AlphaVantage 代理以防瀏覽器 CORS 限制。
2. **行情代理逾時熔斷**：
   * `functions/api/market-data.js` 需加入 `AbortSignal.timeout(6000)`，避免政府網站遲緩時造成前端無止盡等待。
3. **Web Worker 計算遷移**：
   * 目前計算在主線程執行，若未來規劃加入蒙地卡羅情境模擬（Monte Carlo），請將 `calculation-engine.ts` 透過 Vite `?worker` 包裝移入背景執行緒。
