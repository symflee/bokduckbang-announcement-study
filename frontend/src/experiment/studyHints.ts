import type { MapMode } from './data'
import type { StudyHintContext } from './explorerStudy'
import type { TrialKey } from './state'

export const HINT_DELAY_MS = 15_000
export const EMPTY_HINT_CONTEXT: StudyHintContext = {
  statusFiltered:false, mapView:'aggregate', detail:'none', complexFromFilteredPin:false, choicesOpen:false, listOpen:false,
}
export function studyHint(method:TrialKey, mode:MapMode, context:StudyHintContext): string {
  if (method === 'new') {
    if (mode !== 'announcements' || context.listOpen || context.detail === 'announcement') return '이번에는 공고지도에서 찾아보세요. 공고 목록이나 단지 상세 대신, 지도에 표시되는 공고 요약에서 내용을 열어보는 방법이에요.'
    if (context.detail === 'complex-empty') return '이 단지에는 진행 중인 공고가 없어요. 상세를 닫고 공고지도에서 공고가 있는 단지를 찾아보세요.'
    if (context.choicesOpen) return '이 단지에는 여러 공고가 있어요. 열린 목록에서 공고중·접수중인 공고 하나를 골라 내용을 확인해 보세요.'
    if (context.mapView === 'empty') return '현재 보이는 곳에는 조건에 맞는 공고가 없어요. 지도를 조금 축소하거나 다른 지역으로 이동해 공고가 있는 단지를 찾아보세요. 추가한 필터 조건도 확인해 보세요.'
    if (context.mapView === 'aggregate') return '숫자가 표시된 지역에는 공고가 있는 단지가 있어요. 그 지역을 확대하면 공고명과 일정이 적힌 요약 핀을 볼 수 있어요.'
    return '공고명과 일정이 적힌 요약 핀을 골라 보세요. 공고 내용을 바로 열 수 있고, 여러 공고가 있으면 그중 하나를 선택할 수 있어요.'
  }
  if (context.detail === 'complex-empty') return '이 단지에는 진행 중인 공고가 없어요. 지도로 돌아가 공고가 있는 단지를 찾아보세요. 모집상태를 공고중·접수중으로 좁히면 찾기 쉬워요.'
  if (!context.statusFiltered) return '모집상태를 공고중·접수중으로 좁혀 보세요. 진행 중인 공고가 있는 단지만 지도에 남아요.'
  if (context.detail === 'complex-active' && context.complexFromFilteredPin) return '이 단지에는 진행 중인 공고가 있어요. 단지 상세의 모집공고에서 공고중·접수중인 공고 하나를 열어 보세요.'
  if (context.detail !== 'none' || context.listOpen) return '필터가 적용된 단지지도로 돌아가 단지 핀을 선택해 보세요. 그 단지의 모집공고를 열면 이 방법을 체험할 수 있어요.'
  if (context.mapView === 'empty') return '현재 보이는 곳에는 조건에 맞는 단지가 없어요. 지도를 조금 축소하거나 다른 지역으로 이동해 공고중·접수중인 단지를 찾아보세요.'
  if (context.mapView === 'aggregate') return '필터에 맞는 단지만 남아 있어요. 숫자가 있는 지역을 확대해 공고중·접수중인 단지를 찾아보세요.'
  return '공고중·접수중으로 표시된 단지를 골라 보세요. 단지를 선택한 뒤 진행 중인 모집공고가 있는지 확인해 보세요.'
}
