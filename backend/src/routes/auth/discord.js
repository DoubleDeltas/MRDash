import express from 'express';
import passport from 'passport';

const router = express.Router();

router.get('/', passport.authenticate('discord'))
router.get('/redirect', passport.authenticate('discord'),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL);
  }
)

export default router;