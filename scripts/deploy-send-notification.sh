#!/usr/bin/env bash
# Déploie l’Edge Function send-notification (prefs lol_match + kill-switch settings).
#
# Prérequis :
#   - Supabase CLI installée (https://supabase.com/docs/guides/cli)
#   - Projet lié : supabase link --project-ref <REF>
#   - Connecté : supabase login
#
# Usage (depuis la racine du repo) :
#   bash scripts/deploy-send-notification.sh
#   # ou
#   chmod +x scripts/deploy-send-notification.sh && ./scripts/deploy-send-notification.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Erreur : la CLI supabase est introuvable dans le PATH." >&2
  echo "Installe-la puis relance ce script." >&2
  exit 1
fi

echo "→ Déploiement de supabase/functions/send-notification …"
supabase functions deploy send-notification --no-verify-jwt

echo
echo "OK. Pense aussi à exécuter dans le SQL Editor :"
echo "  scripts/migrate-settings-lol-match-notifications.sql"
echo
echo "Vérifie que le cron minute appelle bien type=cron sur send-notification"
echo "(déjà en place si tes autres rappels push fonctionnent)."
