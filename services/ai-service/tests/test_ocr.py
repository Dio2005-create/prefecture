from __future__ import annotations

from io import BytesIO
import unittest
from unittest.mock import patch

import fitz
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


class OcrEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_extracts_text_from_image_with_tesseract(self) -> None:
        image_bytes = BytesIO()
        Image.new("RGB", (100, 50), color="white").save(image_bytes, format="PNG")

        with patch("app.main.pytesseract.image_to_string", return_value="Document préfectoral") as recognize:
            response = self.client.post(
                "/ocr",
                files={"file": ("document.png", image_bytes.getvalue(), "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "Document préfectoral")
        self.assertEqual(recognize.call_args.kwargs["lang"], "fra+eng")

    def test_uses_ocr_for_scanned_pdf_pages(self) -> None:
        pdf = fitz.open()
        pdf.new_page()
        pdf_bytes = pdf.tobytes()
        pdf.close()

        with patch("app.main.pytesseract.image_to_string", return_value="Texte du document scanné") as recognize:
            response = self.client.post(
                "/ocr",
                files={"file": ("document.pdf", pdf_bytes, "application/pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "Texte du document scanné")
        recognize.assert_called_once()

    def test_keeps_text_extraction_for_searchable_pdf(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((72, 72), "Texte administratif existant")
        pdf_bytes = pdf.tobytes()
        pdf.close()

        with patch("app.main.pytesseract.image_to_string") as recognize:
            response = self.client.post(
                "/ocr",
                files={"file": ("document.pdf", pdf_bytes, "application/pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "Texte administratif existant")
        recognize.assert_not_called()

    def test_rejects_unsupported_file_types(self) -> None:
        response = self.client.post(
            "/ocr",
            files={"file": ("document.bin", b"data", "application/octet-stream")},
        )

        self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
