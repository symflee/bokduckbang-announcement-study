# SH HTML 파싱 표본

기존 SH 수집·PDF 작업 브랜치의 공식 게시판 HTML 표본을 사용한다. 첨부파일 바이트는 포함하지 않는다.

- 공식 목록: https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/m_247/list.do?multi_itm_seq=2
- 상세: 같은 경로의 `view.do?seq={게시글 식별자}&multi_itm_seq=2`
- `list-page1.html`, `detail-310653.html`, `detail-311005.html`: 2026-10-05 확인한 HTML 발췌. 메뉴·외부 스크립트·추적 코드를 제외하고 목록·상세 표와 첨부 메타데이터·담당부서를 보존했다.
- `*-20261007.html`: 2026-10-07 수집한 응답에서 게시판 필드·목록/상세 표·담당부서·첨부 스크립트를 발췌했다. 신규 게시글 표시와 지역센터 첨부 코드(`DBGS01`, `GWJGS01`, `GNGS01`)를 검증한다.
- `310653`: 첨부 6개, 실제 `fileSeq`는 2·3·4·5·7·8이다. 버튼 순번과 파일 ID를 구분한다.
- `311005`: 본문 중첩 표 3개와 PDF 첨부 1개다. 본문 형식은 보존하고 일정·자격·공급 필드로 추정하지 않는다.

- `list-main-search.html`, `detail-main-311087.html`: 2026-10-11 통합 게시판 `https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/` 실응답에서 같은 필드를 발췌했다. 목록은 전체 분류에 `모집` POST 검색을 사용하며 공고 452건과 우편번호 검색 529건을 구분한다.
