/**
 * TOTP (RFC 6238) for platform-user MFA.
 *
 * The shared secret is stored AES-256-GCM encrypted in
 * platform_users.mfa_secret_encrypted and only decrypted in memory at
 * verification time — the same handling the logistics provider API keys get.
 */

import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { encrypt, decrypt } from '../../../shared/crypto/encrypt.js';

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

/**
 * Accept codes one step either side of now (±30s). Authenticator apps and
 * phones drift; without this, a correct code is rejected often enough that
 * operators start disabling MFA, which is the worse outcome.
 */
const EPOCH_TOLERANCE_SECONDS = 30;

const ISSUER = 'BPOS Platform';

export interface TotpEnrolment {
  /** Base32 secret, encrypted — store this on the user row. */
  secretEncrypted: string;
  /** otpauth:// URI to render as a QR code. Contains the PLAINTEXT secret. */
  uri: string;
}

/**
 * Begin enrolment: mint a secret and the provisioning URI.
 * The caller must not persist mfaEnabledAt until the user proves possession
 * by submitting a valid code (see confirmTotpEnrolment in service.ts).
 */
export function createTotpEnrolment(email: string): TotpEnrolment {
  const secret = totp.generateSecret();
  return {
    secretEncrypted: encrypt(secret),
    uri: totp.toURI({ secret, label: email, issuer: ISSUER }),
  };
}

/**
 * Verify a submitted code against an encrypted secret.
 * Returns false rather than throwing for any malformed input — otplib throws
 * TokenLengthError/TokenFormatError on junk, and a guard must fail closed,
 * not 500.
 */
export async function verifyTotp(secretEncrypted: string, code: string): Promise<boolean> {
  try {
    const secret = decrypt(secretEncrypted);
    const result = await totp.verify(code.trim(), {
      secret,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/** Verify a code against a plaintext secret (enrolment confirmation only). */
export async function verifyTotpPlain(secret: string, code: string): Promise<boolean> {
  try {
    const result = await totp.verify(code.trim(), {
      secret,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}
