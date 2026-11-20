from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import OLLAMA_NUM_CTX, OLLAMA_NUM_PREDICT, OLLAMA_NUM_THREADS, app


class OllamaEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_generate_limits_cpu_context_and_output(self) -> None:
        with patch("app.main.ollama", new_callable=AsyncMock, return_value={"response": "Réponse"}) as call:
            response = self.client.post("/generate", json={"prompt": "Question"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            call.await_args.args,
            (
                "/api/generate",
                {
                    "model": "mistral",
                    "prompt": "Question",
                    "stream": False,
                    "options": {
                        "num_thread": OLLAMA_NUM_THREADS,
                        "num_ctx": OLLAMA_NUM_CTX,
                        "num_predict": OLLAMA_NUM_PREDICT,
                    },
                },
            ),
        )

    def test_classify_uses_same_resource_limits(self) -> None:
        with patch("app.main.ollama", new_callable=AsyncMock, return_value={"response": "ACTE"}) as call:
            response = self.client.post("/classify", json={"text": "Document"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            call.await_args.args[1]["options"],
            {"num_thread": OLLAMA_NUM_THREADS, "num_ctx": OLLAMA_NUM_CTX, "num_predict": OLLAMA_NUM_PREDICT},
        )


if __name__ == "__main__":
    unittest.main()
