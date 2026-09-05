export interface CalculationHelpContent {
  title: string
  summary: string
  formula?: string
  note?: string
  version?: string
}

export const calculationHelp = {
  investmentAssets: { title: '投資資產', summary: '只包含投資組合中明確選取、狀態為已提供且幣別為 TWD 的資產。未選取的不動產、保險或其他資產仍可計入總資產，但不會自動進入未來預測。', version: 'projection-contract-v0.2' },
  nominalValue: { title: '名目金額', summary: '依設定報酬率複利後的未來帳面金額，尚未扣除物價上漲的影響。', note: '適合查看未來帳面數字；若要比較生活水準，請看今天購買力。' },
  purchasingPower: { title: '今天購買力', summary: '把未來名目金額依通膨率折算成今天相近的購買能力。', formula: '今天購買力 = 未來名目金額 ÷ (1 + 年通膨率)^年數', version: 'projection-contract-v0.2' },
  forecastScenarios: { title: '預設與自訂報酬情境', summary: '各情境使用相同本金與投入計畫。預設三種會調整每筆投資及勞退的年報酬，自訂情境可選擇是否同時調整勞退。', formula: '保守 = 原報酬率 − 2 個百分點；穩健 = 原報酬率；比較樂觀 = 原報酬率 + 2 個百分點；自訂 = 原報酬率 + 輸入的百分點', note: '例如原本 6%，自訂 +1 後為 7%。最低有效年報酬為 -99%。情境不代表機率或最差／最好結果。' },
  laborInsurance: { title: '勞保老年年金', summary: '屬於未來每月退休收入，不是目前持有的資產，因此不加入投資資產或總資產。月領金額依兩式擇優，再套用提前或展延調整。', version: 'tw-labor-rules-2026-08-20' },
  laborPension: { title: '勞退專戶', summary: '從目前專戶餘額開始，依月提繳工資、雇主提繳率、自提率及報酬率逐月累積。首頁會將它列入未來資產並與一般投資分開顯示。', formula: '月底餘額 = 上月底餘額 × (1 + 月報酬率) + 當月提繳', note: '到請領月份後保留請領時點價值，不推測後續提領、消費或再投資。' },
  totalAssets: { title: '總資產', summary: '加總所有勾選「納入總資產」、狀態為已提供且幣別為 TWD 的資產。家庭檢視中的共同資產只計一次。', note: '總資產的範圍通常比投資預測本金更大。' },
  totalLiabilities: { title: '總負債', summary: '加總所有狀態為已提供且幣別為 TWD 的負債目前餘額。個人檢視會依所有權與共同持分計算。' },
  netWorth: { title: '淨資產', summary: '表示目前資產扣除目前負債後的金額。', formula: '淨資產 = 總資產 − 總負債', note: '目前固定期間投資預測不會自動從未來投資資產扣除負債。' },
  assetAllocation: { title: '投資配置分類', summary: '依資產實際曝險分為股票、債券、貨幣市場、現金及其他。ETF 或基金須依其實際投資內容分類，商品名稱本身不等於配置類別。' },
  currentAllocation: { title: '目前配置', summary: '依投資組合所選資產的最新有效市值計算各類別所占比例。', formula: '目前配置比例 = 該類別市值 ÷ 投資組合總市值' },
  targetAllocation: { title: '目標配置', summary: '使用者希望投資組合維持的長期配置比例，各類別合計必須等於 100%。系統只比較偏離，不會自動交易。' },
  allocationDrift: { title: '配置偏離', summary: '比較目前配置與目標配置的差距。絕對差距大於允許門檻時會提示檢視。', formula: '偏離百分點 = 目前配置比例 − 目標配置比例' },
  contribution: { title: '每月投入', summary: '只有明確建立的投入會加入投資預測，一般收入不會自動被當成投資。每月先對既有餘額計息，再於月底加入當月投入。' },
  contributionEnd: { title: '投入停止月份', summary: '可依固定月份、本人退休月份或主要規劃人退休月份停止。停止月份本身不再加入投入。', note: '若依退休月份停止但沒有設定該月份，預測會持續至 35 年後並顯示提醒。' },
  annualReturn: { title: '預估年報酬率', summary: '採有效年化報酬率，表示一年複利後的總報酬假設，系統會換算成等效月報酬率。', formula: '月報酬率 = (1 + 年化報酬率)^(1/12) − 1', note: '固定報酬假設未反映市場逐年波動、稅費或報酬順序風險。' },
  inflation: { title: '年通膨率', summary: '用來把未來名目金額折算為今天購買力，也用於舊版退休支出的逐月調整。通膨率愈高，相同未來金額的今天購買力愈低。' },
  ownership: { title: '所有權與共同持分', summary: '個人持有的資產全部歸該成員；共同持有依設定比例分配到個人摘要；家庭摘要只計整筆一次。共同持分合計必須為 100%。' },
  retirementScope: { title: '退休使用範圍', summary: '用於舊版退休可行性計算，決定資產可供個人、家庭退休使用或完全排除。新版首頁預測則以投資組合的選取範圍為主。' },
  availableFrom: { title: '可動用日期', summary: '資產到達此月份才加入預測並開始累積報酬。等待期間的資產價值變化目前不會推估。' },
  insuredSalary: { title: '最高 60 個月平均月投保薪資', summary: '勞保老年年金公式使用的薪資基礎，應依勞保投保紀錄中的最高 60 個月平均值填寫，不等同目前實領薪資。' },
  insuredYears: { title: '勞保年資', summary: '填目前已累積的投保年資。系統假設從計算基準日持續投保至請領月份，以目前年資加上續保月數 ÷ 12，作為年金兩式計算的年資。請領時仍未滿 15 年則不估算老年年金；停保期間未另行模擬。' },
  pensionContributionRate: { title: '勞退提繳率', summary: '每月勞退提繳由月提繳工資乘以雇主提繳率與自提率合計。', formula: '每月提繳 = 月提繳工資 × (雇主提繳率 + 自提率)', note: '目前驗證雇主至少 6%，個人自提介於 0% 至 6%。' },
  scenarioHash: { title: '輸入 hash', summary: '依基準資料更新時間、契約版本、法規版本及方案覆寫內容產生的識別碼，用來判斷是否為同一組試算輸入。', note: 'hash 不是加密，也不代表系統已保存完整歷史結果。' },
  marketValue: { title: '行情更新市值', summary: '有有效標的代碼、持有數量與報價時，系統會更新目前市值；資料不足或連線失敗則保留上次有效值。', formula: 'TWD 市值 = 持有數量 × 最新價格 × TWD 匯率' },
  exchangeRate: { title: '外幣兌 TWD 匯率', summary: '表示一單位外幣可換算多少新臺幣。報價已是 TWD 時匯率採 1；缺少所需匯率時不覆蓋原市值。' },
  localData: { title: '瀏覽器本機資料庫', summary: '家庭財務資料保存在目前瀏覽器的 IndexedDB，不會因建立預測而上傳雲端。清除網站資料或更換裝置可能使資料遺失。' },
  backupVersion: { title: '備份版本與遷移', summary: 'JSON 備份包含資料版本。匯入時會先驗證格式，支援的舊版本會遷移到目前版本；驗證失敗不會覆蓋現有資料。' },
  legacyRetirement: { title: '舊版退休可行性設定', summary: '退休生活費、安全準備金、遺產目標與最早退休月份供舊版退休可行性契約使用。新版首頁固定期間預測不使用這些欄位判斷何時退休。', version: 'calculation-contract-v0.1' },
} satisfies Record<string, CalculationHelpContent>

export type CalculationHelpTopic = keyof typeof calculationHelp
