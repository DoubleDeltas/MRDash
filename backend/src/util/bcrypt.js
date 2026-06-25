import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hash = (plaintext) => bcrypt.hashSync(plaintext, SALT_ROUNDS);