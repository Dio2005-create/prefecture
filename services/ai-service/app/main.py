from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from pypdf import PdfReader
from docx import Document as WordDocument
from pydantic import BaseModel, Field

app = FastAPI(title="Archives AI Service", version="0.2.0")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")


class TextRequest(BaseModel):
    text: str = Field(min_length=1)


class ClassifyRequest(BaseModel):
    text: str = Field(min_length=1)
    categories: list[str] = Field(default_factory=list)


class EmbeddingRequest(BaseModel):
    text: str = Field(min_length=1)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)


async def ollama(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}{path}", json=payload)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=503, detail="Ollama local est indisponible") from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "ai-service", "status": "ok"}


@app.post("/extract-text")
async def extract_text(request: TextRequest) -> dict[str, str]:
    return {"text": " ".join(request.text.split())}


@app.post("/embeddings")
async def embeddings(request: EmbeddingRequest) -> dict[str, Any]:
    result = await ollama("/api/embeddings", {"model": EMBEDDING_MODEL, "prompt": request.text})
    return {"embedding": result.get("embedding", []), "model": EMBEDDING_MODEL}


@app.post("/generate")
async def generate(request: GenerateRequest) -> dict[str, str]:
    result = await ollama("/api/generate", {"model": OLLAMA_MODEL, "prompt": request.prompt, "stream": False})
    return {"response": str(result.get("response", "")), "model": OLLAMA_MODEL}


@app.post("/classify")
async def classify(request: ClassifyRequest) -> dict[str, Any]:
    categories = request.categories or ["ACTE", "ARRETE", "COURRIER", "AUTRE"]
    prompt = (
        "Classe ce document dans une seule catégorie. Réponds uniquement avec le libellé exact. "
        f"Catégories: {', '.join(categories)}\nDocument: {request.text[:6000]}"
    )
    result = await ollama("/api/generate", {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False})
    label = str(result.get("response", "AUTRE")).strip()
    category = next((item for item in categories if item.lower() in label.lower()), "AUTRE")
    return {"category": category, "confidence": None, "method": "IA"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict[str, str]:
    content = await file.read()
    suffix = Path(file.filename or "document").suffix.lower()
    if suffix == ".pdf":
        try:
            from io import BytesIO
            reader = PdfReader(BytesIO(content))
            text = " ".join((page.extract_text() or "") for page in reader.pages)
            return {"text": " ".join(text.split())}
        except Exception as error:
            raise HTTPException(status_code=422, detail="PDF illisible") from error
    if suffix in {".txt", ".md"}:
        return {"text": " ".join(content.decode("utf-8", errors="ignore").split())}
    if suffix == ".docx":
        try:
            from io import BytesIO
            document = WordDocument(BytesIO(content))
            text = " ".join(paragraph.text for paragraph in document.paragraphs)
            return {"text": " ".join(text.split())}
        except Exception as error:
            raise HTTPException(status_code=422, detail="DOCX illisible") from error
    raise HTTPException(status_code=501, detail="OCR PDF/image à installer avec PaddleOCR ou Tesseract")
