/**
 * Password hashing using Node's built-in crypto (PBKDF2).
 * No external dependency — avoids WASM bundling issues.
 */
import crypto from 'crypto'

const ITERATIONS = 100_000
const KEY_LENGTH = 64
const DIGEST = 'sha512'
const SALT_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
      if (err) reject(err)
      else resolve(key.toString('hex'))
    })
  })
  return `${ITERATIONS}:${salt}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iters, salt, storedHash] = stored.split(':')
  if (!iters || !salt || !storedHash) return false
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, salt, parseInt(iters), KEY_LENGTH, DIGEST, (err, key) => {
      if (err) reject(err)
      else resolve(key.toString('hex'))
    })
  })
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}
