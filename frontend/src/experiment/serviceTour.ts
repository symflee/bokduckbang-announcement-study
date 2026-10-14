import type { StudyTip } from './StudySpotlight'

export const SERVICE_TOUR: readonly (StudyTip & {nextLabel:string})[] = [
  {target:'#study-complex-tab', title:'여기는 공공주택 단지 지도예요', text:'공공주택 단지의 위치와 기본 정보를 볼 수 있어요. 먼저 주요 기능을 함께 살펴볼게요.', nextLabel:'다음'},
  {target:'.housing-search-overlay input[type="search"]', title:'원하는 지역이나 단지를 검색해요', text:'지역, 지하철역, 단지 또는 공고 이름으로 검색할 수 있어요. 원하는 동네로 바로 이동할 때 사용합니다.', nextLabel:'다음'},
  {target:'[data-study-filter="applicationStatus"]', title:'조건을 고르면 지도도 달라져요', text:'모집상태를 공고중·접수중으로 고르면 진행 중인 공고가 있는 단지만 남아요. 지금 이 조건을 적용해 지도 핀이 어떻게 바뀌는지 볼게요. 전체 필터에서는 임대유형·가격·면적도 고를 수 있어요.', nextLabel:'공고중·접수중으로 걸러보기'},
  {target:'.map-region', title:'조건에 맞는 단지만 남았어요', text:'방금 모집상태 필터를 적용했어요. 공고가 없는 단지의 핀이 사라지고, 지역별 숫자도 조건에 맞는 단지 수로 줄었어요. 이전을 누르면 적용 전 지도와 다시 비교할 수 있어요.', nextLabel:'다음'},
  {target:'#announcement-list-trigger', title:'공고 탭도 열어볼까요?', text:'공고 탭은 모집공고를 목록으로 모아 보는 곳이에요. 버튼을 눌렀을 때 열리는 화면을 함께 볼게요.', nextLabel:'공고 목록 열어보기'},
  {target:'#announcement-results-panel', title:'이렇게 공고 목록이 열려요', text:'공고 탭을 누르면 모집공고가 목록으로 나타나요. 각 항목에서 기관·모집상태·공고명·일정을 확인하고, 공고를 선택하면 자세한 내용을 볼 수 있어요.', nextLabel:'다음'},
  {target:'#recent-list-trigger', title:'최근 본 단지를 다시 찾아요', text:'앞서 열어 본 단지가 모이는 곳이에요. 관심 있게 봤던 단지를 다시 확인할 때 사용합니다.', nextLabel:'다음'},
  {target:'button[aria-label="지도 확대"]', title:'확대하면 개별 단지가 보여요', text:'＋와 −로 지도를 확대하거나 축소할 수 있어요. 숫자 핀은 해당 지역의 단지 수예요. 이제 잠깐 자유롭게 사용해 보세요.', nextLabel:'직접 둘러보기'},
]
