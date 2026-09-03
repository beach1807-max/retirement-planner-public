import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenView(): never {
  throw new Error('BROKEN_CHUNK')
}

describe('應用程式錯誤邊界', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染失敗時顯示復原操作而不是空白畫面', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<AppErrorBoundary><BrokenView /></AppErrorBoundary>)

    expect(screen.getByRole('heading', { name: '需要重新取得最新版' })).toBeVisible()
    expect(screen.getByRole('button', { name: '重新載入最新版' })).toBeVisible()
    expect(screen.getByText(/不會刪除儲存在此瀏覽器的退休規劃資料/)).toBeVisible()
  })
})
