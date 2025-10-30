# OS-LRM
Operating System Local Ressources Monitoring (OS-LRM). Une Application Web qui fait le Monitoring des Ressources Locales du Système d'Exploitation.

## Quickstart

Pré-requis: Node.js (>=18), Docker (optionnel pour déployer avec compose)

1. Copier l'exemple d'env et l'éditer:

```powershell
copy .env.example .env
# then edit .env and set secure passwords, e.g. GRAFANA_ADMIN_PASSWORD
```

2. Lancer local sans Docker:

```powershell
npm ci
npm start
```

3. Lancer avec Docker Compose (recommande pour dev local):

```powershell
docker compose up --build
```

## Variables d'environnement
- `PORT` (default 3000)
- `SAMPLE_INTERVAL_MS` (default 1000)
- `INFLUX_HOST` (ex: influxdb) — si non défini, l'écriture Influx est désactivée
- `INFLUX_DB` (default metrics_db)
- `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (protéger; ne pas committer `.env`)

## Notes de sécurité & opérations
- Changez le mot de passe Grafana par défaut (ne laissez pas `admin/admin`).
- Ajoutez un reverse proxy (Nginx/Traefik) et HTTPS en production.
- Utilisez `npm audit` et `npm outdated` régulièrement; privilégiez `npm ci` en CI/Docker.

## Files importants
- `server.js` : point d'entrée (Express + Socket.IO + Influx optional)
- `public/` : frontend (Chart.js + Socket.IO client)
- `docker-compose.yml` : compose (influxdb, app, grafana)

## Next improvements (possible PRs)
- Provisioning Grafana (datasource + dashboards) at startup
- Add authentication for socket endpoints (JWT)
- Add tests and CI pipeline

