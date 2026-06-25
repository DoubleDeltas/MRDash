import express from 'express';
import { getPlayerHead } from '../controllers/PlayerController.js';

const router = express.Router();

router.get('/:uuid/head', getPlayerHead);

export default router;
