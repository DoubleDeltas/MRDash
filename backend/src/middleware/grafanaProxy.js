import http from 'node:http';
import https from 'node:https';
import { grafanaBaseUrl } from '../util/grafanaApi.js';

// /api/grafana/* → 같은 Docker 네트워크의 Grafana 컨테이너 (MRDash 전용 엔진).
// 인증은 MRDash 세션 하나만 쓴다: 로그인한 사용자만 통과시키고, Grafana auth.proxy가 믿는 헤더에
// MRDash 사용자를 실어 보낸다. Grafana 쪽 설정은 grafana/README.md 참고.
//
// Grafana는 root_url=<도메인>/api/grafana/, serve_from_sub_path=true로 떠 있어서 경로를 그대로 넘긴다.
export const GRAFANA_PATH = '/api/grafana';

// 클라이언트가 직접 보낸 인증 헤더는 버린다 (MRDash가 붙인 값만 Grafana에 도달해야 한다)
const STRIPPED_REQUEST_HEADERS = ['authorization', 'x-webauth-user'];

// MRDash 세션 쿠키는 Grafana에 넘길 이유가 없다
const withoutSessionCookie = (cookieHeader) => (cookieHeader || '')
  .split(';')
  .map((part) => part.trim())
  .filter((part) => part && !part.startsWith('connect.sid='))
  .join('; ');

export const grafanaProxy = (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).type('text/plain').send('MRDash 로그인이 필요합니다.');
    return;
  }

  const target = new URL(req.originalUrl, grafanaBaseUrl());
  const client = target.protocol === 'https:' ? https : http;

  const headers = { ...req.headers, host: target.host };
  for (const name of STRIPPED_REQUEST_HEADERS) delete headers[name];
  const cookie = withoutSessionCookie(req.headers.cookie);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;

  // Grafana 계정 이름 — 'admin' 같은 기존 Grafana 계정과 겹치지 않게 MRDash 사용자 id에 접두어를 붙인다
  headers['x-webauth-user'] = `mrdash-${req.user.id}`;

  const upstream = client.request(target, { method: req.method, headers }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    console.error('[grafana proxy]', error.message);
    if (!res.headersSent) {
      res.status(502).type('text/plain').send('Grafana에 연결할 수 없습니다.');
    } else {
      res.end();
    }
  });

  // 본문(POST /api/ds/query 등)은 express.json보다 먼저 이 미들웨어가 받으므로 원본 그대로 흘려보낸다
  req.pipe(upstream);
};
