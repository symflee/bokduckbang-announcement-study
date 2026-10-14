import type { MapMode, StudyAnnouncement } from './data'

export type StudyPath = 'filter' | 'announcement_map' | 'search' | 'announcement_list' | 'complex' | 'recent'
export type CompletionSource = 'filtered_complex' | 'announcement_pin'
export interface StudyDetailRequest {
  requestId: string
  id: string
  source: CompletionSource | 'other'
  complexId: string | null
  applicationStatuses: readonly string[]
}
export type ExplorerStudyEvent =
  | { type: 'ready'; ready: boolean }
  | { type: 'error'; surface: 'map' | 'data' | 'detail' }
  | { type: 'retry' }
  | { type: 'path'; path: StudyPath }
  | ({ type: 'request-detail' } & StudyDetailRequest)
  | { type: 'detail'; requestId: string; id: string; status: string | null }
export interface ExplorerStudy {
  mode: MapMode
  newModeAvailable: boolean
  announcements: Record<string, StudyAnnouncement[]>
  onModeChange: (mode: MapMode) => void
  onEvent: (event: ExplorerStudyEvent) => void
}
