"""Generate promtool cases from the shipped dashboard's actual expressions."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DASHBOARD = ROOT / "infra/grafana/dashboards/api-load-test.json"
panels = {panel["title"]: panel for panel in json.loads(DASHBOARD.read_text())["panels"]}


def expression(title, ref="A", environment="dev", api=".*", scope="/api/v[0-9]+/.*|/api/auth/.*",
               selected_range="5m", rate_interval="5m"):
    query = next(target["expr"] for target in panels[title]["targets"] if target["refId"] == ref)
    for variable, value in {
        "$environment": environment,
        "${scope:raw}": scope,
        "${api:regex}": api,
        "${api}": api,
        "${method:regex}": ".*",
        "$__rate_interval": rate_interval,
        "$__range": selected_range,
    }.items():
        query = query.replace(variable, value)
    return query


series = []


def counter(name, environment, uri, increment, **labels):
    tags = {"job": "backend", "environment": environment, "method": "GET", "uri": uri, **labels}
    selector = ", ".join(f'{key}="{value}"' for key, value in tags.items())
    series.append({"series": f"{name}{{{selector}}}", "values": f"0+{increment}x6 {increment * 6}x4"})


map_uri = "/api/v2/complexes/map"
quiet_uri = "/api/v1/quiet"
counter("http_server_requests_seconds_count", "dev", map_uri, 54, status="200")
counter("http_server_requests_seconds_count", "dev", map_uri, 6, status="500")
counter("http_server_requests_seconds_count", "prod", map_uri, 60, status="200")
counter("http_server_requests_seconds_count", "dev", quiet_uri, 0, status="200")
counter("http_server_requests_seconds_count", "dev", "/api/health", 600, status="200")
counter("http_server_requests_seconds_count", "dev", "/api/admin/ingest/test", 60, status="200")

# dev: 90% <= 0.1s, 100% <= 0.5s; prod: 90% <= 1s, 100% <= 2s.
for status, buckets in {"200": {"0.1": 54, "0.5": 54, "+Inf": 54},
                        "500": {"0.1": 0, "0.5": 6, "+Inf": 6}}.items():
    for bound, increment in buckets.items():
        counter("http_server_requests_seconds_bucket", "dev", map_uri, increment, status=status, le=bound)
for bound, increment in {"1": 54, "2": 60, "+Inf": 60}.items():
    counter("http_server_requests_seconds_bucket", "prod", map_uri, increment, status="200", le=bound)


def case(title, value=None, ref="A", labels="{}", eval_time="5m", **variables):
    query = expression(title, ref, **variables)
    samples = []
    if value is not None:
        # Histogram interpolation introduces floating-point rounding, not a behavior difference.
        query = f"abs(({query}) - {value}) < bool 1e-9"
        samples = [{"labels": labels, "value": 1}]
    return {"expr": query, "eval_time": eval_time, "exp_samples": samples}


cases = [
    case("요청량 · RPS", 1),
    case("요청량 · RPS", 1, environment="prod"),
    case("요청량 · RPS", 2, scope="/api/.*"),
    case("응답시간 · p95", 0.3),
    case("응답시간 · p99", 0.46),
    case("응답시간 · p95", 1.5, environment="prod"),
    case("5xx · 선택 기간", 30),
    case("5xx · 선택 기간", 0, environment="prod"),
    case("5xx 비율 · 최근 구간", 10),
    case("5xx 비율 · 최근 구간", 0, environment="prod"),
    # A quiet API has no defined error ratio; it must not look like a healthy 0%.
    case("5xx 비율 · 최근 구간", api=quiet_uri),
    # A missing API has no request series; it must not become an artificial zero.
    case("요청량 · RPS", api="/api/v1/missing"),
    case("API별 비교 · p95 높은 순", 0.3, ref="C",
         labels='{environment="dev", method="GET", uri="/api/v2/complexes/map"}'),
    # The test finished four minutes ago: the API comparison must still show its latency.
    case("API별 비교 · p95 높은 순", 0.3, ref="C", eval_time="10m",
         selected_range="10m", rate_interval="2m",
         labels='{environment="dev", method="GET", uri="/api/v2/complexes/map"}'),
    case("요청량 · RPS", 0, eval_time="10m", selected_range="10m", rate_interval="2m"),
]

alerts = json.loads((ROOT / "infra/grafana/alerting/api.json").read_text())["groups"][0]["rules"]
alert_queries = {rule["uid"]: rule["data"][0]["model"]["expr"] for rule in alerts}
map_labels = ',method="GET",uri="/api/v2/complexes/map"'
cases.extend([
    {"expr": f'abs(({alert_queries["ffzwnhv1aehvke"]}) - 0.3) < bool 1e-9',
     "eval_time": "5m", "exp_samples": [
         {"labels": '{environment="dev"' + map_labels + '}', "value": 1},
         {"labels": '{environment="prod"' + map_labels + '}', "value": 0}]},
    {"expr": f'(({alert_queries["ffzwnhv1aehvke"]}) > 1) > bool 0',
     "eval_time": "5m", "exp_samples": [
         {"labels": '{environment="prod"' + map_labels + '}', "value": 1}]},
    {"expr": alert_queries["ffzwjb7en864ga"], "eval_time": "5m", "exp_samples": [
        {"labels": '{environment="dev"' + map_labels + '}', "value": 30},
        {"labels": '{environment="prod"' + map_labels + '}', "value": 0},
        {"labels": '{environment="dev",method="GET",uri="/api/v1/quiet"}', "value": 0},
        {"labels": '{environment="dev",method="GET",uri="/api/admin/ingest/test"}', "value": 0}]},
    {"expr": alert_queries["ffzwjb7en864ga"], "eval_time": "10m", "exp_samples": [
        {"labels": '{environment="dev"' + map_labels + '}', "value": 0},
        {"labels": '{environment="prod"' + map_labels + '}', "value": 0},
        {"labels": '{environment="dev",method="GET",uri="/api/v1/quiet"}', "value": 0},
        {"labels": '{environment="dev",method="GET",uri="/api/admin/ingest/test"}', "value": 0}]},
])

print(json.dumps({"rule_files": [], "evaluation_interval": "1m", "tests": [{
    "name": "environment isolation, histogram aggregation and quiet/missing traffic",
    "interval": "1m", "input_series": series, "promql_expr_test": cases,
}]}, ensure_ascii=False, indent=2))
