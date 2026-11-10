import { createHash } from 'node:crypto';
import sharp from 'sharp';

const HEAD_CACHE_TTL = 60 * 60 * 1000; // 1시간
const headCache = new Map(); // uuid -> { buffer, expiresAt }

const UUID_HEX = /^[0-9a-f]{32}$/;
const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;

// 오프라인 모드(online-mode=false) 서버가 쓰는 UUID: md5("OfflinePlayer:" + 닉네임)을 버전 3 UUID로 만든 값
const offlineUuid = (name) => {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return hash.toString('hex');
};

// 닉네임 → 정품 UUID (없는 닉네임이면 null)
const lookupUuidByName = async (name) => {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (res.status !== 200) return null;
  const body = await res.json();
  return UUID_HEX.test(body?.id ?? '') ? body.id : null;
};

// 정품 UUID → 스킨 URL (없는 계정이면 Mojang이 204를 준다 → null)
const lookupSkinUrl = async (uuid) => {
  const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
  if (res.status !== 200) return null;
  const profile = await res.json();
  const texturesProp = profile.properties?.find((p) => p.name === 'textures');
  if (!texturesProp) return null;
  const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
  return decoded.textures?.SKIN?.url ?? null;
};

// 플레이어 머리 이미지를 Mojang API로 가져온다:
// 1) sessionserver에서 프로필(스킨 텍스처 URL) 조회
//    — 오프라인 모드 서버의 UUID(버전 3)는 Mojang에 없으므로, ?name=의 닉네임으로 정품 UUID를 찾아 조회한다.
//      닉네임은 그 UUID를 만든 닉네임일 때만 쓴다 (다른 닉네임을 붙여 다른 사람 머리로 캐시를 덮어쓰지 못하게).
// 2) 스킨 PNG 다운로드
// 3) 얼굴 부분(8x8 ~ 16x16)만 잘라서 64x64로 확대
export const getPlayerHead = async (req, res) => {
  try {
    const uuid = req.params.uuid.replace(/-/g, '').toLowerCase();
    if (!UUID_HEX.test(uuid)) {
      return res.status(400).end();
    }

    const cached = headCache.get(uuid);
    if (cached && cached.expiresAt > Date.now()) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const isOffline = PLAYER_NAME.test(name) && offlineUuid(name) === uuid;
    const profileUuid = isOffline ? await lookupUuidByName(name) : uuid;
    const skinUrl = profileUuid && await lookupSkinUrl(profileUuid);
    if (!skinUrl) {
      return res.status(404).end();
    }

    const skinRes = await fetch(skinUrl);
    if (!skinRes.ok) {
      return res.status(502).end();
    }
    const skinBuffer = Buffer.from(await skinRes.arrayBuffer());

    const headBuffer = await sharp(skinBuffer)
      .extract({ left: 8, top: 8, width: 8, height: 8 })
      .resize(64, 64, { kernel: 'nearest' })
      .png()
      .toBuffer();

    headCache.set(uuid, { buffer: headBuffer, expiresAt: Date.now() + HEAD_CACHE_TTL });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(headBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
