import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePassword,
  validatePasswordReason,
  isLegacyPasswordHash,
  hashPw,
  verifyPw,
} from '../functions/_shared/auth.js'

test('password policy rejects short and weak passwords', () => {
  assert.equal(validatePassword('short1'), false)
  assert.equal(validatePasswordReason('short1'), 'min')
  assert.equal(validatePassword('allletters'), false)
  assert.equal(validatePasswordReason('allletters'), 'complexity')
  assert.equal(validatePassword('1234567890'), false)
  assert.equal(validatePasswordReason('password123'), 'common')
  assert.equal(validatePassword('SecurePass1'), true)
  assert.equal(validatePasswordReason('SecurePass1'), null)
})

test('legacy hash is rejected by default; allowed only with env flag', async () => {
  const salt = 'abc123salt'
  const pw = 'legacy-pass'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pw}`))
  const hex = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('')
  const stored = `${salt}:${hex}`
  assert.equal(isLegacyPasswordHash(stored), true)

  const prev = process.env.ALLOW_LEGACY_PASSWORD_HASH
  delete process.env.ALLOW_LEGACY_PASSWORD_HASH
  assert.equal(await verifyPw(pw, stored), false)

  process.env.ALLOW_LEGACY_PASSWORD_HASH = '1'
  assert.equal(await verifyPw(pw, stored), true)
  if (prev === undefined) delete process.env.ALLOW_LEGACY_PASSWORD_HASH
  else process.env.ALLOW_LEGACY_PASSWORD_HASH = prev

  const modern = await hashPw('SecurePass1')
  assert.equal(isLegacyPasswordHash(modern), false)
  assert.equal(await verifyPw('SecurePass1', modern), true)
})
