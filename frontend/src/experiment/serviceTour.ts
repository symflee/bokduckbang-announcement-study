import type { StudyTip } from './StudySpotlight'

export const SERVICE_TOUR: readonly (StudyTip & {nextLabel:string})[] = [
  {target:'#study-complex-tab', title:'여기는 공공주택 단지 지도예요', text:'공공주택 단지의 위치와 기본 정보를 볼 수 있어요. 먼저 주요 기능을 함께 살펴볼게요.', nextLabel:'다음'},
  {target:'.housing-search-overlay input[type="search"]', title:'원하는 지역이나 단지를 검색해요', text:'지역, 지하철역, 단지 또는 공고 이름으로 검색할 수 있어요. 원하는 동네로 바로 이동할 때 사용합니다.', nextLabel:'다음'},
  {target:'[data-study-filter="applicationStatus"]', title:'모집상태로 단지를 골라요', text:'공고중·접수중 등 모집상태에 따라 단지를 골라 볼 수 있는 필터예요.', nextLabel:'다음'},
  {target:'[data-study-filter="agency"]', title:'공급기관으로도 골라 볼 수 있어요', text:'LH·SH·GH 등 원하는 공급기관의 단지만 볼 수 있어요.', nextLabel:'다음'},
  {target:'#announcement-list-trigger', title:'공고 탭도 열어볼까요?', text:'공고 탭은 모집공고를 목록으로 모아 보는 곳이에요. 버튼을 눌렀을 때 열리는 화면을 함께 볼게요.', nextLabel:'공고 목록 열어보기'},
  {target:'#housing-list-page', title:'이렇게 공고 목록이 열려요', text:'공고 탭을 누르면 모집공고가 목록으로 나타나요. 각 항목에서 기관·모집상태·공고명·일정을 확인하고, 공고를 선택하면 자세한 내용을 볼 수 있어요.', nextLabel:'다음'},
  {target:'#recent-list-trigger', title:'최근 본 단지를 다시 찾아요', text:'앞서 열어 본 단지가 모이는 곳이에요. 관심 있게 봤던 단지를 다시 확인할 때 사용합니다.', nextLabel:'다음'},
  {target:'button[aria-label="지도 확대"]', title:'확대하면 개별 단지가 보여요', text:'＋와 −로 지도를 확대하거나 축소할 수 있어요. 숫자 핀은 해당 지역의 단지 수예요. 이제 소개한 버튼들을 하나씩 눌러 어떤 화면이 열리는지 확인해 보세요.', nextLabel:'직접 둘러보기'},
]
