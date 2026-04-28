import time
from google import genai


class GeminiService:
    def __init__(self, api_key):
        self.client = genai.Client(api_key=api_key)

    @staticmethod
    def _is_rate_limit_error(e):
        err_str = str(e)
        return (
            getattr(e, 'code', None) == 429
            or "RESOURCE_EXHAUSTED" in err_str
            or "429" in err_str
        )

    def _generate_with_retry(self, model, contents, max_retries=2):
        """Call generate_content with exponential backoff on 429 rate-limit errors."""
        delay = 15
        for attempt in range(max_retries + 1):
            try:
                return self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config={'response_mime_type': 'application/json'},
                )
            except Exception as e:
                if self._is_rate_limit_error(e) and attempt < max_retries:
                    print(f"Gemini rate limit on attempt {attempt + 1}/{max_retries}, retrying in {delay}s... ({type(e).__name__}: {str(e)[:120]})")
                    time.sleep(delay)
                    delay = min(delay * 2, 45)
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
