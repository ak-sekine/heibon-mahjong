import assert from 'node:assert/strict';
import test from 'node:test';
import { describeIframeContext, formatOriginDiagnosticInfo, getOriginDiagnosticInfo } from '../src/online/diagnostics.ts';

const buildInfo = {
  gitSha: 'abc123def456', buildTimeUtc: '2026-11-05T00:00:00.000Z',
  appVersion: '0.1.0', mode: 'production', schemaVersion: 2, buildId: 'abc123def456@2026-11-05',
};

test('Origin diagnostics keep only the execution and API origins and label distribution mode', () => {
  const pages = getOriginDiagnosticInfo({
    origin: 'https://ak-sekine.github.io', hostname: 'ak-sekine.github.io', insideIframe: 'いいえ',
    mode: 'production', apiUrl: 'https://heibon-mahjong-online.ak-sekine.workers.dev/api/rooms?ticket=secret#fragment', buildInfo,
  });
  assert.equal(pages.executionOrigin, 'https://ak-sekine.github.io');
  assert.equal(pages.executionHost, 'ak-sekine.github.io');
  assert.equal(pages.insideIframe, 'いいえ');
  assert.equal(pages.buildMode, 'Pages');
  assert.equal(pages.apiOrigin, 'https://heibon-mahjong-online.ak-sekine.workers.dev');
  assert.equal(pages.buildSha, buildInfo.gitSha);
  assert.equal(pages.buildId, buildInfo.buildId);
  const itch = getOriginDiagnosticInfo({
    origin: 'https://html-classic.itch.zone', hostname: 'html-classic.itch.zone', insideIframe: 'はい',
    mode: 'itch', apiUrl: 'https://worker.example/', buildInfo,
  });
  assert.equal(itch.executionOrigin, 'https://html-classic.itch.zone');
  assert.equal(itch.buildMode, 'itch');
  assert.equal(itch.insideIframe, 'はい');
  assert.equal(getOriginDiagnosticInfo({ origin: 'http://localhost:5173', hostname: 'localhost', insideIframe: 'いいえ', mode: 'development', buildInfo }).buildMode, 'development');
});

test('opaque, unavailable, and invalid runtime metadata remain displayable without throwing', () => {
  const opaque = getOriginDiagnosticInfo({
    origin: 'null', hostname: '', insideIframe: '判定できません（SecurityError）', mode: 'itch',
    apiUrl: 'not a URL', buildInfo,
  });
  assert.match(opaque.executionOrigin, /Opaque Origin/u);
  assert.equal(opaque.executionHost, '（なし）');
  assert.equal(opaque.apiOrigin, '取得できません');
  const text = formatOriginDiagnosticInfo(opaque);
  assert.match(text, /HTTP Request Origin: 未確認/u);
  assert.match(text, /WebSocket Request Origin: 未確認/u);
  assert.doesNotMatch(text, /ticket=|fragment|not a URL/u);
});

test('iframe detection catches SecurityError and returns a displayable status', () => {
  assert.equal(describeIframeContext({}, () => ({})), 'はい');
  assert.equal(describeIframeContext({}, () => { throw new DOMException('blocked', 'SecurityError'); }), '判定できません（SecurityError）');
});
