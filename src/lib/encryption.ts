import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.HH_ENCRYPTION_KEY || 'default-dev-key-must-be-changed-in-production-12345'

// Derive a 32-byte key using SHA-256 hash of the HH_ENCRYPTION_KEY string
const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
const IV_LENGTH = 16

/**
 * Encrypts plain text using aes-256-cbc.
 * Returns the IV and ciphertext separated by a colon (e.g. iv:ciphertext).
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

/**
 * Decrypts ciphertext formatted as iv:ciphertext using aes-256-cbc.
 */
export function decrypt(text: string): string {
  const textParts = text.split(':')
  const ivHex = textParts.shift() || ''
  const encryptedText = textParts.join(':')
  
  if (!ivHex || !encryptedText) {
    throw new Error('Invalid encrypted text format')
  }
  
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
