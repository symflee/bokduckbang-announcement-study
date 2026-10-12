# SH HTML 파싱 표본

SH 파서 테스트의 입력 파일이다. 서비스 실행이나 DB 저장에는 사용하지 않는다.
실응답에서 입력 필드·목록/상세 표·담당부서와 첨부 JSON(`initParam.downList`)을 발췌했다.
메뉴·지도·화면 제어 스크립트와 스타일 속성은 제외하고 본문 구조와 첨부 버튼 순서는 보존한다.

| 파일 | 검증하는 차이 |
| --- | --- |
| `list.html` | 기존 목록 파서의 기본 입력과 오류 변형에 쓰는 최소 목록 |
| `list-main-search.html` | `모집` POST 검색 조건, 공고 452건과 우편번호 검색 529건의 구분 |
| `detail-main-311087.html` | 통합 게시판 상세와 목록 대조, 일반 본문과 PDF·ZIP 첨부 |
| `detail-310653.html` | 첨부 6개의 불연속 파일 ID(2·3·4·5·7·8), 정제 결과 저장·실패·재수집 |
| `detail-311005.html` | 본문 안의 중첩 표 3개에서 텍스트 추출 |

`NEW` 배지와 지역센터 첨부 코드(`DBGS01`, `GWJGS01`, `GNGS01`)는 대표 표본의 해당 값을
테스트에서 바꿔 검증한다. 동일한 구조의 게시글을 별도 파일로 중복 보관하지 않는다.

출처:

- `list-main-search.html`, `detail-main-311087.html`: 2026-10-11 [통합 게시판](https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/list.do) 응답.
- `detail-310653.html`, `detail-311005.html`: 2026-10-05 [주택임대 게시판](https://www.i-sh.co.kr/app/lay2/program/S48T561C563/www/brd/m_247/list.do?multi_itm_seq=2)의 해당 게시글 상세 응답.
