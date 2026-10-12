# DB 서버 설정

## 환경변수

`.env.example`을 참고해서 `.env`를 생성한다.

## 실행

```shell
docker compose up -d
```

## 종료

```shell
docker compose down
```

## 공유 DB 호스트 CPU·메모리 수집

개발·운영·공유 PostgreSQL이 같은 서버에서 실행되므로 Node Exporter 한 개로 서버 전체의
CPU·메모리를 수집한다. Grafana의 환경 선택과 관계없이 같은 서버 자원을 보여준다.

Linux DB 서버에서 실행하며 CPU·meminfo collector만 사용한다. 호스트의 `/proc`를 읽기 전용으로
연결하고 PostgreSQL 계정이나 DB 접속은 사용하지 않는다.

### 적용 순서

1. DB 서버의 `.env`에 `.env.example`의 필수 설정을 준비한다.
   TCP 9100은 모니터링 서버에서만 접근할 수 있도록 제한한다.
2. DB 서버의 저장소 루트에서 수집기를 실행한다. 별도 Compose 프로젝트이므로 기존 DB
   컨테이너를 재생성하지 않는다.

   ```shell
   docker compose --project-name toadzip-db-metrics --env-file infra/db/.env \
     --file infra/db/compose.metrics.yaml up -d
   ```

3. 모니터링 서버의 `infra/prometheus/targets/db-host.json`에 수집 대상을 등록한다.
   원본은 빈 목록이며, `<수집 대상>`은 모니터링 서버에서 접근 가능한 호스트 이름으로 바꾼다.

   ```json
   [{"targets": ["<수집 대상>:9100"], "labels": {"role": "database"}}]
   ```

   처음에는 새 job·마운트를 적용하기 위해 Prometheus 컨테이너를 재생성한다.

   ```shell
   docker compose --env-file infra/monitoring/.env --file compose.monitoring.yaml \
     up -d --no-deps --force-recreate prometheus
   ```

   이후 대상 파일 변경은 15초 주기로 감지한다. 같은 서버를 dev·prod 대상으로 중복 등록하지 않는다.
4. Prometheus에서 `up{job="db-host"}`가 1인지 확인한다. `node_cpu_seconds_total`,
   `node_memory_MemAvailable_bytes`, `node_memory_MemTotal_bytes`가 같은 instance에 있어야 한다.
   Grafana의 API·부하테스트 대시보드에서 `공유 DB 호스트`를 선택한다.

### 지표 읽기

- CPU 사용률은 코어별 비유휴 시간의 평균이며 IO 대기를 포함한다. CPU가 높을 때 IO 대기
  추이도 함께 확인한다.
- 메모리 사용률은 `1 - MemAvailable/MemTotal`로 계산한다. 재사용 가능한 캐시를 고려하므로
  단순히 남은 메모리만 보는 값과 다르다.
- 수집되지 않거나 계산에 필요한 데이터가 부족하면 자원 값은 `—`다. 사용률 0%로 해석하지 않는다.
  수집 상태가 정상인 경우에만 CPU·메모리 값을 표시한다.

이 지표는 세 DB를 포함한 서버 전체 자원이다. 개별 DB 사용량·SQL 실행시간·락은 측정하지 않는다.
수집 성공도 PostgreSQL의 정상 응답을 보장하지 않는다. API 지연·오류와 기존 DB 연결풀 지표를
함께 확인해 서버 자원 부족인지 연결 대기인지 구분한다.

수집기 옵션은 [Node Exporter 공식 문서](https://github.com/prometheus/node_exporter)를 참고한다.
