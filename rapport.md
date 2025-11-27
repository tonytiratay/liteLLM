# Rapport : Unification des APIs de Modèles avec LiteLLM

Ce rapport sert de référence technique pour le déploiement en production de solutions basées sur LiteLLM, unifiant les modèles de pointe (Nov 2025) : Anthropic, Google Gemini et OpenAI.

## 1. Modèles et Versions (État de l'art : Nov 2025)

Cette section recense les modèles "Next-Gen" validés pour le déploiement.

| Provider | Modèle | Date de Sortie | Identifiant LiteLLM (Est.) | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | **GPT-5.1 Instant** | 12 Nov 2025 | `gpt-5.1-chat-latest` | Modèle par défaut, rapide et conversationnel. |
| | **GPT-5.1 Thinking** | 12 Nov 2025 | `gpt-5.1` | Raisonnement adaptatif avancé. Remplace o1 pour les tâches complexes. |
| | *GPT-5.1 Pro* | 19 Nov 2025 | `gpt-5.1-pro` | Pour usage professionnel complexe (abonnement Pro). |
| **Anthropic** | **Claude 4.5 Opus** | 24 Nov 2025 | `anthropic/claude-4-5-opus-20251124` | Le nouveau SOTA (State of the Art) pour le raisonnement et le code. |
| | **Claude 4.5 Sonnet** | 30 Sept 2025 | `anthropic/claude-4-5-sonnet-20250930` | Équilibre performance/coût. |
| **Google** | **Gemini 3 Pro** | 18 Nov 2025 | `gemini/gemini-3-pro-preview` | Disponible en "Thinking Mode". Multimodal natif avancé. |

**Note Critique** : Ces modèles étant très récents (Nov 2025), assurez-vous d'utiliser la toute dernière version de LiteLLM (v1.65+ recommandée) pour garantir le mapping correct des identifiants.

## 2. Gestion des Tools (Function Calling)

LiteLLM unifie la gestion des outils en utilisant le **format standard OpenAI** pour tous les providers.

### Fonctionnement Unifié

1.  **Définition** : Vous définissez toujours les outils au format JSON Schema d'OpenAI (`tools = [{"type": "function", "function": {...}}]`).
2.  **Appel** : LiteLLM traduit cette définition vers le format natif du provider (ex: `input_schema` pour Anthropic).
3.  **Réponse** : LiteLLM intercepte la réponse du modèle et la convertit en un objet `tool_calls` standardisé (compatible OpenAI).

### Spécificités par Provider

| Provider | Support LiteLLM | Détails Techniques |
| :--- | :--- | :--- |
| **Anthropic** | **Natif (Traduit)** | LiteLLM convertit les `tools` OpenAI en `tools` Anthropic. La réponse `stop_reason: tool_use` est transformée en objet `tool_calls`. |
| **Google Gemini** | **Natif (Traduit)** | Supporte les "Function Declarations" natives. LiteLLM gère la préservation du contexte ("thought signatures") nécessaire pour les conversations multi-tours avec outils. |
| **OpenAI** | **Natif (Direct)** | Pas de traduction nécessaire. Utilise l'API `tools` native. |

**Recommandation Production** : Utilisez exclusivement le format de définition OpenAI dans votre code. Ne tentez pas d'adapter manuellement le schéma pour Claude ou Gemini, LiteLLM le fait mieux et gère les cas limites.

## 3. Prompt Caching

LiteLLM supporte le Prompt Caching pour réduire les coûts et la latence, mais l'implémentation diffère selon le provider.

### Anthropic (Explicite)
Nécessite d'ajouter un marqueur `cache_control` dans le contenu des messages.
*   **Support LiteLLM** : Oui, via l'ajout de `cache_control` dans le corps du message.
*   **Code** : Ajoutez `{"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}` dans votre contenu de message.
*   **Limitations** : Max 4 blocs de cache. Coût d'écriture élevé, lecture faible.

### Google Gemini (Context Caching)
Utilise un mécanisme de "Context Caching" pour les contextes très longs.
*   **Support LiteLLM** : Oui, supporte la création et la gestion de cache contextuel.
*   **Fonctionnalité** : Permet de définir un TTL (Time-To-Live). Utile pour des documents statiques massifs.

### OpenAI (Automatique)
OpenAI gère le cache automatiquement pour les prompts > 1024 tokens.
*   **Support LiteLLM** : Transparent. LiteLLM renvoie les métriques d'usage (`cached_tokens`) dans la réponse standardisée.
*   **Action requise** : Aucune. Structurez vos prompts pour placer le contenu statique au début.

## 4. Model Context Protocol (MCP)

Depuis la version 1.65.0, LiteLLM offre un support natif pour le protocole MCP, agissant comme une passerelle universelle.

*   **Rôle de LiteLLM** : Agit comme un "MCP Gateway". Il peut se connecter à des serveurs MCP existants et exposer leurs outils comme des fonctions standard OpenAI aux modèles.
*   **Avantage** : Permet d'utiliser des outils MCP (ex: accès base de données, filesystem) avec n'importe quel modèle (Claude, GPT, Gemini) sans réécrire l'intégration.
*   **Configuration** : Vous enregistrez les serveurs MCP dans la configuration LiteLLM Proxy. LiteLLM convertit automatiquement les outils MCP en définitions `tools` pour le modèle.

## 5. Format de Réponse Unifié (Structured Outputs)

LiteLLM permet d'imposer un format de sortie JSON strict (`json_schema`) quel que soit le modèle.

*   **Support** :
    *   **OpenAI** : Utilise nativement `response_format: { type: "json_schema", ... }`.
    *   **Anthropic / Gemini** : LiteLLM émule ce comportement. Il injecte les instructions de formatage dans le prompt système et, si configuré (`enable_json_schema_validation=True`), valide et repare le JSON côté client avant de vous le renvoyer.
*   **Usage** : Passez simplement le paramètre `response_format` (syntaxe OpenAI) à `litellm.completion`. LiteLLM s'occupe de la traduction pour Claude (via `tools` ou prompt) et Gemini.

## Conclusion

Pour une architecture robuste et agnostique du provider en 2025 :
1.  **Modèles** : Ciblez `gpt-5.1`, `claude-4-5-sonnet`, et `gemini-3-pro`.
2.  **Code** : Écrivez tout en "dialecte OpenAI" (Tools, Messages, Response Format).
3.  **Infrastructure** : Utilisez LiteLLM (v1.65+) comme proxy pour gérer la traduction, le caching, et l'intégration MCP.
