import time
from google import genai


class GeminiService:
    def __init__(self, api_key):
        self.client = genai.Client(api_key=api_key)

    def analyze_video(self, file_path, prompt):
        """Uploads a video file and generates content using Gemini."""
        video_file = self.client.files.upload(file=file_path)
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = self.client.files.get(name=video_file.name)

        response = self.client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=[video_file, prompt],
            config={'response_mime_type': 'application/json'}
        )
        return response.text

    def analyze_text(self, prompt):
        """Text-only content generation using Gemini."""
        response = self.client.models.generate_content(
            model="models/gemini-2.0-flash",
            contents=[prompt],
            config={'response_mime_type': 'application/json'}
        )
        return response.text
