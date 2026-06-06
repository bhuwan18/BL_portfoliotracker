// Face ID / Touch ID unlock via WebAuthn platform authenticators.
//
// This app has no login and no server relying party, so we cannot do server-side
// challenge/signature verification. Instead this is a CLIENT-SIDE LOCAL GATE: on
// enrollment we create a platform credential and store only its raw credential ID; on
// unlock we ask the authenticator for an assertion and treat any successfully-resolved
// (user-verified) result as success. This is the same threat model as the PIN in
// `lib/pin.ts` — a convenience lock, not real security: nothing here proves the assertion
// was cryptographically valid, only that the platform produced a user-verified response.
//
// Caveats:
// - Requires a secure context: works on HTTPS and `http://localhost`, NOT LAN `http://192.168.x.x`.
// - The credential is bound to `location.hostname`; a domain change invalidates it.
// - The credential can be lost (reinstall, cleared site data, passkey removed in iOS settings).
//   The PIN is always the recovery path, so biometric is only ever offered alongside a PIN.

function bufToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuf(str: string): ArrayBuffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// True only when this device can do a user-verifying platform authenticator (Face ID /
// Touch ID / Windows Hello). Returns false on anything unsupported so callers can hide the UI.
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext) return false
    if (!('PublicKeyCredential' in window) || !('credentials' in navigator)) return false
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// Enrolls a platform credential and returns its base64url-encoded raw ID to persist.
// Throws if the user cancels or enrollment fails — the caller surfaces that to the user.
export async function enrollBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: location.hostname, name: 'B Funds' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'my-funds-local',
        displayName: 'B Funds',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Biometric enrollment was cancelled.')
  return bufToBase64url(cred.rawId)
}

// Asks the platform authenticator to verify the user against the stored credential.
// Never throws: a cancel/timeout/failure resolves to false so the PIN keypad stays usable.
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [
          { type: 'public-key', id: base64urlToBuf(credentialId), transports: ['internal'] },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return assertion != null
  } catch {
    return false
  }
}
