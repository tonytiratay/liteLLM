C'est noté. Vous souhaitez passer d'un simple "guide de démarrage" à une **documentation d'architecture complète**. Nous allons monter le niveau d'un cran.

Nous allons aborder ce déploiement comme un projet d'infrastructure critique. Nous allons intégrer une base de données (**PostgreSQL**) pour le suivi des coûts et des logs, configurer le **Prompt Caching** (notamment pour Anthropic), gérer la traduction automatique des **Function Calling (Tools)** et aborder le **MCP (Model Context Protocol)**.

Voici votre guide de référence complet.

---

# Master Guide : Architecture et Déploiement LiteLLM sur Coolify
### Orchestration, Optimisation des Coûts et Standards MCP

**Version :** 2.0 (Expert)
**Cible :** DevOps, Tech Leads, AI Engineers.
**Objectif :** Déployer une passerelle IA souveraine, capable de traduire les formats de "Tools", de gérer le cache contextuel et d'unifier l'accès aux modèles.

---

## 1. Philosophie et Architecture

Avant de toucher au code, il est crucial de comprendre ce que nous construisons. LiteLLM n'est pas juste un "passe-plat". C'est une **couche d'abstraction (Middleware)**.

### Le problème que nous résolvons
Chaque fournisseur (OpenAI, Google Vertex, Anthropic) parle une "langue" légèrement différente :
*   **OpenAI** utilise un format JSON spécifique pour les `tools`.
*   **Anthropic** utilise des structures XML ou son propre format JSON pour les appels de fonctions.
*   **Google Gemini** a ses propres particularités de sécurité et de structure.

### La solution LiteLLM
LiteLLM normalise tout sur le standard **OpenAI**.
1.  **Entrée :** Votre application envoie une requête standard OpenAI (avec Tools, System Prompt, etc.).
2.  **Traitement :** LiteLLM traduit à la volée, gère le cache, vérifie le budget.
3.  **Sortie :** LiteLLM renvoie une réponse standard OpenAI, quel que soit le modèle réel (Claude, Gemini, Llama).

---

## 2. Infrastructure : Le Dépôt GitHub (Docker Compose Avancé)

Pour une installation de production capable de gérer des logs, des utilisateurs et des budgets, le stockage fichier ne suffit plus. Nous allons déployer **LiteLLM + PostgreSQL**.

### Structure du dépôt
```text
/litellm-prod
├── docker-compose.yml
├── config.yaml
└── .env.example  (pour référence, ne pas commiter les vraies clés)
```

### Le fichier `docker-compose.yml` (Production Ready)

Ce fichier définit deux services : la base de données et le proxy.

```yaml
version: "3.8"

services:
  db:
    image: postgres:15-alpine
    container_name: litellm-db
    environment:
      POSTGRES_DB: litellm
      POSTGRES_USER: llmuser
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U llmuser -d litellm"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: litellm-proxy
    ports:
      - "4000:4000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./config.yaml:/app/config.yaml
    command: [ "--config", "/app/config.yaml", "--detailed_debug" ]
    environment:
      # Connexion DB pour logs et gestion utilisateurs
      - DATABASE_URL=postgresql://llmuser:${DB_PASSWORD}@db:5432/litellm
      # Clé Maître pour l'Admin UI
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      # Injection des clés fournisseurs
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    restart: always

volumes:
  pgdata:
```

> **Note sur Coolify :** Lors du déploiement, Coolify va gérer le réseau interne. Le service `litellm` pourra parler au service `db` via le hostname `db`.

---

## 3. Configuration Avancée : `config.yaml`

C'est ici que réside toute l'intelligence. Nous allons configurer le **Load Balancing**, le **Prompt Caching** et le mappage des modèles.

### Le fichier `config.yaml` commenté

```yaml
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  # Active la persistance des logs et utilisateurs dans Postgres
  database_url: os.environ/DATABASE_URL
  # Pour éviter de loguer le contenu sensible (PII) des prompts dans la DB
  disable_logging: false 

model_list:
  # ---------------------------------------------------------
  # GROUPE 1 : OPENAI (Le standard)
  # ---------------------------------------------------------
  - model_name: gpt-4o
    litellm_params:
      model: gpt-4o
      api_key: os.environ/OPENAI_API_KEY
      # Timeout pour éviter que l'app cliente ne pende indéfiniment
      timeout: 60 

  # ---------------------------------------------------------
  # GROUPE 2 : ANTHROPIC (Avec Prompt Caching)
  # ---------------------------------------------------------
  - model_name: claude-3-5-sonnet
    litellm_params:
      model: claude-3-5-sonnet-20240620
      api_key: os.environ/ANTHROPIC_API_KEY
      # Activation du cache côté fournisseur (Anthropic Beta feature)
      # Cela permet de ne pas repayer pour le contexte système répété
      headers: 
        anthropic-beta: "prompt-caching-2024-07-31"

  # ---------------------------------------------------------
  # GROUPE 3 : GOOGLE (Gemini avec traduction de Tools)
  # ---------------------------------------------------------
  - model_name: gemini-pro
    litellm_params:
      model: gemini/gemini-1.5-pro
      api_key: os.environ/GEMINI_API_KEY
      # Configuration de sécurité spécifique Google
      safety_settings:
        - category: HARM_CATEGORY_HARASSMENT
          threshold: BLOCK_NONE

  # ---------------------------------------------------------
  # ROUTEUR VIRTUEL (Alias intelligent)
  # ---------------------------------------------------------
  # Permet d'appeler "best-model" dans votre code. 
  # LiteLLM redirigera vers gpt-4o ou claude selon la dispo ou la config.
  - model_name: best-model
    litellm_params:
      model: gpt-4o 
```

---

## 4. Focus Technique : Tools, Caching et MCP

C'est la partie "Expert" que vous attendiez.

### A. Gestion des Tools (Function Calling)
C'est la fonctionnalité la plus puissante de LiteLLM.
*   **Le défi :** Vous avez une application qui envoie une définition de fonction JSON (ex: `get_weather(location)`) au format OpenAI. Vous voulez utiliser **Claude 3.5 Sonnet** ou **Gemini**.
*   **La mécanique :** LiteLLM intercepte le JSON OpenAI, le convertit en XML (pour les anciennes versions de Claude) ou en structure `tool_use` (pour les nouvelles) et l'envoie à Anthropic. Au retour, il reconvertit la réponse d'Anthropic en format OpenAI `tool_calls`.
*   **Implémentation :** C'est **transparent**. Il n'y a rien à configurer de plus que le modèle. Si votre client envoie des tools, LiteLLM les traduit.

### B. Prompt Caching (Anthropic & Co.)
Le Prompt Caching permet de réduire les coûts jusqu'à 90% et la latence de 80% pour les prompts longs et répétitifs (ex: documents juridiques, bases de code).

Il y a deux niveaux de cache :

1.  **Cache "Exact Match" (Redis - Optionnel) :** LiteLLM garde en mémoire la réponse exacte à une question déjà posée.
2.  **Cache "Provider" (Anthropic Context Caching) :** C'est celui configuré dans le YAML ci-dessus (`anthropic-beta`).
    *   **Comment l'utiliser :** Dans votre code client, vous devez marquer les parties du prompt à mettre en cache (via les `cache_control` blocks). LiteLLM transmettra ces marqueurs à Anthropic.

### C. MCP (Model Context Protocol)
Le MCP est un standard émergeant (poussé par Anthropic) pour connecter les LLM aux données locales (fichiers, bases de données).

**Comment LiteLLM s'insère dans le MCP ?**
LiteLLM n'est pas un "serveur MCP" (qui fournit des données), mais il est le **Client Universel** parfait pour les outils qui utilisent MCP.
*   Si vous utilisez un outil comme **Cursor** ou **Claude Desktop** qui attend un endpoint compatible OpenAI pour fonctionner avec ses outils internes.
*   Vous configurez votre outil MCP pour pointer vers l'URL de votre LiteLLM (`https://mon-llm.com/v1`).
*   LiteLLM route les requêtes complexes du protocole vers le modèle le plus performant (ex: Claude 3.5) tout en gardant une interface standard.

---

## 5. Déploiement sur Coolify (Pas à Pas)

### Étape 1 : Secrets (Environment Variables)
Dans Coolify, créez votre ressource via le dépôt Git. Avant de déployer, allez dans **Environment Variables** et ajoutez :

| Clé | Valeur (Exemple) | Rôle |
| :--- | :--- | :--- |
| `LITELLM_MASTER_KEY` | `sk-admin-super-secure` | Clé root pour créer d'autres clés |
| `DB_PASSWORD` | `monSuperMdpDB` | Sécurise le Postgres interne |
| `OPENAI_API_KEY` | `sk-...` | Crédits OpenAI |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Crédits Anthropic |
| `GEMINI_API_KEY` | `AIza...` | Crédits Google |

### Étape 2 : Configuration du Service
*   **Build Pack :** Docker Compose.
*   **Ports :** Coolify détectera le port `4000`. Assurez-vous d'activer l'exposition publique (HTTPS).

### Étape 3 : Vérification Post-Déploiement
Une fois déployé, testez l'API via une commande curl (ou Postman) :

```bash
curl --location 'https://llm.mon-domaine.com/v1/chat/completions' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer sk-admin-super-secure' \
--data '{
    "model": "claude-3-5-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
}'
```

---

## 6. Gestion via l'Interface Utilisateur (Admin UI)

L'UI n'est pas juste un gadget, c'est votre **centre de contrôle financier**.

Accédez à `https://llm.mon-domaine.com/ui`.

### A. Création de "Virtual Keys" (Sécurité & Budget)
Ne donnez jamais votre `LITELLM_MASTER_KEY` aux développeurs ou aux applications. Créez des clés virtuelles.

1.  Allez dans **Virtual Keys** > **+ Create New Key**.
2.  **Models :** Restreignez cette clé à certains modèles (ex: `gpt-4o-mini` pour les tests, `claude-3-5` pour la prod).
3.  **Budget & Limits :**
    *   **Max Budget :** 50$ (La clé cesse de fonctionner si dépassé).
    *   **Rate Limit :** 100 requêtes / minute (Pour éviter les boucles infinies accidentelles).
4.  **Metadata :** Ajoutez le nom du projet ou du client (ex: `{"client": "Marketing", "app": "chatbot"}`).

### B. Suivi des Logs et Debugging
Grâce à la base PostgreSQL configurée :
*   Allez dans l'onglet **Logs**.
*   Vous voyez chaque requête, le modèle utilisé, la latence, le coût exact et le contenu (sauf si `disable_logging` est actif).
*   **Usage Tool :** Vous verrez si les appels de fonctions ont réussi ou échoué, ce qui est critique pour déboguer les agents IA.

---

## 7. Tableau de Synthèse : Pourquoi cette Stack ?

| Fonctionnalité | Sans LiteLLM (Direct SDK) | Avec LiteLLM + Coolify |
| :--- | :--- | :--- |
| **Changement de modèle** | Réécriture de code + Redéploiement app | Changement d'alias dans `config.yaml` |
| **Gestion des Tools** | Spécifique à chaque provider (Enfer) | Standardisé (Format OpenAI unique) |
| **Prompt Caching** | Gestion manuelle des headers | Configuration via Config ou Pass-through |
| **Suivi des coûts** | Factures éparpillées (Google, OpenAI...) | Dashboard centralisé par projet/clé |
| **Sécurité** | Clés API "root" dans le code | Clés virtuelles limitées et révocables |

---

## 8. Le mot de la fin : Maintenance

Votre instance est maintenant déployée. Voici votre routine de maintenance :
1.  **Mise à jour des modèles :** Quand OpenAI sort `gpt-5`, ajoutez-le dans `config.yaml`, redéployez via Coolify. Pas besoin de toucher à vos applications.
2.  **Rotation des clés :** Si une clé virtuelle fuite, révoquez-la dans l'UI. Vos clés fournisseurs (Master) restent en sécurité dans les secrets Coolify.
3.  **Surveillance :** Jetez un œil aux logs de latence dans l'UI pour identifier si Google ou OpenAI a des lenteurs et basculez le trafic si nécessaire.