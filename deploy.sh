#!/bin/bash
# TakeoffPro DWG Worker – Fly.io Deploy Script
# Futtasd ezt a saját gépeden (Windows: Git Bash vagy WSL)

set -e

echo "=== TakeoffPro DWG Worker – Fly.io Deploy ==="

# 1. flyctl telepítés (ha még nincs)
if ! command -v flyctl &> /dev/null; then
    echo "flyctl telepítése..."
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
fi

# 2. Fly.io bejelentkezés (token-nel)
export FLY_API_TOKEN="FlyV1 fm2_lJPECAAAAAAAEgfZxBCoTwkIItJbTLeIbbxH6akowrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABcBuB8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDx8WXRY2ernnJZ87pte4FhuOTXBjFeNJ0KtpmYtaSrz1pH7NMnBC88X6OrSp9ijKgC9DvnxZebBlPYLPwvETiyFGSO+fjBpXE5gjaOPuISLfNiZ0WMwbVtMUheD6WDyO8v88oRmEhwsQcVPe5TL2mkrTOXIp1TgGIQYkznROY7u0+xcWghKixNGqt4yug2SlAORgc4A2pgaHwWRgqdidWlsZGVyH6J3Zx8BxCAPqAiE3Z+t1Y7oRIistS48DHcLkMzKPVkurBhXVDFQ9g==,fm2_lJPETiyFGSO+fjBpXE5gjaOPuISLfNiZ0WMwbVtMUheD6WDyO8v88oRmEhwsQcVPe5TL2mkrTOXIp1TgGIQYkznROY7u0+xcWghKixNGqt4yusQQw0qBD4IfeNx1QDaMM6dZqsO5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5poqBFzmmtLGMXzgAWEJoKkc4AFhCaDMQQs/wuKHjSor1rxmDYjeFu2cQgZDXL/5L6bOjVH/dRQnPSPLmMgA5izu812OF0zJN49sA="

echo "Fly.io token beállítva."

# 3. Repo klónozás (dwg-worker branch)
echo "Repo klónozása..."
git clone -b dwg-worker https://github.com/hrvt7/-raj-nlat.DWG.git takeoffpro-dwg-worker
cd takeoffpro-dwg-worker

# 4. Fly.io app létrehozás (ha nem létezik még)
# Módosítsd az app nevet ha másképp hívják!
APP_NAME="takeoffpro-dwg-worker"

flyctl apps list | grep "$APP_NAME" || \
    flyctl apps create "$APP_NAME" --org personal

# 5. Secrets beállítás
echo "Secrets beállítása..."
flyctl secrets set \
    SUPABASE_URL="https://hsvrmwvofhyueusketkt.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzdnJtd3ZvZmh5dWV1c2tldGt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg1NTc5MywiZXhwIjoyMDg1NDMxNzkzfQ.u716Bl-w5qERVyIZUerfK_BT_-0FHjJYfmEkuKuJuBM" \
    --app "$APP_NAME"

# 6. Deploy!
echo "Deploy indítása..."
flyctl deploy --app "$APP_NAME" --remote-only

echo ""
echo "=== KÉSZ ==="
echo "Worker URL: https://$APP_NAME.fly.dev"
echo "Health check: https://$APP_NAME.fly.dev/health"
