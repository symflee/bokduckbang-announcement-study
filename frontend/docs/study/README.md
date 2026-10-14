# 공고지도 체험 운영

체험 사이트: https://bokduckbang-announcement-study.vercel.app
개인 fork: https://github.com/toctoce/bokduckbang-announcement-study
이슈: https://github.com/toctoce/bokduckbang-announcement-study/issues/1
설문: https://tally.so/r/jadN9a
설문 편집: https://tally.so/forms/jadN9a/edit
공식 시트 연동: https://tally.so/forms/jadN9a/integrations
응답·분석 시트: https://docs.google.com/spreadsheets/d/1b6mfHR-HUzuPGjoN95QHATpVUqcZ6QyOnkEw8pyAXBo

## 실행과 배포

Node 24.19.0 / npm 11.17.0에서 `frontend` 디렉터리로 이동한다.

```sh
npm ci
npm run dev
npm run check
npm run generate:study
```

Vercel의 Root Directory는 `frontend`, Framework는 Vite, Build는 `npm run build`, Output은 `dist`, Node는 24.x로 설정한다. 환경변수는 아래 두 개만 필요하다. 브라우저 공개 설정이며 비밀 서버 키는 사용하지 않는다.

- `VITE_NAVER_MAPS_CLIENT_ID`: NAVER Maps JavaScript SDK client ID. Naver Cloud의 Web 서비스 URL에 배포 도메인과 localhost를 등록한다.
- `VITE_TALLY_FORM_ID=jadN9a`: Tally 설문 ID.

실험 진입점은 `src/experiment/main.tsx`, 빌드 설정은 `vite.study.config.ts`다. 기존 운영 App과 개발용 스냅샷 로더는 보존한다. 운영 API·로그인·알림·거리뷰·운영 GA/PostHog를 초기화하지 않는다. 지역 경계 파일과 예시 JSON은 정적 파일로 요청한다. 공개 검색엔진에는 noindex로 표시한다.

## 데이터

`npm run generate:study`가 지역 자료와 작성 규칙으로 `public/study/national-500-v1.json`을 재생성한다. 500개 단지/30개 공고, 서울250/경기인천80/강원20/충청40/호남40/영남60/제주10, 공고중10/접수중16/마감4다. 기준일은 2026-10-14로 고정한다.

단지 이름·위치·모집조건은 합성 예시이며 실제 모집공고가 아니다. 기존 지역 대표점을 기준으로 구역 경계 안에 가상 위치를 분산한다. 읍면동 코드는 실험용 분류이며 실제 필지 주소를 뜻하지 않는다. 공개 서비스의 화면과 정보 구조를 참고했다. 운영 데이터를 복제하거나 운영 API에 의존하지 않는다.

지도는 동일한 조회 범위와 필터를 통과한 단지를 9/11/13 배율 경계로 집계한다. 지역 핀 숫자는 현재 조회 범위의 단지 수이며, 공고지도에서는 진행 중 공고가 하나 이상인 단지 수다. 복수 공고는 한 단지로 센다. 경계 밖 단지가 확대 후 추가로 들어오면 화면 전체 숫자는 달라질 수 있다. 테스트는 동일한 범위·조건에서 집계 합계와 개별 핀 수를 비교한다.

## 실험과 측정

시작 → 자유 체험 → 기존 과제 → 기존 안내 → 새 과제 → 새 안내 → 비교 → 설문 순서다. 두 과제 모두 서울 중심(37.5665,126.978), 배율11, 필터/상세 초기화 상태에서 시작한다. 메뉴는 PC 왼쪽, 모바일 하단에 있다. 새 방식 과제부터 공고지도 메뉴를 노출한다.

각 단계는 중앙 안내 모달에서 시작한다. 첫 번째·두 번째 과제는 각각 방법 1/2·2/2와 시작 버튼으로 구분한다. 안내 모달을 확인하고 시작 버튼을 누른 뒤, 지도와 데이터가 준비되고 탭이 보이는 동안만 시간을 누적한다. 도움은 요청/못 찾겠어요/60초 경과를 구분한다. 진행 중 공고를 직접 열고 상세가 표시되어야 성공이다. 마감 공고와 이전 과제의 늦은 응답은 성공이 아니다. 방법을 찾지 못하면 도움 후 건너뛸 수 있다. 동일 탭 새로고침은 sessionStorage로 복원한다. 시작 전에는 안내 모달을 다시 표시하며 중단으로 세지 않고, 시작한 과제만 `interrupted=true`로 표시한다. 오류와 재시도는 별도로 남긴다.

같은 세션으로 재제출할 수 있으므로 분석에서 `session_id`를 중복 제거한다. `?test=1`로 시작한 새 탭은 테스트 기록이며 분석에서 제외한다. 이미 진행 중인 탭의 테스트 여부는 저장된 상태를 유지한다. 새 탭에서 시작해야 새 참여번호가 생성된다.

## 설문 계약과 교체

`ExperimentSummary`는 지도·체험과 독립적인 공통 계약이다. `tallyAdapter.ts`만 Tally 숨김 필드 이름을 안다. 질문 버전 `survey-v1`, 실험 버전 `announcement-map-v2`, 데이터 버전 `national-500-v1`을 고정한다. 중앙 시작 모달을 추가한 실험 버전은 v2다. 이전 버전으로 진행 중이던 탭은 처음부터 시작한다. 설문 변경 시 질문 버전을 올리고 다른 버전은 섞지 않는다.

공통 질문 ID: `interest`, `ease_old`, `ease_new`, `preference`, `need`, `reasons`, `comment`. Tally 편집 화면의 실제 블록 ID와 이 공통 ID는 다른 개념이다. Tally 질문 제목은 시트 분석 계약이므로 문구를 바꾸면 분석 매핑도 수정한다.

숨김 필드(29개): `experiment_version`, `question_version`, `dataset_version`, `as_of`, `session_id`, `screen`, `is_test`와 old/new 각각 `outcome`, `success`, `unaided`, `help`, `help_reason`, `elapsed_ms`, `help_at_ms`, `paths`, `interrupted`, `errors`, `retries`.

iframe의 origin, source, formId를 확인한 Tally.FormSubmitted 이벤트만 완료로 인정한다. 새 창 대체 링크는 같은 필드를 전달하지만 외부 창의 완료는 원래 페이지에서 확인하지 못하므로 외부 설문의 완료 화면을 따른다. 15초 내 FormLoaded 이벤트가 없으면 대체 링크 안내를 표시한다. Tally 제출과 Google Sheets 동기화는 별도 검증한다.

Supabase로 바꿀 때 자체 설문 화면과 저장 endpoint/권한 정책을 추가하고 TallySurvey 어댑터를 교체한다. 지도와 체험 모듈은 유지한다. 기존 CSV는 공통 질문 ID와 ExperimentSummary 항목으로 변환해 이전한다.

## 파일럿과 결과 해석

1. 테스트 세션에서 PC·모바일 각각 기존 필터, 공고지도 핀, 복수 공고, 마감 공고, 새로고침, 네트워크 오류, 설문 제출을 확인한다.
2. 시트에서 동일 session_id에 질문 응답과 old/new 기록이 함께 들어왔는지 확인한다.
3. 공공주택 관심자 5명으로 파일럿한다. 중간에 UI·안내·데이터를 바꾸면 버전을 올린다.
4. 수정한 동일 버전으로 유효 응답 30개를 모은다. 테스트·중복·체험정보가 없는 직접 설문 응답은 분석에서 제외한다. 중단/오류 기록은 따로 집계하고 정상 소요시간 중앙값에서는 제외한다.
5. 선호 비율, 필요성 평균/4~5점 비율, 각 방식 도움 전 성공률·도움 사용률·성공자의 정상 소요시간 중앙값과 의견을 확인한다.

초기 검토 기준: 공고지도 선호60% 이상, 필요성4~5점60% 이상, 도움 전 성공률 기존 이상. 순서를 고정한 비교이므로 학습효과가 포함된다. 실제 사용량 증가나 인과효과의 증거로 해석하지 않는다. 제출 전 이탈자는 수집하지 않으며 참여자 모집과 파일럿 운영은 별도로 진행한다.

## Google Sheets 자동 요약

Tally는 `시트1`에 원본을 저장하고, `분석 요약`은 첫 500개 응답을 자동 계산한다. 원본 탭 이름과 열 순서는 유지한다. 테스트·중복·버전 불일치 응답을 제외하며, 아래 계산표 R:S열에서 선택 이유와 의견을 볼 수 있다. 500개를 넘으면 요약에 범위 확장 안내가 표시된다. 유효 응답이 없으면 비율·중앙값은 “응답 없음”으로 표시한다.

## CSV 재현 분석

Tally 또는 연결된 Google Sheets의 원본 CSV를 내려받아 `npm run analyze:study -- /path/to/export.csv`로 분석할 수 있다. 응답은 외부로 전송하지 않는다. Tally의 소문자 불리언과 Google Sheets의 대문자 TRUE/FALSE 내보내기를 모두 지원한다. 같은 session_id의 첫 유효 응답만 사용하고, 테스트·다른 버전·불완전한 기록은 제외한다. 정상 측정 기준의 도움 전 성공률과 도움 사용률, 성공자의 소요시간 중앙값을 계산한다. 중단·오류·재시도 기록은 정상 측정에서 제외한 개수를 함께 표시한다. 표본이 없으면 0이 아닌 null을 반환한다. 원본 응답 파일은 저장소에 커밋하지 않는다.
