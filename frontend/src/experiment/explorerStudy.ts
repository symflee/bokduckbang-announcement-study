import type { MapMode, StudyAnnouncement } from './data'

export type StudyPath = 'filter' | 'announcement_map' | 'search' | 'announcement_list' | 'complex' | 'recent'
export type CompletionSource = 'filtered_complex' | 'announcement_pin'
export const STUDY_CONTROLS = [
  'mode_complexes', 'mode_announcements', 'filter_open', 'filter_apply', 'filter_reset',
  'complex_pin', 'announcement_pin', 'aggregate_pin', 'complex_list_item', 'announcement_list_item',
  'search_result', 'announcement_choice', 'detail_close', 'detail_back', 'announcement_list_toggle',
  'recent_list_toggle', 'search_submit', 'map_zoom_in', 'map_zoom_out', 'tour_previous', 'tour_next',
  'explore_more', 'survey_start',
] as const
export type StudyControl = typeof STUDY_CONTROLS[number]
export interface StudyDetailRequest {
  requestId: string
  id: string
  source: CompletionSource | 'other'
  complexId: string | null
  applicationStatuses: readonly string[]
}
export interface StudyHintContext {
  statusFiltered: boolean
  mapView: 'aggregate' | 'individual' | 'empty'
  detail: 'none' | 'complex-active' | 'complex-empty' | 'announcement'
  complexFromFilteredPin: boolean
  choicesOpen: boolean
  listOpen: boolean
}
export type ExplorerStudyEvent =
  | { type: 'control'; control: StudyControl }
  | { type: 'context'; context: StudyHintContext }
  | { type: 'ready'; ready: boolean }
  | { type: 'error'; surface: 'map' | 'data' | 'detail' }
  | { type: 'retry' }
  | { type: 'path'; path: StudyPath }
  | ({ type: 'request-detail' } & StudyDetailRequest)
  | { type: 'detail'; requestId: string; id: string; status: string | null }
export interface ExplorerStudy {
  tourStep?: number
  tourCamera?: {latitude:number; longitude:number; zoom:number}
  mode: MapMode
  newModeAvailable: boolean
  guideAnnouncementTab?: boolean
  announcements: Record<string, StudyAnnouncement[]>
  onModeChange: (mode: MapMode) => void
  onEvent: (event: ExplorerStudyEvent) => void
}
