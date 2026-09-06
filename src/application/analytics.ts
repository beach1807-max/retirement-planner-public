export type AnalyticsEvent = 'quick_start_opened' | 'quick_start_completed' | 'demo_opened' | 'full_plan_started' | 'projection_viewed' | 'backup_exported'

export interface AnalyticsPort { track(event: AnalyticsEvent): void }

export const noopAnalytics: AnalyticsPort = { track: () => undefined }
