/**
 * Meta builds jungle → Storage `poro-meta/jungle/latest.json`
 *
 *   supabase functions deploy sync-poro-meta-jungle
 */

import { handlePoroMetaRoleSync } from '../_shared/poroMetaRoleSync.ts'

Deno.serve((req) =>
  handlePoroMetaRoleSync(req, {
    roleId: 'jungle',
    storageFolder: 'jungle',
    merakiRole: 'JUNGLE',
    uggRole: '1',
  }),
)
