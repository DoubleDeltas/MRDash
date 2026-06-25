import passport from 'passport';
import bcrypt from 'bcrypt';
import { Strategy as LocalStrategy } from 'passport-local';
import { findUser } from '../../controllers/user.js';

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(new LocalStrategy(
  { usernameField: 'id' },
  async (username, password, done) => {
    const user = await findUser('LOCAL', username);
    if (!user) {
      return done(null, false, { message: 'No user found' });
    }
    if (!bcrypt.compareSync(password, user.localPwHash)) {
      return done(null, false, { message: 'Incorrect password' });
    }
    return done(null, user);
  }
));