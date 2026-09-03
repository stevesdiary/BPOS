import { describe, it, expect, beforeAll } from 'vitest';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

// TOTP secrets are stored AES-256-GCM encrypted, so these tests need the key.
beforeAll(() => {
  process.env['PLATFORM_ENCRYPTION_KEY'] = 'a'.repeat(64);
});

const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

describe('platform TOTP', () => {
  it('accepts a freshly generated code', async () => {
    const { createTotpEnrolment, verifyTotp } =
      await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, uri } = createTotpEnrolment('admin@bpos.ng');

    // Recover the plaintext secret from the provisioning URI to mint a code,
    // exactly as an authenticator app would.
    const secret = new URL(uri).searchParams.get('secret');
    expect(secret).toBeTruthy();

    const code = await totp.generate({ secret: secret! });
    expect(await verifyTotp(secretEncrypted, code)).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const { createTotpEnrolment, verifyTotp } =
      await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted } = createTotpEnrolment('admin@bpos.ng');
    expect(await verifyTotp(secretEncrypted, '000000')).toBe(false);
  });

  it('fails closed on malformed input rather than throwing', async () => {
    // otplib throws TokenLengthError/TokenFormatError on junk. A guard that
    // propagates that would 500 instead of denying — it must return false.
    const { createTotpEnrolment, verifyTotp } =
      await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted } = createTotpEnrolment('admin@bpos.ng');

    for (const junk of ['', 'abc', 'abcdef', '12345', '1234567', '../../etc', '000 000']) {
      await expect(verifyTotp(secretEncrypted, junk)).resolves.toBe(false);
    }
  });

  it('fails closed when the stored secret is not decryptable', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    expect(await verifyTotp('not-a-valid-ciphertext', '123456')).toBe(false);
  });

  it('does not store the secret in plaintext', async () => {
    const { createTotpEnrolment } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, uri } = createTotpEnrolment('admin@bpos.ng');
    const plaintext = new URL(uri).searchParams.get('secret')!;
    expect(secretEncrypted).not.toContain(plaintext);
  });

  it('issues a distinct secret per enrolment', async () => {
    const { createTotpEnrolment } = await import('../../src/modules/platform/auth/totp.js');
    const a = new URL(createTotpEnrolment('a@bpos.ng').uri).searchParams.get('secret');
    const b = new URL(createTotpEnrolment('b@bpos.ng').uri).searchParams.get('secret');
    expect(a).not.toBe(b);
  });
});
