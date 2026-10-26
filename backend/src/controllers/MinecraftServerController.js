import { randomBytes } from 'node:crypto';
import { MinecraftPlatform, MonitoringDataSource, PrometheusExporter } from '@prisma/client';
import { status as pingJavaServer } from 'minecraft-server-util';
import { prisma } from '../config/prisma.js';
import { EXPORTER_METRICS } from '../util/exporterMetrics.js';
import { PrometheusHttpError, buildSelector, queryInstant } from '../util/prometheus.js';
import { isAgentConnected } from '../ws/consoleHub.js';

// 응답에는 원본 image bytes/consoleToken/prometheusToken 대신 보유 여부만 내려주고,
// managers 관계는 id 배열(managerIds)로 평탄화해서 내려준다
const toPublicServer = ({ image, consoleToken, prometheusToken, managers, ...server }) => ({
  ...server,
  hasImage: image !== null,
  hasConsoleToken: consoleToken !== null,
  hasPrometheusToken: prometheusToken != null,
  managerIds: (managers || []).map((m) => m.id),
});

const MANAGERS_INCLUDE = { managers: { select: { id: true } } };

const decodeImageBase64 = (dataUrl) => {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '');
  return match ? Buffer.from(match[1], 'base64') : null;
};

const isValidHexColor = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);

const isValidHttpUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// 전체 서버 목록 조회
export const getAll = async (req, res) => {
  try {
    const servers = await prisma.minecraftServer.findMany({ include: MANAGERS_INCLUDE });
    res.json({ success: true, data: servers.map(toPublicServer) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 단일 서버 조회
export const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
      include: MANAGERS_INCLUDE,
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    res.json({ success: true, data: toPublicServer(server) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 서버 이미지 (BLOB) 서빙
export const getImage = async (req, res) => {
  try {
    const { id } = req.params;
    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
      select: { image: true },
    });

    if (!server || !server.image) {
      return res.status(404).end();
    }

    res.set('Content-Type', 'image/png');
    res.send(server.image);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 서버 온라인 여부 확인 (Minecraft Server List Ping)
export const getStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
      select: { address: true },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const [host, portStr] = server.address.split(':');
    const port = portStr ? parseInt(portStr) : 25565;

    try {
      const result = await pingJavaServer(host, port, { timeout: 3000 });
      res.json({
        success: true,
        data: {
          online: true,
          players: {
            online: result.players.online,
            max: result.players.max,
            sample: result.players.sample || [],
          },
          ping: result.roundTripLatency,
        },
      });
    } catch {
      // 접속 실패, 타임아웃, 또는 마인크래프트 프로토콜이 아닌 응답 -> 오프라인으로 처리
      res.json({ success: true, data: { online: false } });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 콘솔 에이전트 인증 토큰 발급 (관리자가 호출, 응답으로 1회만 평문 노출)
export const issueConsoleToken = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const consoleToken = randomBytes(24).toString('hex');

    await prisma.minecraftServer.update({
      where: { id: parseInt(id) },
      data: { consoleToken },
    });

    res.json({ success: true, data: { consoleToken } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Prometheus 연결 정보(target/url/token/job/instance) 검증 — 연결 저장과 연결 테스트가 같이 쓴다.
// target이 MRDASH면 백엔드의 PROMETHEUS_URL을 쓰므로 url/token을 비우고(url null = MRDash Prometheus),
// EXTERNAL이면 외부 Prometheus의 url과 (선택) 인증 토큰을 받는다.
const parsePrometheusSettings = ({ target, url, token, clearToken, job, instance }) => {
  if (target !== 'MRDASH' && target !== 'EXTERNAL') {
    return { error: 'target must be one of: MRDASH, EXTERNAL' };
  }
  const trimmedUrl = typeof url === 'string' ? url.trim() : '';
  if (target === 'EXTERNAL' && !isValidHttpUrl(trimmedUrl)) {
    return { error: 'url must be a valid http(s) URL' };
  }
  if (token !== undefined && typeof token !== 'string') {
    return { error: 'token must be a string' };
  }
  const trimmedJob = typeof job === 'string' ? job.trim() : '';
  if (!trimmedJob) {
    return { error: 'job is required' };
  }
  if (instance != null && typeof instance !== 'string') {
    return { error: 'instance must be a string' };
  }
  return {
    target,
    url: target === 'EXTERNAL' ? trimmedUrl : null,
    token: token?.trim() || null,
    clearToken: Boolean(clearToken),
    job: trimmedJob,
    instance: instance?.trim() || null,
  };
};

// 모니터링 데이터 소스 연결
export const connectMonitoringDataSource = async (req, res) => {
  try {
    const { id } = req.params;
    const { dataSource, exporter } = req.body;

    if (!Object.values(MonitoringDataSource).includes(dataSource)) {
      return res.status(400).json({ success: false, error: `dataSource must be one of: ${Object.values(MonitoringDataSource).join(', ')}` });
    }

    // 지금은 Prometheus뿐이라 연결 정보도 Prometheus용 필드만 받는다.
    const settings = parsePrometheusSettings(req.body);
    if (settings.error) {
      return res.status(400).json({ success: false, error: settings.error });
    }
    if (!Object.values(PrometheusExporter).includes(exporter)) {
      return res.status(400).json({ success: false, error: `exporter must be one of: ${Object.values(PrometheusExporter).join(', ')}` });
    }

    const server = await prisma.minecraftServer.update({
      where: { id: parseInt(id) },
      data: {
        monitoringDataSource: dataSource,
        prometheusUrl: settings.url,
        // 토큰은 응답으로 돌려주지 않으므로, 새 값을 보냈을 때만 바꾸고 안 보내면 기존 값을 유지한다
        ...(settings.target === 'MRDASH' || settings.clearToken
          ? { prometheusToken: null }
          : settings.token && { prometheusToken: settings.token }),
        prometheusJob: settings.job,
        prometheusInstance: settings.instance,
        prometheusExporter: exporter,
      },
      include: MANAGERS_INCLUDE,
    });

    res.json({ success: true, data: toPublicServer(server) });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// 연결 테스트 실패 원인을 화면에 보여줄 문장으로
const describePrometheusError = (error) => {
  if (error instanceof PrometheusHttpError) {
    if (error.status === 401 || error.status === 403) return `인증에 실패했습니다 (HTTP ${error.status}). 인증 토큰을 확인해주세요.`;
    if (error.status === 404) return 'Prometheus API를 찾을 수 없습니다 (HTTP 404). URL을 확인해주세요.';
    return `Prometheus가 오류를 응답했습니다 (HTTP ${error.status}).`;
  }
  if (error.name === 'TimeoutError') return 'Prometheus 응답 시간이 초과되었습니다 (5초).';
  if (error.message === 'PROMETHEUS_URL is not set') return 'MRDash 백엔드에 PROMETHEUS_URL 환경변수가 설정되지 않았습니다.';
  // fetch 실패 원인(ECONNREFUSED, ENOTFOUND 등)은 cause, 여러 주소를 시도한 경우 cause.errors 안에 있다
  const code = error.cause?.code || error.cause?.errors?.[0]?.code;
  return `Prometheus에 연결할 수 없습니다 (${code || error.message}). URL을 확인해주세요.`;
};

// 모니터링 데이터 소스 연결 테스트 — 저장 전 폼 값으로 Prometheus 접속, 수집 대상, 선택한 Exporter의 지표를 차례로 확인한다
export const testMonitoringDataSource = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = parsePrometheusSettings(req.body);
    if (settings.error) {
      return res.status(400).json({ success: false, error: settings.error });
    }
    const exporter = EXPORTER_METRICS[req.body.exporter];
    if (!exporter) {
      return res.status(400).json({ success: false, error: `exporter must be one of: ${Object.keys(EXPORTER_METRICS).join(', ')}` });
    }

    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
      select: { prometheusToken: true },
    });
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    // 토큰 칸을 비워 두면 저장된 토큰으로 테스트한다 (저장할 때와 같은 규칙)
    const token = settings.clearToken ? null : settings.token || server.prometheusToken;
    const source = settings.url ? { baseUrl: settings.url, token } : {};
    const selector = buildSelector(settings.job, settings.instance);

    const fail = (reason) => res.json({ success: true, data: { ok: false, reason } });

    let targets;
    try {
      targets = await queryInstant(`up{${selector}}`, source);
    } catch (error) {
      return fail(describePrometheusError(error));
    }

    if (targets.length === 0) {
      return fail(settings.instance
        ? `job="${settings.job}", instance="${settings.instance}"에 해당하는 수집 대상이 없습니다. Job Name·Targets를 확인해주세요.`
        : `job="${settings.job}"에 해당하는 수집 대상이 없습니다. Job Name을 확인해주세요.`);
    }
    if (targets.every((t) => t.value[1] === '0')) {
      return fail('수집 대상은 있지만 Prometheus가 exporter에서 지표를 가져오지 못하고 있습니다 (up=0). 서버와 플러그인 포트를 확인해주세요.');
    }

    const probeMetric = exporter.metrics[exporter.probe].metric;
    const exporterMetrics = await queryInstant(`${probeMetric}{${selector}}`, source).catch(() => []);
    if (exporterMetrics.length === 0) {
      return fail(`수집 대상은 있지만 ${exporter.label} 지표(${probeMetric})가 없습니다. ${exporter.label} 설치를 확인해주세요.`);
    }

    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 모니터링 데이터 소스 연결 해제
export const disconnectMonitoringDataSource = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await prisma.minecraftServer.update({
      where: { id: parseInt(id) },
      data: {
        monitoringDataSource: null,
        prometheusUrl: null,
        prometheusToken: null,
        prometheusJob: null,
        prometheusInstance: null,
        prometheusExporter: null,
      },
      include: MANAGERS_INCLUDE,
    });

    res.json({ success: true, data: toPublicServer(server) });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// 새 서버 생성
export const create = async (req, res) => {
  try {
    const { name, description, address, mcVersion, mcPlatform, color, imageBase64 } = req.body;

    if (!name || !address || !mcVersion || !mcPlatform) {
      return res.status(400).json({ success: false, error: 'name, address, mcVersion, and mcPlatform are required' });
    }

    if (!Object.values(MinecraftPlatform).includes(mcPlatform)) {
      return res.status(400).json({ success: false, error: `mcPlatform must be one of: ${Object.values(MinecraftPlatform).join(', ')}` });
    }

    if (color && !isValidHexColor(color)) {
      return res.status(400).json({ success: false, error: 'color must be a hex string like #RRGGBB' });
    }

    const server = await prisma.minecraftServer.create({
      data: {
        name,
        description: description || null,
        address,
        mcVersion,
        mcPlatform,
        color: color || null,
        image: decodeImageBase64(imageBase64),
      },
      include: MANAGERS_INCLUDE,
    });

    res.status(201).json({ success: true, data: toPublicServer(server) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 서버 정보 수정
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, address, mcVersion, mcPlatform, color, imageBase64, ownerId, managerIds } = req.body;

    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (mcPlatform && !Object.values(MinecraftPlatform).includes(mcPlatform)) {
      return res.status(400).json({ success: false, error: `mcPlatform must be one of: ${Object.values(MinecraftPlatform).join(', ')}` });
    }

    if (color && !isValidHexColor(color)) {
      return res.status(400).json({ success: false, error: 'color must be a hex string like #RRGGBB' });
    }

    // 소유자/관리자 지정·변경은 관리자만 (소유자 본인이 권한을 넘기거나 스스로 관리자를 늘리는 걸 막는다)
    if ((ownerId !== undefined || managerIds !== undefined) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: '소유자/관리자 지정은 관리자만 가능합니다.' });
    }

    if (managerIds !== undefined && !Array.isArray(managerIds)) {
      return res.status(400).json({ success: false, error: 'managerIds must be an array of user ids' });
    }

    const updatedServer = await prisma.minecraftServer.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(address && { address }),
        ...(mcVersion && { mcVersion }),
        ...(mcPlatform && { mcPlatform }),
        ...(color !== undefined && { color: color || null }),
        ...(imageBase64 && { image: decodeImageBase64(imageBase64) }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(managerIds !== undefined && { managers: { set: managerIds.map((managerId) => ({ id: managerId })) } }),
      },
      include: MANAGERS_INCLUDE,
    });

    res.json({ success: true, data: toPublicServer(updatedServer) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 브리지 에이전트 연결 여부 조회
export const getAgentStatus = (req, res) => {
  const serverId = parseInt(req.params.id);
  res.json({ success: true, data: { connected: isAgentConnected(serverId) } });
};

// 서버 삭제
export const deleteServer = async (req, res) => {
  try {
    const { id } = req.params;

    const server = await prisma.minecraftServer.findUnique({
      where: { id: parseInt(id) },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    await prisma.minecraftServer.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true, message: 'Server deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
