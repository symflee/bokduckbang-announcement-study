# 실험 분석 수집 운영

이 문서는 `announcement-map-v9`의 방문·행동 기록·힌트 집계·리플레이를 연결하고 검증하는 기준이다. 설문 문항은 `survey-v3`이며 체험 순서는 필터(`old`) → 공고지도(`new`)로 고정한다. 현재는 접속 시점부터 수집하며 동의 절차는 적용하지 않는다. 이전 `study-consent-v1` 기록은 저장 상태의 호환을 위해 보존한다.

## 연결 상태와 공개 전 준비

**코드 구현과 테스트는 실제 프로젝트 연결·이벤트 수신·리플레이 재생·Tally/Sheets 저장의 증거가 아니다.** 배포 환경의 공개 키와 수집 호스트가 실험용 프로젝트를 가리키는지 확인하고, 아래 절차로 실제 저장까지 검증한다. Tally 숨김 필드 추가와 Sheets 설정도 별도 확인 대상이다. 이 문서는 외부 설정을 자동 변경하지 않는다.

1. 운영 서비스와 다른 PostHog 프로젝트를 지정하고 공개 프로젝트 키·리전을 확인한다. `.env.example`의 `VITE_STUDY_POSTHOG_KEY`, `VITE_STUDY_POSTHOG_HOST`에 맞춰 배포 환경을 설정하고 다시 빌드한다. 서버 비밀키나 개인 API 토큰을 브라우저 설정에 넣지 않는다.
2. PostHog 프로젝트에서 **Record user sessions**를 켜고 녹화 대상 비율을 **100%**로 설정한다. 코드는 접속 후 SDK 초기화 시 녹화를 활성화하고 sampling·flag·URL·event trigger 제한을 해제해 녹화 시작을 요청한다. 이것은 모든 세션의 전송·재생 성공을 보장하지 않는다.
3. 프로젝트의 **Discard IP data**를 활성화한다. 코드는 `$ip:null`, `$geoip_disable:true`, `person_profiles:'never'`를 설정한다. SDK의 `ip:false`는 현재 버전에서 효과가 없으므로 이에 의존하지 않는다.
4. Tally에 `old_help_open_count`, `new_help_open_count` 숨김 필드를 추가한다. Google Sheets로 두 열이 전달되는지 확인하고 분석 버전 필터를 `announcement-map-v9`로 맞춘다. 전체 숨김 필드는 [설문 계약](README.md#설문-계약과-교체)의 36개다.
5. 테스트 참여 한 건으로 이벤트·리플레이·Tally 응답·Sheets 저장값을 대조한 후 공개한다. 설정·배포·수신·재생은 각각 확인 날짜와 근거를 남긴다.

PostHog 두 환경 값이 없거나 허용되지 않은 호스트이면 수집이 꺼진다. 허용 호스트는 미국 `https://us.i.posthog.com`, 유럽 `https://eu.i.posthog.com`이다. 설정 누락이나 SDK 차단·통신 실패가 체험과 Tally 설문을 막지는 않는다.

## 시작 시점과 기록 범위

`useStudyPageVisit`은 페이지 접속 후 데이터가 로딩되는 동안부터 SDK를 초기화한다. 첫 화면의 **시작할게요**는 서비스 소개를 시작하는 버튼이며 수집 동의를 기록하지 않는다. 첫 안내에서 수집 목적·항목·도구, 접속부터의 리플레이와 제출 전 이탈 기록, 일주일 운영과 종료 후 보관 방침을 설명한다. **참여하지 않기**는 탭을 닫아 참여를 끝낼 수 있고 이미 수집된 기록은 남는다는 안내를 보여 준다.

데이터 로딩 중 발생한 페이지뷰의 `phase`는 `loading`이다. `dataset_version`은 데이터 요청 경로와 공유하는 현재 데이터셋 버전을 사용한다. 이전 데이터셋의 진행 상태는 새 참여번호로 시작하고, 같은 데이터셋의 새로고침은 참여번호를 유지한다. 데이터가 준비되면 같은 참여번호의 문맥을 진행 단계로 갱신한다. `study_started`는 방문과 구분하며 첫 안내를 나와 체험을 시작할 때 기록한다.

이름·연락처·계정 식별을 받지 않는다. 난수 참여번호를 PostHog의 `study_session_id`와 Tally의 `session_id`에 공통 사용한다. 난수 식별자가 있다는 이유만으로 모든 원시 기록이 비식별 자료가 되는 것은 아니다. 정밀 시각, 자유서술과 화면 내용을 포함한 보존본 검토는 종료 절차에 포함한다.

- PostHog: 접속 시점부터 `$pageview`·`$pageleave`, 명시적 행동 이벤트와 부모 체험 화면의 리플레이.
- Tally 및 연동 Google Sheets: 최종 설문 응답과 체험 요약. 자유서술 응답을 PostHog 이벤트에 복사하지 않는다.
- sessionStorage: 참여번호, 진행 상태, 힌트 이력과 SDK 중복 방지 정보. 새 시작은 `consent:null`을 유지하고 이전 유효한 동의 기록만 보존한다. 운영 서비스 식별자를 재사용하지 않는다.

운영 GA/PostHog 수집기는 변경하거나 초기화하지 않는다. 전용 수집기의 소유자는 `src/experiment/studyAnalytics.ts`이며, SDK 초기화·정제·종료가 이 경계에 모여 있다.

## 이벤트 사전

공통 속성은 `study_session_id`, `experiment_version`, `question_version`, `dataset_version`, `method_order`(`old,new`), `is_test`, `screen`(`desktop`/`mobile`), `phase`, `method`(`old`/`new`/`none`), `event_id`다. PostHog의 세션·창 식별자는 이벤트와 리플레이 연결에 사용한다. `event_id`는 이벤트마다 생성하며 주요 상태 전이는 별도의 안정된 키로 중복 전송을 막는다.

| 이벤트 | 발생 기준 | 추가 속성 |
| --- | --- | --- |
| `$pageview` | 페이지 접속 후 SDK 초기화, 새로고침은 새 페이지뷰 | SDK 페이지뷰 ID와 브라우저·화면 정보 |
| `$pageleave` | `beforeunload` 또는 `pagehide`에서 방문당 한 번 즉시 전송 | 이전 페이지뷰 ID·체류시간 등 SDK 페이지 정보 |
| `study_started` | 첫 안내를 나와 체험을 시작, 참여번호당 한 번 | 공통 속성 |
| `study_tour_step_viewed` | 소개 단계 진입 | `tour_step` 1~10 |
| `study_phase_entered` | 소개·자유 탐색·과제·설문 등 단계 진입 | 공통 `phase` |
| `study_method_started` | 방법 시작 안내를 닫고 과제를 시작 | 공통 `method` |
| `study_control_clicked` | 허용한 실제 조작 | `control` |
| `study_hint_opened` | 힌트 닫힘 → 열림 | 아래 힌트 속성 |
| `study_announcement_opened` | 요청한 공고 상세가 실제 표시됨 | `status`, `source` |
| `study_method_completed` | 지정 경로로 과제 완료 | `outcome`, `source`, `elapsed_ms`, `help_open_count`, `errors`, `retries` |
| `study_method_rated` | 과제 직후 평가 선택 | `ease` 1~5 또는 `unsure` |
| `study_error` | 지도·데이터·상세 오류 | `surface`: `map`/`data`/`detail` |
| `study_retry` | 재시도 조작 | 공통 단계·방법 |
| `study_survey_submitted` | 검증된 Tally iframe 제출 이벤트 | 참여번호당 한 번 |

`control` 허용값은 다음과 같다. 단순한 메뉴 방문과 실제 핀 선택은 서로 다른 값이다.

```text
mode_complexes, mode_announcements,
filter_open, filter_apply, filter_reset,
complex_pin, announcement_pin, aggregate_pin,
complex_list_item, announcement_list_item, search_result, announcement_choice,
detail_close, detail_back, announcement_list_toggle, recent_list_toggle,
search_submit, map_zoom_in, map_zoom_out,
tour_previous, tour_next, explore_more, survey_start
```

지도 이동·필터·상세 선택에 따른 URL 쿼리 변경은 추가 페이지뷰로 세지 않는다. 온보딩에서 자동으로 연 필터는 `filter_open` 클릭으로 세지 않는다. 공고 상세의 `source`는 `filtered_complex`, `announcement_pin`, `other`이며 탭 방문 이력만으로 정하지 않는다. Tally의 `paths`는 중복 제거 목록이므로 클릭 횟수로 해석하지 않는다.

힌트 이벤트는 다음 속성을 함께 기록한다.

| 속성 | 의미 |
| --- | --- |
| `help_open_count` | 해당 방법에서 몇 번째 열기인지, 1부터 시작 |
| `first_help_at_ms`, `elapsed_ms` | 최초·현재 힌트 사용 시점의 유효 탐색 시간 |
| `hint_code` | 화면에 표시한 문구와 같은 분기에서 결정한 코드 |
| `map_mode`, `status_filtered` | 지도 모드와 진행 중 모집상태 필터 적용 여부 |
| `map_view` | `aggregate`/`individual`/`empty` |
| `detail_state` | `none`/`complex-active`/`complex-empty`/`announcement` |
| `complex_from_filtered_pin` | 필터된 단지 핀으로 진입했는지 |
| `choices_open`, `list_open` | 복수 공고 선택창·공고 목록 열림 여부 |

힌트 코드는 `switch_to_announcement_map`, `choose_another_complex`, `choose_announcement`, `pan_or_zoom_out`, `zoom_into_area`, `open_announcement_pin`, `apply_status_filter`, `open_complex_announcement`, `return_to_filtered_map`, `select_complex_pin`이다. 힌트 읽는 시간은 탐색 시간에 포함하지 않으며 복원된 이력은 다시 전송하지 않는다.

## 리플레이와 수집 제한

클릭은 무제한 자동 수집하지 않고 위 이벤트를 명시적으로 보낸다. `capture_pageview:true`, `disable_session_recording:false`로 방문과 녹화를 시작한다. 자동 이탈은 `capture_pageleave:false`로 끄고, `beforeunload`의 capture 단계에서 SDK가 종료 상태가 되기 전에 `$pageleave`를 `sendBeacon`·`send_instantly:true`로 전송한다. `pagehide`를 보조 경로로 사용하며 둘이 발생해도 한 번만 보낸다. 탭 숨김·포커스 변경은 이탈로 세지 않는다. BFCache에서 복원되면 저장된 참여번호를 유지한 새 SDK 인스턴스로 방문과 녹화를 재개한다. 브라우저 강제 종료나 통신 차단 시 이탈 수신은 보장할 수 없다.

검색 원문, 정확한 지도 좌표, 원시 URL 쿼리·해시·referrer, 자유서술과 원문 오류 메시지는 이벤트 속성에 넣지 않는다. 사용자 프로필 생성, 예외·콘솔·네트워크 본문·헤더·성능 수집은 끈다.

입력값과 `data-study-sensitive` 영역의 검색 문구를 가린다. DOM의 링크·이미지 주소와 리플레이 페이지 메타데이터 주소도 쿼리·해시를 제거한다. `.map-surface` 안 Canvas만 녹화 대상으로 허용하고 다른 Canvas는 건너뛴다. 지도 캡처는 4fps, 품질 0.4로 설정하며 실제 NAVER 지도 재생 품질은 브라우저와 PostHog에서 확인해야 한다.

iframe은 리플레이에서 차단한다. 외부 Tally 설문 내부는 부모 리플레이의 관찰 범위가 아니다. 새 창에서 설문을 제출하면 원래 페이지에서 제출을 확인할 수 없으므로 PostHog 완료 이벤트가 없다는 이유만으로 미제출을 단정하지 않는다.

근거: [PostHog 리플레이 제어](https://posthog.com/docs/libraries/js/usage#session-replay), [입력·화면 마스킹](https://posthog.com/docs/session-replay/privacy), [Canvas 캡처](https://posthog.com/docs/session-replay/canvas-recording), [iframe 범위](https://posthog.com/docs/session-replay/iframes).

## 수집 확인과 결과 해석

로컬 Vite 개발 서버에서 개발자 도구 콘솔로 상태를 확인할 수 있다. 이 명령은 **로컬 개발 모듈 경로**이며 배포된 정적 사이트의 콘솔 경로가 아니다.

```js
const loadedUrl = performance.getEntriesByType('resource')
  .filter(entry => /\/src\/experiment\/studyAnalytics\.ts(?:\?|$)/.test(entry.name))
  .at(-1)?.name
const status = loadedUrl
  ? (await import(loadedUrl)).getStudyAnalyticsStatus()
  : { status: 'collector-module-not-loaded' }
status
```

HMR 중에는 `?t=...`가 붙은 실제 로딩 URL을 사용한다. 임의로 모듈 경로를 다시 import하면 새 모듈 인스턴스의 상태를 보고 기존 수집기가 꺼졌다고 잘못 판단할 수 있다.

`status`는 `idle`, `disabled`, `loading`, `ready`, `failed` 중 하나다. `replayStarted`는 SDK의 현재 녹화 상태이며, `requestFailures`, `droppedEvents`, `pendingEvents`는 진단용 카운터다. `ready`는 서버 수신을 뜻하지 않는다. SDK 로딩 중 대기열은 최대 200건이며 안정된 이벤트 키는 같은 세션에서 최대 1,000건 유지한다. 이벤트 정제 시 `$recording_status`, `$session_recording_start_reason`, `$replay_sample_rate`, `$sdk_debug_recording_script_not_loaded` 등 SDK 리플레이 진단 속성을 유지한다. 해당 속성이나 녹화 시작 상태만으로 실제 저장을 판단하지 않는다.

Playwright 등 자동화 브라우저에서는 SDK의 봇 필터가 이벤트를 차단할 수 있다. 일반 Chrome user agent만 바꿔도 `navigator.webdriver`나 `navigator.userAgentData.brands`에 자동화 신호가 남으면 `ready`·`replayStarted:true`와 설정 조회만 보이고 이벤트 POST는 없을 수 있다. 패킷 정제 테스트는 외부 요청을 가로채 검증할 수 있지만 실제 저장 확인에서는 요청을 PostHog로 보내야 한다. 일반 브라우저 또는 테스트로 표시한 별도 세션을 사용하고 서비스의 봇 필터는 유지한다. [PostHog 자동화 브라우저 안내](https://posthog.com/docs/product-analytics/troubleshooting)

실제 확인 순서는 다음과 같다.

1. `?test=1` 새 세션에서 시작 버튼을 누르기 전 `$pageview` 전송과 녹화 시작을 확인한다. 데이터 로딩이 늦거나 실패해도 페이지 방문이 수집되는지 확인한다. 시작 버튼을 누르기 전에는 `study_started`가 없어야 한다.
2. 소개, 필터 과제, 힌트 반복 열기, 공고지도 과제, 평가·설문을 진행한다. 원시 입력·URL 쿼리를 보내지 않는지 확인한다. 지도·필터·상세의 쿼리 변경만으로 `$pageview`가 늘어나면 안 된다. 다른 페이지로 이동하거나 탭을 닫아 `$pageleave`가 전송되고 저장되는지도 확인한다.
3. 같은 참여번호로 PostHog의 클릭·힌트 이벤트를 확인한다. 한 번 열고 닫고 다시 연 경우 두 건이어야 하며 새로고침으로 과거 힌트가 늘어나면 안 된다.
4. PostHog 리플레이를 재생해 지도·핀·필터·상세·힌트와 마스킹을 확인한다. SDK 시작 여부, 전송 요청, 서버 수신과 재생 가능 여부를 각각 기록한다.
5. Tally와 Sheets에서 같은 참여번호, v9, `old_help_open_count`·`new_help_open_count`, 최초 힌트 시점이 실제 값과 같은지 확인한다. iframe 제출과 새 창 대체 제출을 구분한다.

PostHog의 방법 시작자를 분모로 한 행동 지표와 Tally의 설문 제출자를 분모로 한 선호·편리함 지표를 섞지 않는다. 전송 실패, SDK 차단과 새 창 제출이 있으므로 마지막 기록만으로 확정 이탈을 판정하지 않는다. 테스트 기록은 `is_test=true`로 제외한다. 고정 순서·온보딩·예시 데이터가 있는 실험이므로 결과를 실제 서비스의 자연 사용률로 해석하지 않는다.

### 2026-10-15 기존 로컬 브라우저 확인

아래는 접속 즉시 수집으로 변경하기 전의 검증 기록이다. Chrome에서 테스트 프로젝트 키와 로컬 응답 가로채기를 사용했다. **PostHog 외부 요청은 전부 로컬에서 응답했으며 공급자에게 전송하지 않았다.** SDK의 봇 감지를 그대로 둔 자동화 세션은 이벤트가 차단됐고, 검증용 브라우저 신호를 일반 Chrome 조건으로 맞춘 세션은 누락 없이 다음 패킷을 생성했다.

- `/e/`의 `study_started`, `study_phase_entered`, `study_tour_step_viewed`와 `/s/`의 `$snapshot`을 확인했다. 각 패킷에 프로젝트 토큰, UUID, 난수 참여번호, 세션·창 식별자가 유지된다.
- gzip으로 압축된 리플레이 내부까지 해제해 테스트 입력값은 `[masked]`, 민감 영역의 출력 문구는 별표, 링크는 쿼리·해시 없는 주소로 남는 것을 확인했다. URL·입력·출력·iframe에 넣은 테스트 문자열 8개는 정제된 전체 패킷에 없었다.
- 실제 지도 안에 `mapboxgl-canvas`가 생성되고 그 노드의 Canvas 프레임이 리플레이에 포함됐다. 지도 밖에 둔 테스트 Canvas는 프레임이 전송되지 않았다. DOM 타일만 존재하는 화면으로 판단하지 않았다.
- PC(1440×1000)와 모바일(390×844)에서 소개 10단계, 필터 미적용 안내, 핀 3종, 중앙 모달·자유 탐색·포커스 복원, 힌트 반복 열기와 새로고침 복원을 확인했다. 소개 종료 시 모바일 상세 모달이 남아 자유 탐색을 막던 문제도 수정하고 재검증했다.
- PC에서 필터 → 공고지도 과제를 실제 핀으로 완료했다. 필터 힌트 2회·공고지도 힌트 1회가 로컬 상태, PostHog 이벤트, Tally iframe URL의 숨김 필드에서 일치했다. 새로고침 후 과거 힌트는 재전송되지 않았고, 방법별 시작·완료·평가와 로컬 Tally 제출 확인 이벤트는 각각 한 번 기록됐다. Tally는 로컬 테스트 응답으로 대체했으므로 공급자 저장 확인은 아니다.
- 최종 `npm run check`에서 lint, 167개 파일의 테스트 2,459개, TypeScript 검사와 Vite 빌드가 통과했다. 빌드의 번들 크기 경고는 남아 있다.

이 결과는 당시 브라우저의 패킷 생성·정제·Canvas 프레임 포함을 확인한 것이다. **현재 코드의 실제 PostHog 수신, 플레이어의 지도 화질·재생, Tally/Sheets 저장은 위 절차로 별도 검증해야 한다.** 개인별 원시 패킷이나 로컬 검증 산출물을 저장소에 커밋하지 않는다.

## 일주일 운영 종료 절차

보관 방침은 **페이지와 식별자를 제거하고, 사용자를 식별할 수 없도록 처리한 실험 기록을 보존**하는 것이다. 사이트 종료만으로 PostHog·Tally·Sheets 데이터가 삭제되지는 않는다. 자동 삭제 기능은 구현하지 않는다. 담당자가 각 저장처의 결과를 확인하고 처리 일자를 남긴다.

1. **수집 중단:** 참여 모집을 종료하고 종료 화면으로 전환한다. 활성 수집 경로와 배포 설정을 닫고 새 이벤트가 더 들어오지 않는지 확인한다.
2. **비식별 보존본 작성:** 필요한 집계·러닝을 먼저 만든다. 참여번호, PostHog의 distinct/device/session/window 식별자, Tally 응답 ID, 연결표, 리플레이 URL·식별자, 원시 URL, 정밀 시각을 제거한다. 자유서술·희귀 조합·화면 내용으로 특정인을 알아볼 수 있는지 검토하고 필요하면 요약·범주화·삭제한다. 단순히 참여번호를 다시 난수로 바꾸는 것만으로 처리를 끝내지 않는다.
3. **식별 가능한 원본 정리:** 보존본을 확인한 뒤 PostHog 이벤트·리플레이, Tally 원본, Google Sheets 원본·내보낸 파일·별도 연결표 등 실제 저장처를 정리한다. 리플레이는 식별자만 지워도 화면 내용이 남을 수 있어 비식별 기준을 충족하지 못하면 원본을 보존하지 않는다. 공급자의 삭제 범위·완료 상태를 확인하며 즉시 물리 삭제가 보장된다고 기록하지 않는다.
4. **페이지 제거:** 배포와 접근 경로를 제거하고 종료를 확인한다. 최종 공유 자료에는 개인별 연결 정보 없는 집계·러닝과 삭제 처리 근거만 남긴다.

PostHog의 기본 보존 기간은 일주일짜리 자동 삭제 설정이 아니다. 실제 데이터 삭제 기능을 별도로 사용한다. [PostHog 보존 기간과 삭제 구분](https://posthog.com/docs/data/events-retention)
