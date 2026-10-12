import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = JSON.parse(readFileSync(new URL('../../infra/grafana/dashboards/api-load-test.json',
  import.meta.url), 'utf8'));
const cases = [
  ['GET /api/v1/complexes/42 200 15 a123 /api/v1/complexes/{complexId}',
    { method: 'GET', uri: '/api/v1/complexes/42', status: '200', durationMs: '15',
      traceId: 'a123', route: '/api/v1/complexes/{complexId}' }],
  ['GET /api/v1/complexes/42 200 15 a123 /api/v1/complexes/42',
    { method: 'GET', uri: '/api/v1/complexes/42', status: '200', durationMs: '15',
      traceId: 'a123', route: '/api/v1/complexes/42' }],
  ['GET /api/v1/locations/search 503 2300 test-trace /api/v1/locations/search',
    { method: 'GET', uri: '/api/v1/locations/search', status: '503', durationMs: '2300',
      traceId: 'test-trace', route: '/api/v1/locations/search' }],
];

for (const panel of dashboard.panels.filter(panel => [24, 25, 28].includes(panel.id))) {
  const { regExp } = panel.transformations.find(transform => transform.id === 'extractFields').options;
  // Grafana's RegExp extractor requires a /pattern/ literal; otherwise it silently uses NewField.
  assert.ok(regExp.startsWith('/') && regExp.endsWith('/'), `${panel.title}: missing regex delimiters`);
  const parser = new RegExp(regExp.slice(1, -1));
  for (const [line, expected] of cases) {
    assert.deepEqual({ ...parser.exec(line)?.groups }, expected, panel.title);
  }
  assert.equal(parser.exec('at java.lang.Thread.run(Thread.java:1)'), null);
}
console.log('Request field extraction: 12 cases passed');
