# Architecture de Développement et Déploiement avec Docker, Compose et Coolify

Ce document détaille l'architecture technique pour gérer le cycle de vie de l'application, du développement local au déploiement en production via Coolify, en utilisant Docker et Docker Compose.

## 1. Rôles de Docker et Docker Compose

### Docker
Docker permet d'encapsuler l'application et ses dépendances (Node.js, bibliothèques système, etc.) dans un conteneur isolé. Cela garantit que l'application fonctionne de la même manière sur votre machine de développement et sur le serveur de production ("It works on my machine" -> "It works everywhere").

### Docker Compose
Docker Compose est un outil pour définir et exécuter des applications Docker multi-conteneurs.
- **En Développement** : Il orchestre l'application, la base de données (si nécessaire), et d'autres services, tout en montant le code source en "volume" pour permettre le rechargement à chaud (hot-reload).
- **En Production (Coolify)** : Il sert de plan (blueprint) pour dire à Coolify comment construire et lancer les conteneurs, gérer les réseaux et les redémarrages automatiques.

---

## 2. Cycle de Vie : Dev -> Deploy

Le flux de travail recommandé est le suivant :

1.  **Développement Local** :
    *   Le développeur travaille sur sa machine.
    *   Il utilise `docker-compose -f docker-compose.dev.yml up` pour lancer l'environnement.
    *   Les modifications de code sont reflétées instantanément grâce aux volumes.
2.  **Commit & Push** :
    *   Le code validé est poussé sur GitHub (`git push`).
3.  **Coolify (CD - Continuous Deployment)** :
    *   Coolify détecte le nouveau commit (via Webhook).
    *   Il tire le code.
    *   Il construit l'image Docker en utilisant le `Dockerfile` de production.
    *   Il lance le nouveau conteneur et arrête l'ancien (Zero Downtime Deployment si configuré).

---

## 3. Configuration de l'Environnement de Développement

Pour un environnement de développement efficace, nous séparons la configuration de production de celle de développement.

### Structure des Dossiers Recommandée

Une structure claire facilite la maintenance des configurations Docker.

```
.
├── .docker/
│   ├── dev/
│   │   └── Dockerfile      # Dockerfile optimisé pour le dev (pas de build, juste install deps)
│   └── prod/
│       └── Dockerfile      # Dockerfile multi-stage pour la prod (votre Dockerfile actuel)
├── docker-compose.yml      # Configuration de base / Production
├── docker-compose.dev.yml  # Surcharges pour le développement
├── src/
├── server/
└── ...
```

### Exemples de Configuration

#### A. `docker-compose.dev.yml` (Racine du projet)

Ce fichier étend la configuration de base pour activer le développement interactif.

```yaml
version: '3.8'

services:
  app:
    # Utilise un Dockerfile spécifique pour le dev si besoin, ou la cible 'deps' du Dockerfile principal
    build:
      context: .
      dockerfile: Dockerfile
      target: deps # On s'arrête à l'étape des dépendances, on ne build pas
    
    # Commande pour lancer le mode dev (ex: vite + nodemon)
    command: npm run dev 
    
    # Important : Monte le dossier local dans le conteneur pour le hot-reload
    volumes:
      - .:/app
      - /app/node_modules # Évite d'écraser les node_modules du conteneur avec ceux du local (souvent incompatibles)
    
    # Ouvre les ports pour l'accès local
    ports:
      - "3000:3000" # Frontend (Vite)
      - "3001:3001" # Backend (Express)
    
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true # Nécessaire pour le hot-reload sur certains OS/Docker setups
```

#### B. `Dockerfile` (Optimisé - Votre version actuelle est déjà très bien)

Votre `Dockerfile` actuel est un excellent exemple de "Multi-stage build". Il est parfait pour la production. Pour le développement, comme montré ci-dessus, nous pouvons cibler l'étape `deps` ou `base` pour éviter de reconstruire l'application à chaque changement.

**Note sur votre Dockerfile actuel :**
Il est déjà très bien structuré. Assurez-vous simplement que le fichier `.dockerignore` exclut bien `node_modules`, `.git`, et les fichiers de build locaux pour ne pas polluer le contexte Docker.

### Commandes Utiles

- **Lancer le dev** :
  ```bash
  docker-compose -f docker-compose.dev.yml up --build
  ```
- **Arrêter** :
  ```bash
  docker-compose -f docker-compose.dev.yml down
  ```

---

## 4. Intégration avec Coolify

Coolify simplifie grandement le déploiement. Voici comment il interagit avec ce repo :

1.  **Source** : Vous connectez votre repo GitHub à Coolify.
2.  **Build Pack** : Sélectionnez **Docker Compose** ou **Dockerfile**.
    *   **Mode Dockerfile** : Coolify va simplement construire l'image à partir du `Dockerfile` à la racine et l'exposer. C'est le plus simple pour une app monolithique comme celle-ci.
    *   **Mode Docker Compose** : Coolify va utiliser votre `docker-compose.yml`. C'est utile si vous avez besoin d'ajouter une base de données (Postgres, Redis) dans le même stack.

**Configuration recommandée pour ce projet dans Coolify :**
- **Build Pack** : Dockerfile
- **Dockerfile Path** : `.docker/prod/Dockerfile`
- **Port** : `4000` (Comme exposé dans votre Dockerfile)

Coolify gérera automatiquement les certificats SSL (HTTPS) et le routage du domaine vers ce port.
