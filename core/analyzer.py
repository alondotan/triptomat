import time
from google import genai
from google.genai import errors as genai_errors


class GeminiService:
    def __init__(self, api_key):
        self.client = genai.Client(api_key=api_key)

    def _generate_with_retry(self, model, contents, max_retries=3):
        """Call generate_content with exponential backoff on 429 rate-limit errors."""
        delay = 10
        for attempt in range(max_retries + 1):
            try:
                return self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config={'response_mime_type': 'application/json'},
                )
            except genai_errors.ClientError as e:
                is_rate_limit = getattr(e, 'code', None) == 429 or "RESOURCE_EXHAUSTED" in str(e)
                if is_rate_limit and attempt < max_retries:
                    print(f"Gemini 429 rate limit (attempt {attempt + 1}/{max_retries}), retrying in {delay}s...")
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise

    def analyze_video(self, file_path, prompt):
        """Uploads a video file and generates content using Gemini."""
        video_file = self.client.files.upload(file=file_path)
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = self.client.files.get(name=video_file.name)

        response = self._generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[video_file, prompt],
        )
        return response.text

    def analyze_text(self, prompt):
        """Text-only content generation using Gemini."""
        response = self._generate_with_retry(
            model="models/gemini-2.0-flash",
            contents=[prompt],
        )
        return response.text
