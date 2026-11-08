import express from 'express';
import { receiveGrafanaAlerts, requireGrafanaWebhookSecret } from '../controllers/GrafanaAlertWebhookController.js';

// Grafana 경보 Webhook 연동 전용 (/internal/grafana). /internal 아래라 공용 nginx로는 노출되지 않고,
// MRDash 전용 Grafana 컨테이너만 docker 네트워크로 부른다.
const router = express.Router();

router.post('/alerts', requireGrafanaWebhookSecret, receiveGrafanaAlerts);

export default router;
