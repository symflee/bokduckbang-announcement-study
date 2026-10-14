import type { StudyTip } from './StudySpotlight'

export interface ServiceTourStep extends StudyTip {
  nextLabel: string
  view?: 'pins' | 'complex' | 'complex-announcement' | 'announcement' | 'list' | 'list-announcement'
  advanceOnTarget?: boolean
}
export const SERVICE_TOUR: readonly ServiceTourStep[] = [
  {target:'#study-complex-tab', title:'공공주택 단지 지도예요', text:'단지가 어디에 있고, 어떤 주택인지 살펴볼 수 있어요.', nextLabel:'다음'},
  {target:'.housing-search-overlay input[type="search"]', title:'원하는 곳을 검색해요', text:'지역·역·단지·공고 이름으로 원하는 곳을 찾아보세요.', nextLabel:'다음'},
  {target:'[data-study-filter="applicationStatus"]', title:'모집상태로 골라요', text:'공고중·접수중 등 원하는 상태의 단지만 볼 수 있어요.', nextLabel:'다음'},
  {target:'[data-study-filter="agency"]', title:'공급기관으로 골라요', text:'LH·SH·GH 등 원하는 기관의 단지만 볼 수 있어요.', nextLabel:'다음'},
  {target:'.housing-map-base', view:'pins', title:'핀 색으로 상태를 구분해요', text:'주황은 공고중, 파랑은 접수중이에요. 회색은 진행 중 공고가 없고, 초록은 선택한 단지예요.', pinLegend:true, nextLabel:'다음'},
  {target:'.housing-map-marker[data-application-status="BEFORE_APPLICATION"]', view:'pins', title:'단지 핀을 눌러 보세요', text:'공고중인 주황색 핀을 누르면 해당 단지의 상세 정보가 열려요.', nextLabel:'단지 상세 열어보기', advanceOnTarget:true},
  {target:'dialog[aria-label="단지 상세"]', view:'complex', title:'이곳이 단지 상세예요', text:'단지의 주소·주택 유형·임대조건과 모집공고를 확인할 수 있어요.', nextLabel:'모집공고 살펴보기'},
  {target:'dialog[aria-label="단지 상세"] [data-detail-return-focus^="announcement:"]', view:'complex-announcement', title:'단지에서 공고를 열어요', text:'진행 중인 모집공고가 있는 단지는 이 항목에서 공고 상세를 열 수 있어요.', nextLabel:'공고 상세 열어보기', advanceOnTarget:true},
  {target:'dialog[aria-label="공고 상세"]', view:'announcement', title:'모집조건과 일정을 확인해요', text:'공고 상세에서 신청 대상, 접수 기간, 모집하는 단지를 살펴보세요.', nextLabel:'다음'},
  {target:'#announcement-list-trigger', title:'공고 목록에서도 찾을 수 있어요', text:'공고 탭을 누르면 모집공고를 한눈에 볼 수 있는 목록이 열려요.', nextLabel:'공고 목록 열어보기', advanceOnTarget:true},
  {target:'#housing-list-page', view:'list', title:'목록에서 공고를 골라요', text:'기관·모집상태·일정을 살펴보고, 공고를 누르면 상세가 열려요.', nextLabel:'목록의 공고 열어보기'},
  {target:'dialog[aria-label="공고 상세"]', view:'list-announcement', title:'같은 공고 상세로 이어져요', text:'단지 상세를 거치지 않고 공고 목록에서 바로 내용을 확인할 수도 있어요.', nextLabel:'다음'},
  {target:'#recent-list-trigger', title:'봤던 단지를 다시 찾아요', text:'최근 본 단지에서 앞서 열어 본 단지를 다시 확인할 수 있어요.', nextLabel:'다음'},
  {target:'button[aria-label="지도 확대"]', title:'지도를 확대하거나 축소해요', text:'숫자 핀은 그 지역의 단지 수예요. 확대하면 개별 단지가 보여요.', nextLabel:'직접 둘러보기'},
]
