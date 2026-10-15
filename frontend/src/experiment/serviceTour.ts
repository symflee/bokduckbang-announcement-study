import type { StudyTip } from './StudySpotlight'

export interface ServiceTourStep extends StudyTip {
  nextLabel: string
  view?: 'pins' | 'complex' | 'complex-announcement' | 'announcement' | 'list' | 'list-announcement'
  advanceOnTarget?: boolean
  filterPreview?: 'applicationStatus'
}
export const SERVICE_TOUR: readonly ServiceTourStep[] = [
  {target:'#study-complex-tab', title:'공공주택 단지 지도예요', text:'단지가 어디에 있고, 어떤 주택인지 살펴볼 수 있어요.', nextLabel:'다음'},
  {target:'[data-study-filter-panel="applicationStatus"]', portalTarget:'[data-study-filter-guide-host]', filterPreview:'applicationStatus', title:'모집 상태로 골라요', text:'필터 창에서 공고중·접수중 등 원하는 상태의 단지만 골라 볼 수 있어요.', nextLabel:'다음'},
  {target:'.housing-map-base', view:'pins', title:'핀 색으로 상태를 구분해요', text:'지도에 있는 핀의 색으로 진행 중인 공고가 있는지 알 수 있어요.', pinLegend:true, nextLabel:'다음'},
  {target:'.housing-map-marker[data-application-status="BEFORE_APPLICATION"]', focusTarget:false, view:'pins', title:'단지 핀을 눌러 보세요', text:'공고중인 주황색 핀을 누르면 해당 단지의 상세 정보가 열려요.', nextLabel:'단지 상세 열어보기', advanceOnTarget:true},
  {target:'dialog[aria-label="단지 상세"]', view:'complex', title:'단지 정보를 상세히 볼 수 있어요', text:'단지의 주소·주택 유형·임대조건과 모집공고를 확인할 수 있어요.', nextLabel:'모집공고 살펴보기'},
  {target:'dialog[aria-label="단지 상세"] [data-detail-return-focus^="announcement:"]', view:'complex-announcement', title:'단지 정보에서 공고를 볼 수 있어요', text:'진행 중인 모집공고가 있는 단지는 이 항목에서 공고 상세를 열 수 있어요.', nextLabel:'공고 상세 열어보기', advanceOnTarget:true},
  {target:'dialog[aria-label="공고 상세"]', view:'announcement', title:'모집조건과 일정을 확인할 수 있어요', text:'공고 상세에서 신청 대상, 접수 기간, 모집하는 단지를 확인할 수 있어요.', nextLabel:'다음'},
  {target:'#announcement-list-trigger', title:'공고 목록에서도 찾을 수 있어요', text:'공고 탭을 누르면 모집공고를 한눈에 볼 수 있는 목록이 열려요.', nextLabel:'공고 목록 열어보기', advanceOnTarget:true},
  {target:'#housing-list-page', view:'list', title:'목록에서 공고를 골라요', text:'기관·모집상태·일정을 살펴보고, 공고를 누르면 자세한 정보를 알 수 있어요.', nextLabel:'목록의 공고 열어보기'},
  {target:'dialog[aria-label="공고 상세"]', view:'list-announcement', title:'공고 정보를 자세히 볼 수 있어요', text:'단지 상세 페이지를 거치지 않고 공고 목록에서 바로 내용을 확인할 수도 있어요.', nextLabel:'직접 둘러보기'},
]
