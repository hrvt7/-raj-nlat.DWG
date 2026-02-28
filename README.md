# TakeoffPro DWG Worker

Docker-alapú microservice: DWG/PDF → DXF konverzió ODA File Converter-rel, majd ezdxf parse.

## Architektúra

```
Supabase Storage (dwg-files bucket)
    ↓ signed URL
Fly.io Worker (ez a repo)
    ↓ ODA CLI: DWG/PDF → DXF
    ↓ ezdxf: parse blocks, layers, lengths
    ↓ result JSON
Supabase DB (job_queue tábla)
    ↓ Realtime
Vercel Frontend
```

## Lokális fejlesztés

```bash
cp .env.example .env
# Töltsd ki a .env-t

docker build -t takeoffpro-worker .
docker run --env-file .env -p 8080:8080 takeoffpro-worker
```

## Fly.io Deploy

```bash
flyctl auth login
flyctl secrets set SUPABASE_URL=https://xxx.supabase.co
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
flyctl deploy
```

## API végpontok

- `GET /health` – liveness check
- `POST /process/<job_id>` – manuális job triggerelés

## Környezeti változók

| Változó | Leírás |
|---------|--------|
| `SUPABASE_URL` | Supabase projekt URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypass RLS) |
| `ODA_PATH` | ODA bináris elérési útja (opcionális) |
