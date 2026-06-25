import { prisma } from '../config/prisma.js';

export const requireAdminOrOwner = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user.role === 'ADMIN') {
    return next();
  }

  const server = await prisma.minecraftServer.findUnique({
    where: { id: parseInt(req.params.id) },
    select: { ownerId: true },
  });

  if (!server || server.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Admin or server owner access required' });
  }
  next();
};
