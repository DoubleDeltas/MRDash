import { WebSocketServer } from 'ws';
import { prisma } from '../config/prisma.js';
import { getSessionUserFromRequest } from './sessionAuth.js';
import { handleMonitoringConnection } from './monitoringHub.js';
import { handleServerMonitoringConnection } from './serverMonitoringHub.js';
import { parseRangeMinutes } from '../util/monitoringRange.js';

// serverId -> 에이전트 ws 연결 (서버당 하나)
const agentSockets = new Map();
// serverId -> 그 서버 콘솔 페이지를 보고 있는 브라우저 ws 연결들
const browserSockets = new Map();

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const broadcastToBrowsers = (serverId, payload) => {
  const sockets = browserSockets.get(serverId);
  if (!sockets) return;
  for (const ws of sockets) {
    send(ws, payload);
  }
};

const handleAgentConnection = async (ws, url) => {
  const token = url.searchParams.get('token');
  const server = token
    ? await prisma.minecraftServer.findFirst({ where: { consoleToken: token } })
    : null;

  if (!server) {
    ws.close(4001, 'invalid console token');
    return;
  }

  // 같은 서버에 대해 기존 에이전트 연결이 있었다면 새 연결로 교체
  agentSockets.get(server.id)?.close(4002, 'replaced by new agent connection');
  agentSockets.set(server.id, ws);
  broadcastToBrowsers(server.id, { type: 'agent-status', connected: true });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'log' && typeof msg.line === 'string') {
      broadcastToBrowsers(server.id, { type: 'log', line: msg.line });
    } else if (msg.type === 'command-result' && typeof msg.result === 'string') {
      broadcastToBrowsers(server.id, { type: 'log', line: msg.result });
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[ws/agent] server ${server.id} agent disconnected: code=${code} reason=${reason}`);
    if (agentSockets.get(server.id) === ws) {
      agentSockets.delete(server.id);
      broadcastToBrowsers(server.id, { type: 'agent-status', connected: false });
    }
  });
};

const handleBrowserConnection = (ws, serverId) => {
  if (!browserSockets.has(serverId)) {
    browserSockets.set(serverId, new Set());
  }
  browserSockets.get(serverId).add(ws);

  send(ws, { type: 'agent-status', connected: agentSockets.has(serverId) });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'command' && typeof msg.command === 'string') {
      const agentWs = agentSockets.get(serverId);
      if (!agentWs) {
        send(ws, { type: 'error', message: 'MRDash 브리지가 연결되어 있지 않습니다.' });
        return;
      }
      send(agentWs, { type: 'command', command: msg.command });
    } else if (msg.type === 'request-history') {
      // 에이전트가 logs/latest.log를 읽어서 기존 log 메시지로 돌려준다 (그쪽에 그대로 위임).
      const agentWs = agentSockets.get(serverId);
      if (agentWs) {
        send(agentWs, { type: 'request-history' });
      }
    }
  });

  ws.on('close', () => {
    browserSockets.get(serverId)?.delete(ws);
  });
};

export const isAgentConnected = (serverId) => agentSockets.has(serverId);

const canAccessServer = async (user, serverId) => {
  if (user.role === 'ADMIN') return true;
  const server = await prisma.minecraftServer.findUnique({
    where: { id: serverId },
    select: { ownerId: true, managers: { select: { id: true } } },
  });
  if (!server) return false;
  return server.ownerId === user.id || server.managers.some((m) => m.id === user.id);
};

export const attachConsoleHub = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/ws/agent') {
      wss.handleUpgrade(req, socket, head, (ws) => handleAgentConnection(ws, url));
      return;
    }

    if (url.pathname === '/ws/monitoring') {
      const user = await getSessionUserFromRequest(req);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => handleMonitoringConnection(ws, parseRangeMinutes(url.searchParams.get('range'))));
      return;
    }

    // 서버별 콘솔/모니터링 — 둘 다 admin, 서버 소유자, 서버 관리자만 접근 가능
    const serverMatch = url.pathname.match(/^\/ws\/(console|monitoring)\/(\d+)$/);
    if (serverMatch) {
      const [, kind, id] = serverMatch;
      const serverId = Number(id);
      const user = await getSessionUserFromRequest(req);

      if (!user || !(await canAccessServer(user, serverId))) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => (kind === 'console'
        ? handleBrowserConnection(ws, serverId)
        : handleServerMonitoringConnection(ws, serverId, parseRangeMinutes(url.searchParams.get('range')))));
      return;
    }

    socket.destroy();
  });
};
