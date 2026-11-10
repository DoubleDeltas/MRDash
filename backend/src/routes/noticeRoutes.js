import express from 'express';
import { getNotices, createNotice, updateNotice, deleteNotice } from '../controllers/NoticeController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

// 메인 페이지 공지사항 — 조회는 로그인 없이, 작성·수정·삭제는 ADMIN만
const router = express.Router();

router.get('/', getNotices);
router.post('/', requireAdmin, createNotice);
router.put('/:id', requireAdmin, updateNotice);
router.delete('/:id', requireAdmin, deleteNotice);

export default router;
