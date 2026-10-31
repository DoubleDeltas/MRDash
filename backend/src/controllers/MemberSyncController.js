import { prisma } from '../config/prisma.js';

// 디스코드 봇이 보내는 "마랜디" 길드 멤버 정보로 유저를 가입/인증 처리한다.
// 멤버 형식: { id, username, globalName, avatarUrl }

const toProfile = (member) => ({
  handle: member.username,
  nickname: member.globalName || member.username,
  avatarUrl: member.avatarUrl ?? null,
});

const isValidMember = (member) =>
  member && typeof member.id === 'string' && /^\d+$/.test(member.id) && typeof member.username === 'string';

const upsertAuthorized = (member) =>
  prisma.user.upsert({
    where: { provider_user_unique: { provider: 'DISCORD', providerId: member.id } },
    create: {
      provider: 'DISCORD',
      providerId: member.id,
      ...toProfile(member),
      isMrdAuthorized: true,
    },
    update: {
      ...toProfile(member),
      isMrdAuthorized: true,
    },
  });

// 전체 동기화: 목록에 있는 멤버는 가입+인증, 목록에 없는 디스코드 유저는 인증 해제
export const syncAll = async (req, res) => {
  try {
    const { members } = req.body;
    if (!Array.isArray(members) || !members.every(isValidMember)) {
      return res.status(400).json({ success: false, error: 'members must be an array of { id, username }' });
    }

    const ids = members.map((m) => m.id);
    const [revoked] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { provider: 'DISCORD', isMrdAuthorized: true, providerId: { notIn: ids } },
        data: { isMrdAuthorized: false },
      }),
      ...members.map(upsertAuthorized),
    ]);

    res.json({ success: true, data: { authorized: members.length, revoked: revoked.count } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 멤버 조회: 다른 내부 서비스(마랜디위키 등)가 디스코드 ID로 인증 여부를 확인한다.
// 계정이 없으면 인증되지 않은 것으로 응답한다.
export const getMember = async (req, res) => {
  try {
    const { discordId } = req.params;
    if (!/^\d+$/.test(discordId)) {
      return res.status(400).json({ success: false, error: 'invalid discordId' });
    }
    const user = await prisma.user.findUnique({
      where: { provider_user_unique: { provider: 'DISCORD', providerId: discordId } },
      select: { isMrdAuthorized: true, handle: true, nickname: true },
    });
    res.json({
      success: true,
      data: {
        discordId,
        isMrdAuthorized: user?.isMrdAuthorized ?? false,
        handle: user?.handle ?? null,
        nickname: user?.nickname ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 멤버 입장 (또는 프로필 변경)
export const upsertMember = async (req, res) => {
  try {
    const member = { ...req.body, id: req.params.discordId };
    if (!isValidMember(member)) {
      return res.status(400).json({ success: false, error: 'invalid member' });
    }
    await upsertAuthorized(member);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 멤버 퇴장: 계정은 남기고 인증만 해제
export const removeMember = async (req, res) => {
  try {
    await prisma.user.updateMany({
      where: { provider: 'DISCORD', providerId: req.params.discordId },
      data: { isMrdAuthorized: false },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
