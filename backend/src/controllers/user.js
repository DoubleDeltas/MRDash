import passport from "passport";
import { prisma } from "../config/prisma.js";
import { hash } from "../util/bcrypt.js";

export const createLocalUser = async (id, password) =>
  await prisma.user.create({
    data: {
      provider: 'LOCAL',
      providerId: id,
      localPwHash: hash(password),
      isMrdAuthorized: false
    }
  });

export const createDiscordUser = async (id, avatarUrl, handle, nickname) =>
  await prisma.user.create({
    data: {
      provider: 'DISCORD',
      providerId: id,
      avatarUrl: avatarUrl,
      handle: handle,
      nickname: nickname,
      isMrdAuthorized: false
    }
  });

export const updateDiscordProfile = async (id, { handle, nickname }) =>
  await prisma.user.update({
    where: {
      provider_user_unique: {
        provider: 'DISCORD',
        providerId: id
      }
    },
    data: { handle, nickname }
  });

export const findUser = async (provider, id) =>
  await prisma.user.findUnique({
    where: {
      provider_user_unique: {
        provider: provider,
        providerId: id
      }
    }
  })