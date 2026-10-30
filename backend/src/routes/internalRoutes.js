import express from 'express';
import { syncAll, upsertMember, removeMember } from '../controllers/MemberSyncController.js';
import { requireInternalSecret } from '../middleware/requireInternalSecret.js';

// 내부 서비스 전용 라우트. /api 밖(/internal)에 마운트되므로
// 공용 nginx(/api/, /ws/만 프록시)를 통해서는 외부에서 접근할 수 없다.
const router = express.Router();

router.use(requireInternalSecret);

router.put('/members', syncAll);
router.put('/members/:discordId', upsertMember);
router.delete('/members/:discordId', removeMember);

export default router;
