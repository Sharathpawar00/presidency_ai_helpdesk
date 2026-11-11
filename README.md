# AI-Powered University Campus Helpdesk

A responsive, single-page campus helpdesk for Presidency University. It answers student questions using only the facts in `knowledge.json`, with a local keyword fallback when Gemini is unavailable.

## Features

- Express server with one JSON endpoint: `POST /api/ask`
- Vanilla HTML, CSS, and JavaScript frontend with no build step
- Grounded answers, category/source labels, suggested follow-ups, and escalation drafts
- Offline fallback with a visible Offline mode badge
- Input validation, JSON parsing safeguards, request timeout, friendly errors, and responsive accessible UI
- API credentials remain on the server

## AI integration

The server calls the Google Gemini REST API using the configurable `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_API_KEY` environment variables. The prompt supplies only the knowledge-base facts, requires answers to stay grounded, asks the model to match the student's language (English, Hindi, Kannada, or Hinglish), and requests strict JSON with the answer, category, grounding status, exact source fact, follow-ups, and (when ungrounded) an escalation draft. The server strips code fences and safely parses and validates the response. If the request fails, it uses a keyword matcher over `knowledge.json` and labels the response `mode: offline`.

## Setup

Requires Node.js 18 or newer.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Add your Gemini API key to `LLM_API_KEY` in `.env`.
4. Start the app: `npm start`
5. Open `http://localhost:3001`.

`LLM_PROVIDER` defaults to `gemini`; `LLM_MODEL` defaults to `gemini-1.5-flash`. Change these in `.env` as needed. Never put the key in `public/` or commit `.env`.

## Test queries

1. **“Whom should I contact for academic problems?”** — grounded answer pointing to the faculty advisor; category Academics and exact source sentence.
2. **“Where can I find the examination timetable?”** — grounded answer pointing to official university channels; category Examinations and exact source sentence.
3. **“Whom should I contact for placement training?”** — grounded answer pointing to the Placement Department; category Placements and exact source sentence.
4. **“How can I raise a hostel complaint?”** — grounded answer pointing to the Hostel Administration; category Hostel and exact source sentence.
5. **“What is the exact date of my next examination?”** — says the exact date is not available in the supplied information, offers a polite escalation draft, and does not invent a date.

When Gemini is not configured or unavailable, responses use the local keyword fallback and show the Offline mode badge. The server defaults to port `3001`; set `PORT` in `.env` to override it.

## Screenshots

The `screenshots/` folder is reserved for screenshots captured during a demo; screenshots are not included yet.

## Disclosure

AI tools were used to assist development.
