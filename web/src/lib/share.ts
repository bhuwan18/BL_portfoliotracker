// Share-via-key client. Unlike the market-data clients (which swallow errors and return
// fallbacks), share/import must surface failures to the user, so these throw.
import { buildBackup, applyBackup, parseBackup, type ImportResult } from './backup'

export interface ShareResult {
  code: string
  expiresAt: string
}

// Thrown when a key is unknown or expired (server 404), so the UI can show a precise
// message distinct from a generic network failure.
export class ShareNotFoundError extends Error {
  constructor() {
    super('That key was not found. It may have expired.')
    this.name = 'ShareNotFoundError'
  }
}

// Uploads the full portfolio and returns a short reusable key (valid 30 days).
export async function shareBackup(): Promise<ShareResult> {
  const payload = await buildBackup()
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Could not create a share key.')
  const data = (await res.json()) as ShareResult
  if (!data?.code) throw new Error('Could not create a share key.')
  return data
}

// Fetches the portfolio behind a key and replaces all data on this device with it.
export async function importFromCode(rawCode: string): Promise<ImportResult> {
  const code = rawCode.trim()
  if (!code) throw new Error('Enter a key.')
  const res = await fetch(`/api/share/${encodeURIComponent(code)}`)
  // 404 is also !res.ok, so check it first to give a precise message.
  if (res.status === 404) throw new ShareNotFoundError()
  if (!res.ok) throw new Error('Could not fetch that key. Check your connection and try again.')
  // The server returns the raw BackupPayload; re-validate via parseBackup for safety.
  const payload = parseBackup(JSON.stringify(await res.json()))
  return applyBackup(payload, 'replace')
}
