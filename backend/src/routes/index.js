import express from 'express';
import passport from 'passport';
import authRoutes from './auth/index.js';
import minecraftServerRoutes from './minecraftServerRoutes.js';
import playerRoutes from './playerRoutes.js';
import userRoutes from './userRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/servers', minecraftServerRoutes);
router.use('/players', playerRoutes);
router.use('/users', userRoutes);

// 기본 라우트
router.get('/', (req, res) => {
  res.json({ message: 'MRDash Backend API v1.0', timestamp: new Date().toISOString() });
});

export default router;
