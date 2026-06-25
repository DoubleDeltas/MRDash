import { prisma } from '../config/prisma.js';

// 응답에는 비밀번호 해시를 빼고 내려준다
const toSafeUser = ({ localPwHash, ...user }) => user;

// 전체 유저 목록 조회 (관리자용)
export const getAll = async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { providerId: 'asc' } });
    res.json({ success: true, data: users.map(toSafeUser) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 권한(role) 변경
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role must be USER or ADMIN' });
    }
    if (id === req.user.id) {
      return res.status(400).json({ success: false, error: '자기 자신의 권한은 변경할 수 없습니다.' });
    }

    const user = await prisma.user.update({ where: { id }, data: { role } });
    res.json({ success: true, data: toSafeUser(user) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 탈퇴 처리 (계정 삭제)
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, error: '자기 자신은 탈퇴시킬 수 없습니다.' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
