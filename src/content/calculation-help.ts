export interface CalculationHelpContent {
  title: string
  summary: string
  formula?: string
  note?: string
  version?: string
}

export const calculationHelp = {
  investmentAssets: { title: '投資資產', summary: '指你選進投資組合、會參與長期預測的資產。其他資產仍可列入家庭總資產，但不會自動算進未來投資金額。', note: '外幣資產需有有效的 TWD 匯率才能納入合計。', version: 'projection-contract-v0.2' },
  nominalValue: { title: '名目金額', summary: '依設定報酬率複利後的未來帳面金額，尚未扣除物價上漲的影響。', note: '適合查看未來帳面數字；若要比較生活水準，請看今天購買力。' },
  purchasingPower: { title: '今天購買力', summary: '把未來名目金額依通膨率折算成今天相近的購買能力。', formula: '今天購買力 = 未來名目金額 ÷ (1 + 年通膨率)^年數', version: 'projection-contract-v0.2' },
  forecastScenarios: { title: '報酬情境', summary: '用相同本金與投入，分別套用保守、穩健、比較樂觀的年報酬假設，方便看報酬不同時結果會差多少。', note: '情境不是發生機率，也不是最差或最好保證；資產若另有自訂報酬，會優先使用該設定。' },
  laborInsurance: { title: '勞保老年年金', summary: '屬於未來每月退休收入，不是目前持有的資產，因此不加入投資資產或總資產。月領金額依兩式擇優，再套用提前或展延調整。', version: 'tw-labor-rules-2026-08-20' },
  laborPension: { title: '勞退專戶', summary: '從目前專戶餘額開始，依月提繳工資、雇主提繳率、自提率及報酬率逐月累積。首頁會將它列入未來資產並與一般投資分開顯示。', formula: '月底餘額 = 上月底餘額 × (1 + 月報酬率) + 當月提繳', note: '到請領月份後保留請領時點價值，不推測後續提領、消費或再投資。' },
  totalAssets: { title: '總資產', summary: '加總所有勾選「納入總資產」、狀態為已設定且幣別為 TWD 的資產。家庭檢視中的共同資產只計一次。', note: '總資產的範圍通常比投資預測本金更大。' },
  totalLiabilities: { title: '總負債', summary: '加總所有狀態為已設定且幣別為 TWD 的負債目前餘額。個人檢視會依所有權與共同持分計算。' },
  netWorth: { title: '淨資產', summary: '表示目前資產扣除目前負債後的金額。', formula: '淨資產 = 總資產 − 總負債', note: '未來頁面的「投資資產扣除負債」只比較投資組合、勞退與可計算負債，不等同完整家庭淨資產。' },
  liabilityProjection: { title: '負債清償與投資比較', summary: '依目前本金、利率、還款方式與剩餘期數，逐月拆分本金及利息，再與相同月份的投資預測比較。', formula: '投資資產扣除負債 = 投資組合與勞退預估值 − 當月剩餘負債', note: '貸款付款不會再從投資預測扣除；每月投入視為使用者已決定可投入的金額。' },
  assetAllocation: { title: '投資配置分類', summary: '依資產實際曝險分為股票、債券、貨幣市場、現金及其他。ETF 或基金須依其實際投資內容分類，商品名稱本身不等於配置類別。' },
  currentAllocation: { title: '目前配置', summary: '依投資組合所選資產的最新有效市值計算各類別所占比例。', formula: '目前配置比例 = 該類別市值 ÷ 投資組合總市值' },
  targetAllocation: { title: '目標配置', summary: '使用者希望投資組合維持的長期配置比例，各類別合計必須等於 100%。系統只比較偏離，不會自動交易。' },
  allocationDrift: { title: '配置偏離', summary: '比較目前配置與目標配置的差距。絕對差距大於允許門檻時會提示檢視。', formula: '偏離百分點 = 目前配置比例 − 目標配置比例' },
  contribution: { title: '每月投入', summary: '只有明確建立的投入會加入投資預測，一般收入不會自動被當成投資。每月先對既有餘額計息，再於月底加入當月投入。' },
  contributionEnd: { title: '投入停止月份', summary: '可依固定月份、本人退休月份或主要規劃人退休月份停止。停止月份本身不再加入投入。', note: '若依退休月份停止但沒有設定該月份，預測會持續至 35 年後並顯示提醒。' },
  annualReturn: { title: '預估年報酬率', summary: '採有效年化報酬率，表示一年複利後的總報酬假設，系統會換算成等效月報酬率。', formula: '月報酬率 = (1 + 年化報酬率)^(1/12) − 1', note: '固定報酬假設未反映市場逐年波動、稅費或報酬順序風險。' },
  inflation: { title: '年通膨率', summary: '用來把未來名目金額折算為今天購買力，也用於退休生活需求試算的支出調整。通膨率愈高，相同未來金額的今天購買力愈低。' },
  calculationBaseDate: { title: '計算基準日', summary: '所有目前金額與年資被視為截至這一天。未來投入、利息、年齡與退休資格都從這裡往後推算。', note: '若日期與資料實際時間差太多，預測月份與累積結果也會跟著偏移。' },
  planningEndAge: { title: '規劃終點年齡', summary: '退休生活需求試算要估算到幾歲。年齡設得愈高，需要支應的退休期間通常愈長。', note: '不影響首頁固定 10～35 年的未來資產預測。' },
  settingStatus: { title: '設定狀態', summary: '「已設定」才表示這筆資料可供計算；「尚未設定」代表資料未完成，「不適用」代表刻意排除。', note: '是否真的納入某項合計或預測，仍要看該筆資料的範圍與勾選設定。' },
  ownership: { title: '所有權與共同持分', summary: '個人持有的資產全部歸該成員；共同持有依設定比例分配到個人摘要；家庭摘要只計整筆一次。共同持分合計必須為 100%。' },
  retirementScope: { title: '退休生活需求試算使用範圍', summary: '決定資產可供個人、家庭的退休生活需求試算使用，或完全排除。首頁長期預測仍以投資組合的選取範圍為主。' },
  availableFrom: { title: '可動用日期', summary: '資產到達此月份才加入預測並開始累積報酬。等待期間的資產價值變化目前不會推估。' },
  insuredSalary: { title: '最高 60 個月平均月投保薪資', summary: '勞保老年年金公式使用的薪資基礎，應依勞保投保紀錄中的最高 60 個月平均值填寫，不等同目前實領薪資。' },
  insuredYears: { title: '勞保年資', summary: '填目前已累積的投保年資。系統假設從計算基準日持續投保至請領月份，以目前年資加上續保月數 ÷ 12，作為年金兩式計算的年資。請領時仍未滿 15 年則不估算老年年金；停保期間未另行模擬。' },
  pensionContributionRate: { title: '勞退提繳率', summary: '每月勞退提繳由月提繳工資乘以雇主提繳率與自提率合計。', formula: '每月提繳 = 月提繳工資 × (雇主提繳率 + 自提率)', note: '目前驗證雇主至少 6%，個人自提介於 0% 至 6%。' },
  pensionContributionSalary: { title: '月提繳工資', summary: '雇主申報、用來計算每月勞退提繳金額的薪資級距，不一定等於實領薪水。', note: '填得愈高，每月進入勞退專戶的估算金額通常愈高。' },
  pensionContributionYears: { title: '勞退提繳年資', summary: '指目前已累積的勞退新制提繳年資，與勞保投保年資不同。', note: '請領時預估未滿 15 年，系統會判斷只能一次領，不能月領。' },
  pensionClaimMode: { title: '勞退請領方式', summary: '選擇退休時把勞退專戶一次領出，或符合資格時按月領取。', note: '這會改變顯示的請領結果；月領不是終身保證，實際資格與金額以主管機關核定為準。' },
  liabilityBalance: { title: '目前剩餘本金', summary: '截至餘額基準月份，這筆貸款還沒償還的本金，不包含未來利息。', note: '它是負債預測的起點；填成原始借款額會高估剩餘負債。' },
  repaymentMethod: { title: '還款方式', summary: '決定系統如何把每期付款拆成本金與利息，並推算剩餘負債與清償月份。', note: '請依貸款契約選擇；不固定或資料不足時可選手動管理，但不會納入未來清償比較。' },
  gracePeriod: { title: '剩餘寬限期', summary: '從餘額基準月份起，還有幾個月暫時只繳利息、不償還本金。', note: '寬限期愈長，本金下降得愈晚，總利息通常也會增加。' },
  scenarioOverride: { title: '情境覆寫', summary: '只在這個比較方案中暫時替換原本設定，不會直接改掉家庭資料。', note: '可用來比較多投入、延後退休或改變報酬等假設；儲存情境也只是保存比較條件。' },
  marketValue: { title: '行情更新市值', summary: '有有效標的代碼、持有數量與報價時，系統會更新目前市值；資料不足或連線失敗則保留上次有效值。', formula: 'TWD 市值 = 持有數量 × 最新價格 × TWD 匯率' },
  exchangeRate: { title: '外幣兌 TWD 匯率', summary: '表示一單位外幣可換算多少新臺幣。報價已是 TWD 時匯率採 1；缺少所需匯率時不覆蓋原市值。' },
  localData: { title: '瀏覽器本機資料庫', summary: '家庭財務資料保存在目前瀏覽器的 IndexedDB，不會因建立預測而上傳雲端。清除網站資料或更換裝置可能使資料遺失。' },
  backupVersion: { title: '備份版本與遷移', summary: 'JSON 備份包含資料版本。匯入時會先驗證格式，支援的舊版本會遷移到目前版本；驗證失敗不會覆蓋現有資料。' },
  legacyRetirement: { title: '退休生活需求試算', summary: '用退休生活費、安全準備金、遺產目標與最早退休月份估算退休需求。首頁固定期間預測不使用這些欄位判斷何時退休。', version: 'calculation-contract-v0.1' },
} satisfies Record<string, CalculationHelpContent>

export type CalculationHelpTopic = keyof typeof calculationHelp
