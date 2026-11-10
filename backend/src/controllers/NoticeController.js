import { NoticeCategory } from '@prisma/client';
import { prisma } from '../config/prisma.js';

// 메인 페이지 공지사항. 조회는 누구나(로그인 없이도), 작성·수정·삭제는 ADMIN만 (/admin 화면).

const TITLE_MAX = 100;
const CONTENT_MAX = 2000;

// 응답에 내려주는 필드 — 작성자(authorId)는 기록용이라 내려주지 않는다
const NOTICE_SELECT = { id: true, title: true, content: true, category: true, createdAt: true, updatedAt: true };

const parseNotice = ({ title, content, category }) => {
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  if (!trimmedTitle || trimmedTitle.length > TITLE_MAX) {
    return { error: `제목은 1~${TITLE_MAX}자로 입력해주세요.` };
  }
  if (!trimmedContent || trimmedContent.length > CONTENT_MAX) {
    return { error: `내용은 1~${CONTENT_MAX}자로 입력해주세요.` };
  }
  if (!Object.values(NoticeCategory).includes(category)) {
    return { error: `category must be one of: ${Object.values(NoticeCategory).join(', ')}` };
  }
  return { value: { title: trimmedTitle, content: trimmedContent, category } };
};

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /notices — 최신순
export const getNotices = async (req, res) => {
  try {
    const notices = await prisma.notice.findMany({
      select: NOTICE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    res.json({ success: true, data: notices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /notices — { title, content, category }
export const createNotice = async (req, res) => {
  try {
    const notice = parseNotice(req.body);
    if (notice.error) return res.status(400).json({ success: false, error: notice.error });

    const created = await prisma.notice.create({
      data: { ...notice.value, authorId: req.user.id },
      select: NOTICE_SELECT,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /notices/:id — { title, content, category } (작성일은 그대로)
export const updateNotice = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'invalid notice id' });
    const notice = parseNotice(req.body);
    if (notice.error) return res.status(400).json({ success: false, error: notice.error });

    const { count } = await prisma.notice.updateMany({ where: { id }, data: notice.value });
    if (count === 0) return res.status(404).json({ success: false, error: 'Notice not found' });

    const updated = await prisma.notice.findUnique({ where: { id }, select: NOTICE_SELECT });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /notices/:id
export const deleteNotice = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'invalid notice id' });

    const { count } = await prisma.notice.deleteMany({ where: { id } });
    if (count === 0) return res.status(404).json({ success: false, error: 'Notice not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
