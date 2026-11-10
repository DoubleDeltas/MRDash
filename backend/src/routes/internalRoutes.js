import express from 'express';
import { syncAll, getMember, upsertMember, removeMember } from '../controllers/MemberSyncController.js';
import { replaceChannels } from '../controllers/DiscordChannelController.js';
import { getPrometheusTargets } from '../controllers/PrometheusTargetsController.js';
import { requireInternalSecret } from '../middleware/requireInternalSecret.js';

// 내부 서비스 전용 라우트. /api 밖(/internal)에 마운트되므로
// 공용 nginx(/api/, /ws/만 프록시)를 통해서는 외부에서 접근할 수 없다.
const router = express.Router();

router.use(requireInternalSecret);

router.put('/members', syncAll);
router.get('/members/:discordId', getMember);
router.put('/members/:discordId', upsertMember);
router.delete('/members/:discordId', removeMember);

// "테트라" 봇이 볼 수 있는 채널 목록 (모니터링 알림 대상 선택용)
router.put('/discord-channels', replaceChannels);

// MRDash Prometheus의 수집 대상 자동 등록 (Prometheus http_sd_configs, READONLY_API_SECRET으로 부른다)
router.get('/prometheus/targets', getPrometheusTargets);

export default router;
