import express from 'express';
import localAuthRoutes from './local.js';
import discordAuthRoutes from './discord.js';

const router = express.Router();

if (process.env.ALLOW_LOCAL_AUTH === 'true') {
  router.use('/local', localAuthRoutes);
}
router.use('/discord', discordAuthRoutes);

router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { localPwHash, ...safeUser } = req.user;
  res.json(safeUser);
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.sendStatus(200);
  });
});

export default router;