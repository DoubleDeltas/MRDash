import passport from "passport";
import './strategies/local-strategy.js';
import './strategies/discord-strategy.js';

export const initializePassport = (app) => {
  app.use(passport.initialize());
  app.use(passport.session());
}