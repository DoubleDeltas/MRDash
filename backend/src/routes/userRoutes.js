import express from 'express';
import { getAll, updateRole, deleteUser } from '../controllers/UserController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.get('/', requireAdmin, getAll);
router.patch('/:id/role', requireAdmin, updateRole);
router.delete('/:id', requireAdmin, deleteUser);

export default router;
