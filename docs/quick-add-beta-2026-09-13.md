# 【公版修正】快速新增資產 Beta 製作與驗收紀錄

日期：2026-09-13。目標 PUBLIC；repository beach1807-max/retirement-planner-public，部署分支 preview，Pages project retirement-planner-public。

## 已製作內容

- 家庭資料的資產區新增「快速新增資產 Beta」，舊新增與編輯入口保留。
- 三類入口：投資商品、現金／存款、其他資產。
- TWD／USD 原幣估值；股票及 ETF 可用數量乘單價，或直接填寫市值。
- 不動產與保單在其他入口，仍保存 property／insurance，不加入組合及長期預測。
- ETF 形式與股票／債券等配置分類分開；無可靠分類資料時由使用者確認。
- 沿用目前三情境預設，可在進階修改個別報酬、所有權、地區、可動用日期、總額及既有退休試算設定。
- 一般帳戶選填，支援當次建立帳戶；手動股數與行情股數均使用既有 Holding。
- 已有組合只加入資產，不改目標比例；第一次建立須輸入並確認合計 100% 的目標，或明確選擇稍後設定。
- 先檢查摘要，保存成功才關閉；取消不留下資料，失敗保留草稿。

## 資料流與程式責任

QuickAddAsset 草稿 → buildQuickAsset（以 App 最新規劃組裝）→ 既有 validatePlannerData → PlannerService → Dexie／IndexedDB → 共同頁面與計算。

- src/components/QuickAddAsset.tsx：獨立 Beta 表單與草稿、查詢競爭防護、摘要與失敗保留。
- src/application/quick-add-asset.ts：原幣估值、預設、帳戶、部位、組合與刪除引用清理。
- src/application/quick-asset-lookup.ts：只查單筆草稿，重用 provider 與美股基本資料來源。
- src/components/DataPage.tsx：新入口與必要刪除清理；舊表單仍保留。
- src/application/asset-market-link.ts：正確保存 ETF instrumentType；無行情的手動部位一般編輯時不清除。
- src/App.tsx：保存成功／失敗結果及最新資料套用。
- src/styles.css：沿用公版色彩、表單與響應式布局。

沒有增加持久欄位，沒有修改資料庫名稱、計算契約或備份 v0.10。既有其他幣別資料仍可讀取與備份還原。

## 保護措施

- 以 Decimal 計算金額與權重；缺價格、缺匯率、非法值不可被視為 0。
- USD 留空手動匯率時優先使用已存有效匯率；查新商品不自動覆蓋全域匯率。
- 明確修改匯率時提示影響所有美元資產。
- 查詢晚到不覆蓋已切換的商品；台股追蹤需使用者確認上市／上櫃。
- 不呼叫全體資產 refresh 來新增單筆，不變動其他資產的報價。
- 新增同代號建立獨立資產／部位，不合併既有資料。
- 刪除資產時清理所有組合、部位、行情及相關投入／情境引用。
- 使用者原有未追蹤文件 docs/stage-two-2026-09-09-actual.md 未納入本次修改或提交。

## 已知限制

- 依代號查價，不是全球名稱搜尋。台股名稱若未取得須手填，美股基本資料依既有服務及權限取得。
- 不自動猜测未知 ETF 的投資類別；混合型商品可選其他，本次不拆分曝險。
- 美國行情與基本資料依使用者本機既有 API Key；未設定時清楚提示並允許手動估值。
- 未啟用行情追蹤時，保存手動數量及估值，不持久保存商品代號或手動單價；介面先說明。
- 基金、個別債券等以目前估值新增，沒有新增專屬價格乘數或成本模型。
- 不動產用途、租金、房貸整合、其他幣別及市場留待後續。
- 投資組合與長期預測共用資產清單；既有退休試算使用範圍不是長期預測的另一個開關。
- 舊行情頁外幣更新仍沿用當批匯率檢查，缺少時保留原估值。
- 舊版資料、報酬及組合目標不進行批次重分類或重設。

## 測試證據

- npm run test：165 項通過（25 個測試檔，含 Beta 的資料、互動與行情測試）。
- npm run lint：通過。
- npm run build：通過。
- Beta Playwright：12 項通過，涵蓋 desktop-chrome、mobile-chrome、tablet-chrome、mobile-webkit。
- 跨裝置驗證：USD 債券 ETF／台股 ETF／現金／不動產共存、保存重載、舊表單編輯、刪除組合引用、JSON 下載還原、首次組合、離線及實際 IndexedDB 失敗。
- 備份還原的 service 測試直接比較三情境結果、儀表板合計與再平衡結果。
- 已檢視桌面與手機截圖；介面沿用既有布局，沒有新增水平溢位。
- 既有 Playwright 四裝置回歸：93 項初次通過，1 項 WebKit 美股案例在建置替換期間進入程式快取復原頁，固定建置後單獨重驗通過；合計 94 項通過、2 項依既有平台條件略過（桌面的行動導覽、WebKit 的 Service Worker）。

### 真實來源與模擬測試的區分

2026-09-13 對指定公版 /api/market-data?instruments=TWSE:0050 進行唯讀請求，實際收到：

- 0050：107.7 TWD，報價日 2026-09-11，來源 twse-openapi-v1。
- USD/TWD：31.638，匯率日 2026-09-11，來源 cbc-ftd-day。
- errors 為空。

上述只證明當時台股端點與匯率可用，不保證未來行情可用性。自動化的台股及美股特定價格使用明確測試資料，不把它們當即時報價；美股含金鑰的線上行情未使用真實使用者憑證驗收。

## 部署核對

部署驗收程序核對以下四項一致：Cloudflare project、preview 分支、source commit，以及 https://preview.retirement-planner-public.pages.dev/build-version.json 回傳的 commit。並在指定公版網址實際載入 Beta 操作流程。


最終 commit、deployment 與 PWA 升級實測結果，記錄於本次任務交付報告；不將尚未執行的部署寫為已完成。
