"""Check the shipped DB host queries with multi-core, shared-host and scrape-failure data."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
panels = {p["id"]: p for p in json.loads(
    (ROOT / "infra/grafana/dashboards/api-load-test.json").read_text())["panels"]}


def expr(panel, host="db-one:9100", ref="A"):
    query = next(t["expr"] for t in panels[panel]["targets"] if t["refId"] == ref)
    return query.replace("$db_host", host).replace("$__rate_interval", "5m")


def tags(host, **labels):
    return {"job": "db-host", "instance": host, "role": "database", **labels}


def series(metric, labels, values):
    selector = ",".join(f'{k}="{v}"' for k, v in labels.items())
    return {"series": f"{metric}{{{selector}}}", "values": values}


inputs = []
for host, idle, available in [("db-one:9100", (30, 42), 600), ("db-two:9100", (54, 54), 200)]:
    inputs += [series("up", tags(host), "1x5 0x3" if host.startswith("db-one") else "1x9"),
               series("node_memory_MemTotal_bytes", tags(host), "1000x9"),
               series("node_memory_MemAvailable_bytes", tags(host), f"{available}x9")]
    for cpu, rate in enumerate(idle):
        inputs += [series("node_cpu_seconds_total", tags(host, cpu=str(cpu), mode="idle"), f"0+{rate}x9"),
                   series("node_cpu_seconds_total", tags(host, cpu=str(cpu), mode="iowait"), "0+6x9")]

# An application exporter must never be included in the database host average.
inputs.append(series("node_cpu_seconds_total", {"job": "backend", "instance": "db-one:9100",
                                              "cpu": "0", "mode": "idle"}, "0+60x9"))


def case(panel, value=None, host="db-one:9100", time="5m", ref="A", host_only=False):
    query = expr(panel, host, ref)
    labels = '{instance="' + host + '"}' if host_only else (
        '{instance="' + host + '",job="db-host",role="database"}')
    samples = []
    if value is not None:
        query = f"abs(({query}) - {value}) < bool 1e-9"
        samples = [{"labels": labels, "value": 1}]
    return {"expr": query, "eval_time": time, "exp_samples": samples}


cases = [
    case(30, 1), case(31, 40, host_only=True), case(32, 40),
    case(33, 10, ref="B", host_only=True),
    case(34, 400), case(34, 600, ref="B"), case(34, 1000, ref="C"),
    case(31, 10, host="db-two:9100", host_only=True), case(32, 80, host="db-two:9100"),
    # Historical samples still exist; a failed current scrape must hide stale resource readings.
    case(30, 0, time="7m"), case(31, time="7m"), case(32, time="7m"),
    case(33, time="7m", ref="B"), case(34, time="7m"),
    case(30, host="unregistered:9100"), case(31, host="unregistered:9100"),
    case(32, host="unregistered:9100"), case(31, time="0m"),
]

print(json.dumps({"rule_files": [], "evaluation_interval": "1m", "tests": [{
    "name": "shared host isolation, multi-core average and missing/failed collection",
    "interval": "1m", "input_series": inputs, "promql_expr_test": cases,
}]}, indent=2))
