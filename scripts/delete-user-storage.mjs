#!/usr/bin/env node
/**
 * Supprime les fichiers Storage d’un utilisateur BetterMe.
 * Supabase interdit DELETE direct sur storage.objects → utiliser l’API Storage.
 *
 * Prérequis (variables d’environnement) :
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage :
 *   node scripts/delete-user-storage.mjs <USER_ID>
 */

import { createClient } from '@supabase/supabase-js'

const BUCKETS = ['comfort-images', 'reading-covers']
const LIST_LIMIT = 1000

const userId = process.argv[2]?.trim()
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!userId) {
  console.error('Usage: node scripts/delete-user-storage.mjs <USER_ID>')
  process.exit(1)
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Définis SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (clé service_role, jamais côté client).',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Liste récursivement tous les chemins de fichiers sous un préfixe.
 * @param {string} bucket
 * @param {string} prefix chemin dossier (ex. "uuid/" ou "uuid/sous-dossier/")
 */
async function collectFilePaths(bucket, prefix = '') {
  /** @type {string[]} */
  const paths = []

  let offset = 0
  while (true) {
    const folder = prefix.replace(/\/$/, '') || undefined
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: LIST_LIMIT,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw new Error(`[${bucket}] list(${folder ?? ''}): ${error.message}`)
    }

    const entries = data ?? []
    if (!entries.length) break

    for (const entry of entries) {
      const entryPath = prefix ? `${prefix}${entry.name}` : entry.name
      const isFile = entry.metadata != null || entry.id != null

      if (isFile && !entry.name.endsWith('/')) {
        paths.push(entryPath)
      } else {
        const nestedPrefix = entryPath.endsWith('/') ? entryPath : `${entryPath}/`
        const nested = await collectFilePaths(bucket, nestedPrefix)
        paths.push(...nested)
      }
    }

    if (entries.length < LIST_LIMIT) break
    offset += LIST_LIMIT
  }

  return paths
}

/**
 * @param {string} bucket
 * @param {string[]} paths
 */
async function removePaths(bucket, paths) {
  const batchSize = 100
  let removed = 0

  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize)
    const { error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      throw new Error(`[${bucket}] remove: ${error.message}`)
    }
    removed += batch.length
  }

  return removed
}

async function main() {
  console.log(`Suppression Storage pour l’utilisateur ${userId}…`)

  let totalRemoved = 0

  for (const bucket of BUCKETS) {
    const paths = await collectFilePaths(bucket, `${userId}/`)
    if (!paths.length) {
      console.log(`  ${bucket} : aucun fichier`)
      continue
    }

    const count = await removePaths(bucket, paths)
    totalRemoved += count
    console.log(`  ${bucket} : ${count} fichier(s) supprimé(s)`)
  }

  console.log(`Terminé. ${totalRemoved} fichier(s) supprimé(s) au total.`)
  console.log('Tu peux maintenant exécuter scripts/delete-user-and-related-data.sql')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
