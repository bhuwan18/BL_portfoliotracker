import { useLiveQuery } from 'dexie-react-hooks'
import { db, getActiveProfileId } from '../db'
import { setActiveProfile } from '../db/repo'
import type { Profile } from '../domain/types'

// The currently-active profile id, settings-backed and reactive. Deliberately NO default
// (3rd) arg, so the first render returns `undefined` — data hooks use that to hold their
// queries until the active profile is known, avoiding a wrong-data/empty flash. Writing the
// `activeProfileId` setting (via `setActive`) mutates the settings table, which re-fires this
// live query and cascades through every query keyed on the active id.
export function useActiveProfile(): {
  activeId: string | undefined
  setActive: (id: string) => Promise<void>
} {
  const activeId = useLiveQuery(() => getActiveProfileId())
  return { activeId, setActive: (id: string) => setActiveProfile(id) }
}

// The list of profiles, oldest first. Defaults to [] on the first paint so `.length` is safe
// to read immediately (it only drives the presentational switcher, which hides at length <= 1).
export function useProfiles(): Profile[] {
  return useLiveQuery(() => db.profiles.orderBy('createdAt').toArray(), [], []) ?? []
}
