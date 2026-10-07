import json
import os
import unittest
from contextlib import redirect_stdout
from io import StringIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from groq import GroqError, NotFoundError
from httpx import Request, Response

from main import app


class InterviewApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @staticmethod
    def groq_client_with_response(response: dict[str, object]) -> SimpleNamespace:
        completion = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(response)),
                )
            ]
        )
        create = AsyncMock(return_value=completion)
        return SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=create),
            )
        )

    def test_interview_turn_uses_requested_model_and_reports_end_state(self) -> None:
        groq_client = self.groq_client_with_response(
            {"message": "Thank you for your answers. This interview is complete.", "ended": True}
        )
        with patch("main.get_groq_client", return_value=groq_client):
            response = self.client.post(
                "/interview/next",
                json={
                    "topic": "Python generators",
                    "difficulty": "Hard",
                    "conversation": [
                        {"role": "interviewer", "content": "How do generators handle state?"},
                        {"role": "candidate", "content": "They preserve local state between yields."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ended"], True)
        call = groq_client.chat.completions.create.await_args
        self.assertEqual(call.kwargs["model"], "openai/gpt-oss-120b")
        self.assertEqual(call.kwargs["response_format"], {"type": "json_object"})

    def test_start_interview_returns_first_question(self) -> None:
        groq_client = self.groq_client_with_response(
            {"message": "What is a Python generator?", "ended": False}
        )
        with patch("main.get_groq_client", return_value=groq_client):
            response = self.client.post(
                "/interview/start",
                json={"topic": "Python generators", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"message": "What is a Python generator?", "ended": False},
        )
        payload = json.loads(groq_client.chat.completions.create.await_args.kwargs["messages"][1]["content"])
        self.assertEqual(payload["conversation"], [])

    def test_submit_answer_returns_next_turn(self) -> None:
        groq_client = self.groq_client_with_response(
            {"message": "Thanks. How does yield differ from return?", "ended": False}
        )
        with patch("main.get_groq_client", return_value=groq_client):
            response = self.client.post(
                "/interview/answer",
                json={
                    "topic": "Python generators",
                    "difficulty": "Medium",
                    "conversation": [
                        {"role": "interviewer", "content": "What is a generator?"},
                        {"role": "candidate", "content": "An iterator that yields values lazily."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["ended"])

    def test_submit_answer_requires_candidate_as_last_message(self) -> None:
        response = self.client.post(
            "/interview/answer",
            json={
                "topic": "Python",
                "difficulty": "Easy",
                "conversation": [
                    {"role": "interviewer", "content": "What is Python?"},
                ],
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_report_returns_structured_score_and_result(self) -> None:
        report = {
            "score": 72,
            "performance_band": "Good",
            "strengths": ["You correctly described preserving local state between yields."],
            "weaknesses": ["You did not explain how generator cleanup works."],
            "topics_to_revise": ["Generator cleanup"],
            "overall_verdict": "You demonstrated good understanding, with one gap in cleanup behavior.",
            "result": "Pass",
        }
        with patch("main.get_groq_client", return_value=self.groq_client_with_response(report)):
            response = self.client.post(
                "/report",
                json={
                    "topic": "Python generators",
                    "difficulty": "Medium",
                    "conversation": [
                        {"role": "interviewer", "content": "How do generators handle state?"},
                        {"role": "candidate", "content": "They preserve local state between yields."},
                        {"role": "interviewer", "content": "This concludes the interview."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), report)

    def test_report_rejects_band_that_does_not_match_score(self) -> None:
        report = {
            "score": 69,
            "performance_band": "Good",
            "strengths": [],
            "weaknesses": [],
            "topics_to_revise": [],
            "overall_verdict": "Adequate performance.",
            "result": "Fail",
        }
        with patch("main.get_groq_client", return_value=self.groq_client_with_response(report)):
            response = self.client.post(
                "/report",
                json={
                    "topic": "Python generators",
                    "difficulty": "Easy",
                    "conversation": [
                        {"role": "interviewer", "content": "What is a generator?"},
                        {"role": "candidate", "content": "A generator yields values."},
                        {"role": "interviewer", "content": "Thank you. This concludes the interview."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 502)

    def test_invalid_difficulty_is_rejected(self) -> None:
        response = self.client.post(
            "/interview/next",
            json={"topic": "Python", "difficulty": "Expert", "conversation": []},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("must be Easy, Medium, or Hard", response.json()["detail"])

    def test_blank_topic_has_a_friendly_validation_error(self) -> None:
        response = self.client.post(
            "/interview/start",
            json={"topic": "   ", "difficulty": "Easy"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Topic must not be blank.")

    def test_unknown_request_fields_are_rejected(self) -> None:
        response = self.client.post(
            "/interview/start",
            json={
                "topic": "Python",
                "difficulty": "Easy",
                "conversation": [],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Please check", response.json()["detail"])

    def test_conversation_must_alternate_speakers(self) -> None:
        response = self.client.post(
            "/interview/answer",
            json={
                "topic": "Python",
                "difficulty": "Easy",
                "conversation": [
                    {"role": "interviewer", "content": "What is Python?"},
                    {"role": "interviewer", "content": "What else?"},
                    {"role": "candidate", "content": "A programming language."},
                ],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("must alternate", response.json()["detail"])

    def test_invalid_json_has_a_friendly_error(self) -> None:
        response = self.client.post(
            "/interview/start",
            content="{",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "The request body must be valid JSON.")

    def test_missing_groq_key_returns_service_unavailable(self) -> None:
        with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            from main import get_groq_client

            get_groq_client.cache_clear()
            try:
                response = self.client.post(
                    "/interview/next",
                    json={"topic": "Python", "difficulty": "Easy", "conversation": []},
                )
            finally:
                get_groq_client.cache_clear()

        self.assertEqual(response.status_code, 503)

    def test_groq_errors_return_a_friendly_provider_error(self) -> None:
        groq_client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(side_effect=GroqError("internal provider message"))
                )
            )
        )
        with patch("main.get_groq_client", return_value=groq_client):
            response = self.client.post(
                "/interview/start",
                json={"topic": "Python", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["detail"],
            "The AI provider could not complete the request. Please try again.",
        )
        self.assertNotIn("internal provider message", response.text)

    def test_unavailable_groq_model_returns_actionable_error(self) -> None:
        response_stub = Response(
            404,
            request=Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
        )
        model_error = NotFoundError(
            "The requested model is unavailable.",
            response=response_stub,
            body={"error": {"code": "model_not_found"}},
        )
        groq_client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(side_effect=model_error)
                )
            )
        )
        with patch("main.get_groq_client", return_value=groq_client):
            response = self.client.post(
                "/interview/start",
                json={"topic": "Python", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("not available to this API key", response.json()["detail"])
        self.assertIn("GROQ_MODEL", response.json()["detail"])

    def test_configured_model_is_used_for_groq_request(self) -> None:
        groq_client = self.groq_client_with_response(
            {"message": "What is an index?", "ended": False}
        )
        with (
            patch("main.get_groq_client", return_value=groq_client),
            patch.dict(os.environ, {"GROQ_MODEL": "available-model-id"}),
        ):
            response = self.client.post(
                "/interview/start",
                json={"topic": "Database indexes", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            groq_client.chat.completions.create.await_args.kwargs["model"],
            "available-model-id",
        )

    def test_unexpected_errors_return_a_friendly_server_error(self) -> None:
        test_client = TestClient(app, raise_server_exceptions=False)
        with patch("main.get_next_interview_turn", side_effect=RuntimeError("internal error")):
            response = test_client.post(
                "/interview/start",
                json={"topic": "Python", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["detail"],
            "Something went wrong on the server. Please try again.",
        )
        self.assertNotIn("internal error", response.text)

    def test_startup_prints_a_clear_ready_message(self) -> None:
        output = StringIO()
        with redirect_stdout(output), TestClient(app):
            pass

        self.assertIn("AI Interview Coach API is ready", output.getvalue())
        self.assertIn("GET /health", output.getvalue())
        self.assertIn("/docs", output.getvalue())

    def test_localhost_frontend_origin_is_allowed(self) -> None:
        response = self.client.options(
            "/interview/start",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:3001",
        )

    def test_health_check_is_available(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
