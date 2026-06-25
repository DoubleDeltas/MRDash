import express from 'express';
import { getAll, getById, getImage, getStatus, create, update, deleteServer, issueConsoleToken } from '../controllers/MinecraftServerController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireAdminOrOwner } from '../middleware/requireAdminOrOwner.js';

const router = express.Router();

// CRUD 라우트
router.get('/', getAll);
router.get('/:id', getById);
router.get('/:id/image', getImage);
router.get('/:id/status', getStatus);
router.post('/', requireAdmin, create);
router.put('/:id', requireAdminOrOwner, update);
router.delete('/:id', requireAdmin, deleteServer);
router.post('/:id/console-token', requireAdminOrOwner, issueConsoleToken);

export default router;
