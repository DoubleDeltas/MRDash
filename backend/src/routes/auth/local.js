import express from 'express';
import passport from 'passport';
import { body, validationResult } from 'express-validator'
import { createLocalUser } from '../../controllers/user.js';

const router = express.Router();

router.post(
  '/register', [
    body('id').exists().notEmpty().isAlphanumeric(),
    body('password').exists().notEmpty().isAscii(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, password } = req.body;
    try {
      const { localPwHash, ...safeUser } = await createLocalUser(id, password);
      res.json(safeUser);
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'User already exists' });
      }
      throw err;
    }
  }
)

router.post('/', passport.authenticate('local'),
  (req, res) => {
    res.sendStatus(200);
  }
);

export default router;