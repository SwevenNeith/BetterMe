# Déploie l'Edge Function send-notification (BetterMe)
# Prérequis : Supabase CLI — npm install -g supabase  OU  npx supabase ...
#
# Usage (PowerShell, à la racine du repo) :
#   .\scripts\deploy-send-notification.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "idnfbtgevosjcevnrnvu"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> Connexion Supabase (navigateur)..." -ForegroundColor Cyan
npx supabase login

Write-Host "==> Liaison au projet $ProjectRef ..." -ForegroundColor Cyan
npx supabase link --project-ref $ProjectRef

Write-Host @"
==> Secrets VAPID (si pas déjà définis sur le projet) :
    npx supabase secrets set VAPID_PUBLIC_KEY=ta_cle_publique VAPID_PRIVATE_KEY=ta_cle_privee
"@ -ForegroundColor Yellow

Write-Host "==> Déploiement send-notification (JWT désactivé, comme config.toml)..." -ForegroundColor Cyan
npx supabase functions deploy send-notification --no-verify-jwt

Write-Host @"
==> Test rapide (remplace YOUR_ANON_KEY par la clé anon du dashboard) :
    curl -i -X POST "https://$ProjectRef.supabase.co/functions/v1/send-notification" `
      -H "Content-Type: application/json" `
      -H "Authorization: Bearer YOUR_ANON_KEY" `
      -H "apikey: YOUR_ANON_KEY" `
      -d '{\"type\":\"cron\"}'

Si tu as encore 401 :
  - Vérifie que le déploiement ci-dessus a réussi (--no-verify-jwt).
  - Le cron pg_cron doit aussi envoyer apikey (voir supabase/migrations/20250519160100_schedule_notification_cron.sql).
"@ -ForegroundColor Green
