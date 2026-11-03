/**
 * Meta builds top → Storage `poro-meta/top/latest.json`
 *
 *   supabase functions deploy sync-poro-meta-top
 */

import { handlePoroMetaRoleSync } from '../_shared/poroMetaRoleSync.ts'

Deno.serve((req) =>
  handlePoroMetaRoleSync(req, {
    roleId: 'top',
    storageFolder: 'top',
    merakiRole: 'TOP',
    uggRole: '4',
  }),
)
