"""
Module d'abstraction LLM / Embeddings.

Bascule automatiquement entre :
- Ollama en local (développement)      -> AI_PROVIDER=ollama (ou variable absente)
- API Mistral officielle (production)  -> AI_PROVIDER=mistral

Utilisation dans le reste du service IA :
    from app.llm_provider import chat_completion, get_embedding

    reponse = await chat_completion([
        {"role": "system", "content": "Tu es un assistant..."},
        {"role": "user", "content": question},
    ])

    vecteur = await get_embedding(texte)

Place ce fichier dans services/ai-service/app/llm_provider.py
(adapte l'import ci-dessus si ton dossier s'appelle autrement).
"""

import os
import httpx

# ---------------------------------------------------------------------------
# Configuration lue depuis les variables d'environnement
# ---------------------------------------------------------------------------

AI_PROVIDER = os.getenv("AI_PROVIDER", "ollama").lower()  # "ollama" ou "mistral"

# --- Ollama (local) ---
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "mistral")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

# --- Mistral API (production) ---
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_API_URL = "https://api.mistral.ai/v1"
MISTRAL_CHAT_MODEL = os.getenv("MISTRAL_CHAT_MODEL", "mistral-small-latest")
MISTRAL_EMBED_MODEL = os.getenv("MISTRAL_EMBED_MODEL", "mistral-embed")

# ⚠️ IMPORTANT : les dimensions des vecteurs diffèrent selon le modèle d'embedding.
#   - nomic-embed-text (Ollama)  -> 768 dimensions
#   - mistral-embed (Mistral AI) -> 1024 dimensions
# Si tu bascules de l'un à l'autre, la collection Qdrant doit être recréée
# avec la bonne taille de vecteur (vectors_config size=768 ou 1024), sinon
# les insertions/recherches échoueront.
EMBEDDING_DIMENSIONS = 1024 if AI_PROVIDER == "mistral" else 768


# ---------------------------------------------------------------------------
# Chat completion
# ---------------------------------------------------------------------------

async def chat_completion(messages: list[dict], temperature: float = 0.3) -> str:
    """
    messages : liste de dicts au format [{"role": "system"|"user"|"assistant", "content": "..."}]
    Retourne le texte de la réponse générée.
    """
    if AI_PROVIDER == "mistral":
        return await _chat_mistral(messages, temperature)
    return await _chat_ollama(messages, temperature)


async def _chat_ollama(messages: list[dict], temperature: float) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_CHAT_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def _chat_mistral(messages: list[dict], temperature: float) -> str:
    if not MISTRAL_API_KEY:
        raise RuntimeError("MISTRAL_API_KEY manquante : impossible d'appeler l'API Mistral.")
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{MISTRAL_API_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {MISTRAL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MISTRAL_CHAT_MODEL,
                "messages": messages,
                "temperature": temperature,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

async def get_embedding(text: str) -> list[float]:
    """Retourne le vecteur d'embedding pour le texte donné."""
    if AI_PROVIDER == "mistral":
        return await _embed_mistral(text)
    return await _embed_ollama(text)


async def _embed_ollama(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embedding"]


async def _embed_mistral(text: str) -> list[float]:
    if not MISTRAL_API_KEY:
        raise RuntimeError("MISTRAL_API_KEY manquante : impossible d'appeler l'API Mistral.")
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{MISTRAL_API_URL}/embeddings",
            headers={
                "Authorization": f"Bearer {MISTRAL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": MISTRAL_EMBED_MODEL, "input": [text]},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]
