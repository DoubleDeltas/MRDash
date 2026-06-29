import { createClient } from 'redis'

export const sessionRedis = createClient({
  url: process.env.SESSION_REDIS_URL,
  password: process.env.SESSION_REDIS_PASSWORD
});