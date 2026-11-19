from __future__ import annotations

import os
from pathlib import Path
from io import BytesIO
from typing import Any

import fitz
import httpx
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader
from docx import Document as WordDocument
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

app = FastAPI(title="Archives AI Service", version="0.2.0")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "fra+eng")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 30
MAX_IMAGE_PIXELS = 40_000_000
OCR_TIMEOUT_SECONDS = 30


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
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (20 Mo maximum)")

    suffix = Path(file.filename or "document").suffix.lower()
    if suffix == ".pdf":
        return {"text": await run_in_threadpool(extraire_texte_pdf, content)}
    if suffix in {".txt", ".md"}:
        return {"text": " ".join(content.decode("utf-8", errors="ignore").split())}
    if suffix == ".docx":
        return {"text": await run_in_threadpool(extraire_texte_docx, content)}
    if suffix in {".jpg", ".jpeg", ".png", ".tif", ".tiff"}:
        return {"text": await run_in_threadpool(extraire_texte_image, content)}
    raise HTTPException(status_code=415, detail="Format non pris en charge")


def extraire_texte_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(content))
        if len(reader.pages) > MAX_PDF_PAGES:
            raise HTTPException(status_code=413, detail="PDF trop long (30 pages maximum)")

        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        if any(not page for page in pages):
            with fitz.open(stream=content, filetype="pdf") as document:
                for index, page_text in enumerate(pages):
                    if page_text:
                        continue
                    pixmap = document.load_page(index).get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.open(BytesIO(pixmap.tobytes("png")))
                    pages[index] = reconnaitre_texte(image)
        return " ".join("\n".join(pages).split())
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail="PDF illisible") from error


def extraire_texte_image(content: bytes) -> str:
    try:
        with Image.open(BytesIO(content)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image trop grande pour être traitée")
            image.load()
            return " ".join(reconnaitre_texte(image).split())
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=422, detail="Image illisible") from error


def extraire_texte_docx(content: bytes) -> str:
    try:
        document = WordDocument(BytesIO(content))
        text = " ".join(paragraph.text for paragraph in document.paragraphs)
        return " ".join(text.split())
    except Exception as error:
        raise HTTPException(status_code=422, detail="DOCX illisible") from error


def reconnaitre_texte(image: Image.Image) -> str:
    try:
        return pytesseract.image_to_string(image, lang=OCR_LANGUAGES, timeout=OCR_TIMEOUT_SECONDS)
    except pytesseract.TesseractNotFoundError as error:
        raise HTTPException(status_code=503, detail="Le moteur OCR Tesseract est indisponible") from error
    except RuntimeError as error:
        if "timeout" in str(error).lower():
            raise HTTPException(status_code=504, detail="Le traitement OCR a dépassé le délai autorisé") from error
        raise HTTPException(status_code=503, detail="Le moteur OCR Tesseract n’a pas pu traiter le fichier") from error
