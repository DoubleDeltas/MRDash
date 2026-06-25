import sharp from 'sharp';

const HEAD_CACHE_TTL = 60 * 60 * 1000; // 1시간
const headCache = new Map(); // uuid -> { buffer, expiresAt }

// 플레이어 머리 이미지를 Mojang API로 가져온다:
// 1) sessionserver에서 프로필(스킨 텍스처 URL) 조회
// 2) 스킨 PNG 다운로드
// 3) 얼굴 부분(8x8 ~ 16x16)만 잘라서 64x64로 확대
export const getPlayerHead = async (req, res) => {
  try {
    const uuid = req.params.uuid.replace(/-/g, '');

    const cached = headCache.get(uuid);
    if (cached && cached.expiresAt > Date.now()) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const profileRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
    if (!profileRes.ok) {
      return res.status(404).end();
    }
    const profile = await profileRes.json();

    const texturesProp = profile.properties?.find(p => p.name === 'textures');
    if (!texturesProp) {
      return res.status(404).end();
    }

    const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
    const skinUrl = decoded.textures?.SKIN?.url;
    if (!skinUrl) {
      return res.status(404).end();
    }

    const skinRes = await fetch(skinUrl);
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
