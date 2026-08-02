import { randomBytes } from 'node:crypto';
import { MinecraftPlatform } from '@prisma/client';
import { status as pingJavaServer } from 'minecraft-server-util';
import { prisma } from '../config/prisma.js';
import { isAgentConnected } from '../ws/consoleHub.js';

// 응답에는 원본 image bytes/consoleToken 대신 보유 여부만 내려주고,
// managers 관계는 id 배열(managerIds)로 평탄화해서 내려준다
const toPublicServer = ({ image, consoleToken, managers, ...server }) => ({
  ...server,
  hasImage: image !== null,
  hasConsoleToken: consoleToken !== null,
  managerIds: (managers || []).map((m) => m.id),
});

const MANAGERS_INCLUDE = { managers: { select: { id: true } } };

const decodeImageBase64 = (dataUrl) => {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '');
  return match ? Buffer.from(match[1], 'base64') : null;
};

const isValidHexColor = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);

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
