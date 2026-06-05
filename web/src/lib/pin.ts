// PIN is never stored in plaintext — only a salted SHA-256 digest (SubtleCrypto).
// This is a convenience lock, not strong security: all data already lives locally.
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('my-funds:v1:' + pin)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return (await hashPin(pin)) === hash
}
