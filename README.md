# Valueprism

A legal services pricing tool that analyzes public company SEC filings and client documents to generate value-based fee recommendations.

## What it does

Valueprism guides lawyers through a structured workflow to price legal work based on client business value rather than billable hours:

1. **Company search** — Find a public company by name or ticker
2. **Document upload** — Upload client materials and law firm documents (contracts, memos, pitches, etc.)
3. **Matter profile** — Calibrate the engagement across seven dimensions: business impact, geographic footprint, complexity, urgency, risk, counterparty strength, and visibility
4. **Analysis** — The app fetches the company's latest 10-K from SEC Edgar, extracts business unit context, and sends everything to Gemini to generate two focused review questions
5. **Question answering** — Answer the two questions based on the uploaded documents
6. **Pricing** — Gemini synthesizes all inputs and produces a value-based fee recommendation with floor, recommended, and ceiling bands
7. **Results** — View the final pricing output with a breakdown by value dimension, key assumptions, and pricing scenario curves

## Tech stack

- **Next.js 16** with App Router (Node.js runtime for API routes)
- **React 19** with TypeScript
- **Tailwind CSS 4**, Framer Motion, Recharts
- **Google Gemini** (`gemini-2.5-flash`) for question generation and pricing
- **SEC Edgar API** for company resolution and 10-K retrieval

## Setup

### Prerequisites

- Node.js 18+
- A [Google AI API key](https://aistudio.google.com/app/apikey) with access to Gemini

### Environment variables

Create a `.env` file in the project root:

```env
# Required: Google Gemini API key
GEMINI_API_KEY=your_key_here

# Required: Identifies your app to SEC Edgar (use your name and email)
SEC_USER_AGENT=Your Name your.email@example.com

# Optional: Override the Gemini model (defaults to gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash

# Optional: Use a different model for pricing only
GEMINI_PRICING_MODEL=gemini-2.5-flash
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

## Document upload limits

- Up to 6 files per session
- Maximum 20 MB total
- Supported formats: PDF, PNG, JPG, WebP, plain text

## Project structure

```
app/
  page.tsx                  # Main 7-step flow and state management
  api/
    tickers/                # SEC company ticker search
    question-plan/          # Streaming question generation (SSE)
    value-pricing/          # Final pricing calculation
components/
  Step*.tsx                 # One component per step
  ui/                       # Shared UI primitives
lib/
  sec.ts                    # SEC Edgar API client
  gemini.ts                 # Gemini API client and file handling
  question-plan.ts          # Analysis stage definitions
  value-pricing.ts          # Pricing logic and scaffolding
  retry.ts                  # Retry with exponential backoff
```

## API overview

| Endpoint | Method | Description |
|---|---|---|
| `/api/tickers` | GET | Returns SEC company ticker map for autocomplete |
| `/api/question-plan` | POST | Streams 7-stage analysis pipeline via SSE |
| `/api/value-pricing` | POST | Returns structured pricing recommendation |

The `/api/question-plan` endpoint streams real-time progress events as it resolves the company, loads the 10-K, converts documents, and calls Gemini. The client listens via `EventSource` and updates the UI at each stage.
