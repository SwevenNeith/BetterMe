/**
 * Meta builds mid → Storage `poro-meta/mid/latest.json`
 *
 *   supabase functions deploy sync-poro-meta-mid
 */

import { handlePoroMetaRoleSync } from '../_shared/poroMetaRoleSync.ts'

Deno.serve((req) =>
  handlePoroMetaRoleSync(req, {
    roleId: 'mid',
    storageFolder: 'mid',
    merakiRole: 'MIDDLE',
    uggRole: '5',
  }),
)
