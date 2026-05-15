import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../lib/crypto'

describe('crypto — AES-256-GCM', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'my-secret-api-key-12345'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const plaintext = 'same-value'
    const c1 = encrypt(plaintext)
    const c2 = encrypt(plaintext)
    expect(c1).not.toBe(c2)
    expect(decrypt(c1)).toBe(plaintext)
    expect(decrypt(c2)).toBe(plaintext)
  })

  it('ciphertext format is iv:tag:data (3 parts)', () => {
    const parts = encrypt('test').split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0].length).toBeGreaterThan(0) // IV base64
    expect(parts[1].length).toBeGreaterThan(0) // authTag base64
    expect(parts[2].length).toBeGreaterThan(0) // data base64
  })

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('original')
    const [iv, tag, data] = ciphertext.split(':')
    // Corrupt the data
    const tampered = `${iv}:${tag}:${data.slice(0, -4)}XXXX`
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws on invalid format', () => {
    expect(() => decrypt('not-valid-format')).toThrow('Invalid ciphertext format')
  })

  it('handles unicode and special chars', () => {
    const special = '¡CONTRASEÑA_MUY_SEGURA! @#$%^&*()'
    expect(decrypt(encrypt(special))).toBe(special)
  })

  it('handles empty string', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('handles long values', () => {
    const long = 'x'.repeat(8192)
    expect(decrypt(encrypt(long))).toBe(long)
  })
})
