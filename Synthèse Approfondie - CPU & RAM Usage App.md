### Essentiels du projet de monitoring temps réel CPU/RAM

- **But:** Interface web affichant en direct l’utilisation CPU et RAM d’un serveur, avec rafraîchissement sans rechargement et possibilité d’historiser les métriques.
- **Portée:** Temps réel côté frontend, diffusion via WebSocket, persistance dans une base de séries temporelles, visualisation professionnelle, déploiement local et cloud.
- **Extensibilité:** Ajout de nouvelles métriques (réseau, disque, uptime), multi-serveurs, alertes et intégration Grafana.

---

### Architecture et choix techniques

- **Stack cœur:**  
  - **Backend:** Node.js + Express (API + static), **Socket.IO** (push temps réel).  
  - **Collecte système:** `os` (natif) + `pidusage` (CPU process), mémoire via `os.totalmem()/freemem()`.  
  - **Frontend:** HTML/CSS/JS + Chart.js pour graphes.  
  - **Persistance (option pro):** InfluxDB 1.8 via client Node `influx`.
- **Flux logique:**  
  - **Serveur:** collecte → émet métriques via Socket.IO → sert frontend → écrit dans InfluxDB.  
  - **Client:** reçoit métriques → met à jour DOM + graphiques.

---

### Implémentation clé

- **Backend (server.js):**  
  - **Intervalle:** 1000 ms.  
  - **Données émises:**  
    - **CPU:** `stats.cpu` (pourcentage).  
    - **RAM:** pourcentage utilisé calculé à partir de mémoire totale/libre, + total RAM (Go).  
    - **Timestamp:** ISO.  
  - **InfluxDB (pro):** mesure `system_metrics`, tags `host`, champs `cpu`, `ram`, `totalRam`.
- **Frontend (index.html):**  
  - **WebSocket:** écoute `metrics`.  
  - **Chart.js:** deux datasets (CPU, RAM), axe 0–100%, buffer des 30 derniers points.  
  - **Affichage live:** spans CPU/RAM mis à jour.

---

### Déploiement et opération

- **Local rapide:** `npm install express socket.io pidusage && node server.js`, accès sur `http://localhost:3000`.
- **Docker (prod-ready):**  
  - **Dockerfile Node:** base node:18, install deps, expose 3000.  
  - **Compose complet:** services `app` (Node), `influxdb` (1.8), `grafana`; ports 3000/3001/8086; volumes persistants; dépendances ordonnées.
- **Gestion process:** PM2 en option pour garder l’app en fond sur VPS.
- **Cloud:** Compatible AWS EC2, OVH VPS, ou plateformes managées; ouverture de port 3000 et stack Docker via `docker-compose up -d`.

---

### Visualisation avec Grafana

- **Rôle:** UI de dashboards temps réel, corrélations, alertes, partage.  
- **Data source:** InfluxDB 1.8 (InfluxQL), URL `http://influxdb:8086`, DB `metrics_db`.  
- **Requêtes type:**  
  - **CPU:** `SELECT mean("cpu") FROM "system_metrics" WHERE $timeFilter GROUP BY time($__interval) fill(null)`  
  - **RAM:** `SELECT mean("ram") FROM "system_metrics" WHERE $timeFilter GROUP BY time($__interval) fill(null)`  
- **Auto-refresh:** 1–5s; dashboard JSON prêt à importer fourni.

---

### Bonnes pratiques, sécurité et évolutions

- **Sécurité:**  
  - **Grafana:** changer admin password, limiter ports exposés.  
  - **HTTPS & proxy:** Nginx/Traefik devant Grafana et l’app.  
  - **CORS & auth:** restreindre domaines, JWT pour l’app si multi-utilisateurs.
- **Observabilité avancée:**  
  - **Métriques supplémentaires:** I/O disque, réseau, uptime, température.  
  - **Alertes:** seuils CPU/RAM (ex. >90%), notifications (mail/Slack/Discord).  
  - **Multi-serveurs:** tag `host` et agents distants pour agréger dans une même InfluxDB.
- **Performance & robustesse:**  
  - **Fréquence d’échantillonnage:** adapter pour charge (ex. 1–5s).  
  - **Backpressure:** éviter surcharge Socket.IO; buffer côté client limité à 30 points.  
  - **Résilience:** gestion d’erreurs collecte/DB, reconnexion WebSocket, retry InfluxDB.

---

### Points de vigilance caractéristiques

- **CPU mesuré:** `pidusage(process.pid)` reflète l’usage du processus Node, pas le CPU global; pour CPU système, utiliser une méthode dédiée (ex. calcul sur `os.cpus()` ou un module adapté).
- **InfluxDB 1.8 vs 2.x:** 1.8 simplifie la mise en route (pas de token/bucket), mais 2.x demande config (auth, org, bucket) et offre plus de fonctionnalités.
- **Chart.js en frontal:** pratique pour un POC, mais Grafana est plus adapté pour des dashboards pro, multi-panneaux et historiques longue durée.
- **Séparation des responsabilités:** garder collecte, diffusion, persistance et visualisation découplées pour évolutivité et maintenance.

---

### Prochaines étapes concrètes

- **Basculer la mesure CPU vers le système global** si nécessaire pour l’objectif du projet.  
- **Activer alertes Grafana** sur seuils CPU/RAM et définir canal de notification.  
- **Ajouter tag `host`** partout et préparer l’agent distant pour multi-serveurs.  
- **Mettre en place HTTPS** via Nginx/Traefik et durcir la config réseau (pare-feu, ports).  
- **Documenter les variables d’environnement** (INFLUX_HOST/DB, ports) dans le README et fournir le dashboard JSON dans le repo.