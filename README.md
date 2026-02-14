# Triptomat

Extracts travel recommendations from URLs (videos, articles, Google Maps links) using Google Gemini AI, enriches them with geocoding data, and sends them to a webhook.

## Supported Sources

- **YouTube / TikTok / Instagram** - Video analysis via Gemini
- **Google Maps links** - Place identification and enrichment
- **Web articles** - Text extraction and analysis

## Project Structure

```
core/           # Pure logic - no external API calls
  config.py     # Config loading from config.json
  prompt.py     # Gemini prompt builder
  geocoding.py  # Site hierarchy, coordinate extraction, enrichment
  url_helpers.py# URL classification, safe filenames

services/       # External API wrappers
  gemini.py     # GeminiService (video & text analysis)
  google_maps.py# MapsService (geocoding, reverse geocoding, place photos)
  scraper.py    # Web scraping, metadata extraction, video download
  webhook.py    # Webhook delivery

main.py         # Orchestrator and entry point
config.json     # Type definitions and categories
```

## Setup

1. Create a `.env` file:
```
GOOGLE_API_KEY=your-gemini-api-key
MAP_GOOGLE_API_KEY=your-google-maps-api-key
WEBHOOK_URL=your-webhook-url
WEBHOOK_TOKEN=your-webhook-token
```

2. Install dependencies:
```
pip install -r requirements.txt
```

3. Run:
```
python main.py
```

## Testing

```
pytest tests/
```

All core module tests run without API keys or network access.

## Docker

```bash
docker build -t triptomat .
docker-compose run app pytest   # Run tests in container
docker-compose up               # Run the app
```

## Deploy to AWS ECR

```bash
aws ecr get-login-password --region eu-central-1 --profile triptomat | \
  docker login --username AWS --password-stdin 664923616128.dkr.ecr.eu-central-1.amazonaws.com

docker build -t triptomat .
docker tag triptomat:latest 664923616128.dkr.ecr.eu-central-1.amazonaws.com/triptomat:latest
docker push 664923616128.dkr.ecr.eu-central-1.amazonaws.com/triptomat:latest
```
