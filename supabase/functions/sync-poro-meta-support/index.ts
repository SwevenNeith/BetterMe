/**
 * Meta builds support → Storage `poro-meta/support/latest.json`
 *
 *   supabase functions deploy sync-poro-meta-support
 */

import { handlePoroMetaRoleSync } from '../_shared/poroMetaRoleSync.ts'

Deno.serve((req) =>
  handlePoroMetaRoleSync(req, {
    roleId: 'support',
    storageFolder: 'support',
    merakiRole: 'UTILITY',
    uggRole: '2',
  }),
)
