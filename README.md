# Triptomat

A travel intelligence platform that processes content from URLs and emails using AI, and surfaces it in a full trip management UI.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Backend (AWS Lambda)            │
│                                             │
│  Gateway → Downloader → Worker              │
│  (API GW)  (yt-dlp/S3)  (Gemini/geocoding)  │
│                                             │
│  Mail Handler (email → AI analysis)         │
└──────────────────┬──────────────────────────┘
                   │ webhook (HTTP POST)
┌──────────────────▼──────────────────────────┐
│           Frontend (Supabase + React)        │
│                                             │
│  Edge Functions (travel-webhook /           │
│                  recommendation-webhook)    │
│  PostgreSQL (trips, POIs, itinerary, ...)   │
│  React SPA (Itinerary, Map, Budget, ...)    │
└─────────────────────────────────────────────┘
```

## Repo Structure

```
backend (root)
  core/                  # Shared Python logic (prompts, geocoding, scrapers)
  lambda_gateway/        # API entry point, DynamoDB cache, SQS dispatch
  lambda_downloader/     # Downloads video via yt-dlp, uploads to S3
  lambda_worker/         # Gemini analysis, geocoding, webhook delivery
  lambda_mail_handler/   # Parses raw emails, OpenAI analysis, webhook
  requirements.txt
  config.json            # Type definitions and categories
  local_dev.py           # Local development runner
  route_map.html         # Standalone route-planning tool

frontend/
  src/                   # React/TypeScript source
  supabase/              # Edge Functions + DB migrations
  public/
  package.json
```

## Backend Setup

```bash
pip install -r requirements.txt
```

`.env`:
```
GOOGLE_API_KEY=
MAP_GOOGLE_API_KEY=
WEBHOOK_URL=https://<project>.supabase.co/functions/v1/travel-webhook
WEBHOOK_TOKEN=
OPENAI_API_KEY=
```

### Build & Deploy a Lambda

```bash
# From repo root:
docker build --provenance=false -t triptomat-<name> -f lambda_<name>/Dockerfile .
docker tag triptomat-<name>:latest 664923616128.dkr.ecr.eu-central-1.amazonaws.com/triptomat-<name>:latest
docker push 664923616128.dkr.ecr.eu-central-1.amazonaws.com/triptomat-<name>:latest
aws lambda update-function-code --function-name triptomat-<name> \
  --image-uri 664923616128.dkr.ecr.eu-central-1.amazonaws.com/triptomat-<name>:latest \
  --profile triptomat --region eu-central-1
```

### Tests

```bash
pytest tests/
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

`frontend/.env`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

### Deploy Supabase Edge Functions

```bash
cd frontend
supabase functions deploy travel-webhook
supabase functions deploy recommendation-webhook
```
