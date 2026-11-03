/**
 * Meta builds ADC → Storage `poro-meta/adc/latest.json`
 *
 *   supabase functions deploy sync-poro-meta-adc
 */

import { handlePoroMetaRoleSync } from '../_shared/poroMetaRoleSync.ts'

Deno.serve((req) =>
  handlePoroMetaRoleSync(req, {
    roleId: 'adc',
    storageFolder: 'adc',
    merakiRole: 'BOTTOM',
    uggRole: '3',
  }),
)
