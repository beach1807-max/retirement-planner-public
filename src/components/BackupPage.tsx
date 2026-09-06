import { useRef, useState } from 'react'
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { PlannerData } from '../application/planner-data'
import { downloadBackup, parseBackup } from '../infrastructure/backup'
import { CalculationHelp } from './CalculationHelp'

interface Props { data: PlannerData; onRestore: (data: PlannerData) => void | Promise<void>; onClear: () => void | Promise<void>; feedbackUrl?: string }

export function BackupPage({ data, onRestore, onClear, feedbackUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  async function importFile(file?: File) {
    if (!file) return
    try {
      const restored = parseBackup(await file.text())
      await onRestore(restored)
      setMessage('備份已還原，計算結果已使用還原資料重新產生。')
    } catch {
      setMessage('無法還原：檔案格式或版本不受支援。原有資料沒有變更。')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="page-stack narrow-page">
      <section className="panel backup-hero"><div><span className="metric-icon large"><Download size={26} /></span><h2><CalculationHelp label="資料與備份" topic="localData" /></h2><p>財務資料只保留在這台裝置的瀏覽器。清除瀏覽器資料、移除網站資料或更換裝置前，請先匯出備份。</p></div><button className="button primary" onClick={() => downloadBackup(data)}><Download size={18} /> 匯出 JSON 備份</button></section>
      <section className="panel">
        <div className="panel-heading"><div><h2><RotateCcw size={21} /> <CalculationHelp label="還原備份" topic="backupVersion" /></h2><p>匯入前會驗證備份版本與必要欄位，格式錯誤不會覆蓋現有資料。</p></div></div>
        <input ref={inputRef} className="visually-hidden" id="backup-file" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        <label className="button secondary file-button" htmlFor="backup-file"><Upload size={18} /> 選擇備份檔案</label>
        {message && <div className={message.startsWith('無法') ? 'alert error' : 'alert success'} role="status">{message}</div>}
      </section>
      {feedbackUrl && <section className="panel"><h2>需要協助？</h2><p className="muted">如果看不懂結果、發現操作問題或有功能建議，歡迎回饋。</p><a className="button secondary" href={feedbackUrl} target="_blank" rel="noreferrer">回報問題／提供建議</a></section>}
      <section className="panel danger-zone"><div><h2>清除這台裝置的規劃</h2><p>這會刪除 IndexedDB 中的家庭、資產、投入與設定，且無法復原。請先匯出備份。</p></div>{confirmingClear ? <div className="form-actions"><button className="button secondary" type="button" onClick={() => setConfirmingClear(false)}>取消</button><button className="button danger" type="button" onClick={() => void onClear()}><Trash2 size={18} /> 確認清除全部資料</button></div> : <button className="button danger" type="button" onClick={() => setConfirmingClear(true)}><Trash2 size={18} /> 清除全部資料</button>}</section>
    </div>
  )
}
