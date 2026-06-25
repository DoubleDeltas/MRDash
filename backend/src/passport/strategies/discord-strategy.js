import passport from 'passport';
import { Strategy as DiscordStrategy } from 'discord-strategy';
import { prisma } from '../../config/prisma.js';
import { createDiscordUser, updateDiscordProfile, findUser } from '../../controllers/user.js';

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

export default passport.use(new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CLIENT_CALLBACK,
    scope: ["identify", "guilds"]
  },
  async (accessToken, refreshToken, profile, done) => {
    let user = await findUser('DISCORD', profile.id);
    const nickname = profile.global_name || profile.username;
    let isNew = !user;
    if (isNew) {
      user = await createDiscordUser(profile.id, profile.avatarUrl, profile.username, nickname);
    } else if (user.handle !== profile.username || user.nickname !== nickname) {
      user = await updateDiscordProfile(profile.id, { handle: profile.username, nickname });
    }
    return done(null, user);
  }
));