# Job Scraper → Webhook

Scrapes job listings from LinkedIn and Indeed, filters them (company size, words, industries, staffing agencies), and POSTs every row that survives to a webhook of your choice: Clay, Zapier, Make, n8n, Google Sheets, or your own endpoint.

The idea: a company posting jobs is a company that's growing. This tool turns that hiring signal into rows in whatever system you already work in.

---

## How it works

```
User submits search
        │
        ▼
  Apify actors ──────► scrape job listings (one run per title × job board)
        │
        ▼
  Rule filters ──────► company size bands, must-mention / excluded words,
        │              industries, excluded companies, seniority, employment type,
        │              staffing words in the company name / domain / industry
        ▼
  AI classifier ─────► GPT-4o-mini reads the company description
        │              Perplexity checks the website when there is no description
        │              agencies are removed or flagged, depending on the setting
        ▼
  Webhook ───────────► one POST per job listing, or one per company
                       retried on 429 / 5xx, progress shown in the UI
```

Everything after the form submit runs in the background. Apify calls back via webhook when a scrape finishes, so the user can close the tab and return later. The job ID in the URL brings them back to it, and the form page lists recent runs.

---

## Stack

**Backend** — Node.js, Express, MongoDB (Mongoose)
**Frontend** — React, Vite
**External services** — Apify, OpenAI, Perplexity
**Hosting** — one Render web service (the backend serves the built frontend), MongoDB Atlas

---

## Getting started

### Prerequisites

- Node.js 18 or newer
- A MongoDB database (Atlas free tier works)
- API keys for Apify, OpenAI and Perplexity
- [ngrok](https://ngrok.com) for local development — Apify's callback needs a public URL

### API keys

| Service    | Used for                                   | Where to get it                         |
| ---------- | ------------------------------------------ | --------------------------------------- |
| Apify      | Running the job scrapers                   | Console → Settings → API & Integrations |
| OpenAI     | Classifying companies with descriptions    | platform.openai.com → API keys          |
| Perplexity | Classifying companies without descriptions | Settings → API                          |

OpenAI and Perplexity are only called when "Staffing agencies" is set to *Remove agencies* or *Keep but flag*. The *Word screen only* and *Off* settings never call them.

### Backend

```bash
cd job-scraper-backend
npm install
```

Create `job-scraper-backend/.env` (see `.env.example`):

```env
PORT=5000
APP_ACCESS_KEY=long-random-password-for-the-ui
WEBHOOK_SECRET=long-random-secret-for-apify-callbacks
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/job-scraper

APIFY_TOKEN=apify_api_...
OPENAI_API_KEY=sk-...
PERPLEXITY_API_KEY=pplx-...

# Where Apify sends its callback. Local: your ngrok URL. Production: your
# Render URL. No trailing slash.
PUBLIC_BASE_URL=https://your-subdomain.ngrok-free.app
```

Start it:

```bash
npm run dev
```

Confirm it's alive at `http://localhost:5000/api/health`. On macOS, port 5000 is often taken by AirPlay; pick another `PORT` if so.

### Webhook tunnel

In a second terminal:

```bash
ngrok http 5000
```

Copy the `https://` URL into `PUBLIC_BASE_URL` and restart the backend.

> ngrok issues a new URL on every restart of the free plan. If runs get stuck at "Scraping job listings", a stale `PUBLIC_BASE_URL` is the first thing to check.

### Frontend

```bash
cd job-scraper-frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api` to `http://localhost:5000` (see `vite.config.js`). Change the proxy target if the backend runs on a different port.

### Production

`render.yaml` describes one web service. `npm run build` at the repo root installs both packages and builds the frontend into `job-scraper-frontend/dist`, which the backend serves. Set every variable from `.env.example` under the service's Environment tab.

---

## Using it

1. **What to search** — job titles (one search per title per board), location, job boards, listings per title, posted-within window.
2. **Company size** — pick LinkedIn-style bands. Nothing selected means any size. Optionally keep companies whose size is unknown.
3. **Filters** — how to handle staffing agencies, must-mention words, excluded words. *More filters* adds industries to keep or drop, companies to skip, seniority level, employment type, and a per-company cap.
4. **Where to send results** — the webhook URL (remembered in the browser) and whether to send one row per job listing or one per company. **Send test row** POSTs a sample record marked `isTest: true` so the receiver can set up its columns before spending anything.

The progress page shows each stage with counts, why listings were removed, the settings used, and lets you run again with the same settings.

### Webhook payload

One row per **job listing** (default):

```json
{
  "jobTitle": "Senior Software Engineer",
  "jobUrl": "https://www.linkedin.com/jobs/view/…",
  "applyUrl": "…",
  "jobLocation": "Austin, Texas, United States",
  "postedAt": "2026-09-18",
  "employmentType": "Full-time",
  "seniorityLevel": "Mid-Senior level",
  "jobFunction": "Engineering",
  "salary": "$140,000/yr - $180,000/yr",
  "applicants": "25 applicants",
  "jobPosterName": "…", "jobPosterTitle": "…", "jobPosterProfileUrl": "…",
  "jobDescription": "…",
  "platform": "linkedin",
  "searchKeyword": "software engineer",

  "companyName": "Example Co",
  "companyDomain": "example.com",
  "companyWebsite": "https://www.example.com/",
  "companyLinkedinUrl": "…",
  "companyIndustry": "Software Development",
  "companySize": "51-200 employees",
  "companyHeadquarters": "Austin, TX",
  "companyType": "Privately Held",
  "companyFounded": "2015",
  "companySpecialties": "…",
  "companyDescription": "…",
  "isStaffingAgency": false,
  "staffingAgencyReason": "gpt: Hires for its own product team",

  "runId": "…",
  "sentAt": "2026-09-20T10:32:21.117Z"
}
```

One row per **company** carries the same company fields plus `openRolesFound`, `firstJobTitle`, `firstJobUrl`, `firstJobLocation`, `firstJobPostedAt`, `allJobTitles` (pipe-separated) and a nested `jobs` array.

`isStaffingAgency` is `true`/`false` when the AI check ran, `false` after the word screen only, and `null` when agency checks are off.

Delivery runs four requests at a time, waits 15 s per request, and retries 429 / 5xx / network errors up to four times with backoff (honouring `Retry-After`). A run is marked failed only if **every** request was rejected; partial failures are reported with the last error.

---

## Project layout

```
job-scraper-backend/
├── index.js                        Express app, auth, static frontend, SPA fallback
├── src/config/db.js                MongoDB connection
├── src/constants/
│   ├── apifyConstants.js           Actor IDs, job statuses, posted-within mapping
│   ├── filterConstants.js          Size bands, staffing words, agency modes, removal reasons
│   ├── aiConstants.js              Model names, classifier prompt, batch sizes
│   └── deliveryConstants.js        Delivery modes, concurrency, retry policy
├── src/middleware/
│   ├── auth.js                     Access-key gate and Apify webhook secret
│   └── rateLimit.js                Brute-force guard for the password check
├── src/models/job.model.js         The Job document — inputs, results, delivery stats
├── src/routes/
│   ├── scrape.routes.js            POST /scrape, GET /job-status/:id, POST /test-webhook
│   └── webhook.routes.js           POST /apify-webhook
├── src/controllers/
│   ├── scrape.controller.js        Validates inputs, starts Apify runs, reports status
│   ├── webhook.controller.js       Apify callback + the whole pipeline
│   └── testWebhook.controller.js   Sends one sample row to a webhook
├── src/services/
│   ├── apify.service.js            Triggers actors, fetches results (paginated)
│   ├── filter.service.js           Rule filters and per-company cap
│   ├── ai.service.js               GPT and Perplexity calls
│   ├── classification.service.js   Batched agency classification
│   └── delivery.service.js         Payload shapes, retrying POSTs, worker pool
└── src/helpers/jobHelpers.js       Platform normalising, size parsing, word matching

job-scraper-frontend/src/
├── App.jsx                         View switching, polling, recent runs, rerun prefill
├── components/
│   ├── PasswordGate.jsx            Password prompt before anything loads
│   ├── SearchForm.jsx              The four-step form
│   ├── RunProgress.jsx             Stages, totals, removal reasons, settings, rerun
│   ├── RecentRuns.jsx              Last runs from this browser
│   ├── ChipGroup.jsx               Multi-select toggle buttons
│   └── TagInput.jsx                Multi-value input (Enter, comma, paste)
├── constants/
│   ├── searchConstants.js          Form defaults, options, hints
│   └── statusConstants.js          API URL, poll interval, stages, labels
└── helpers/
    ├── apiHelpers.js               Fetch wrappers
    ├── formatHelpers.js            Stage state, validation, elapsed time
    └── storageHelpers.js           localStorage: recent runs, remembered webhook
```

**Convention:** components hold state and handlers only. Reusable values live in `constants/`, pure functions in `helpers/`.

---

## Search options

| Option                    | What it does                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Job titles**            | Scrape terms. Each one runs as a separate search on every board selected.                            |
| **Location**              | City, region, or country. Free-form. Empty means anywhere.                                           |
| **Job boards**            | LinkedIn, Indeed, or both.                                                                           |
| **Listings per title**    | Cap per scrape. Titles × boards × this = the maximum listings fetched.                               |
| **Posted within**         | 24 h, 3 days, week, 2 weeks, month, or any time. Indeed's widest window is 14 days.                  |
| **Company size**          | LinkedIn bands. A company is kept when its reported band overlaps any selected band.                 |
| **Unknown size**          | Keep listings whose company has no size on the job board.                                            |
| **Staffing agencies**     | Remove (words + AI), word screen only, keep but flag, or off.                                        |
| **Must mention**          | Keep a listing only if the title and/or description contains one of these words.                     |
| **Exclude words**         | Drop a listing if the title and/or description contains any of these.                                |
| **Only / exclude industries** | Substring match on the company's industry labels.                                                |
| **Exclude companies**     | Company names (exact, case-insensitive) or domains.                                                  |
| **Seniority / employment type** | LinkedIn labels. Listings without a value are kept.                                            |
| **Max listings per company** | Also passed to the actors, then enforced again across all scrapes. 0 = no limit.                  |
| **Webhook URL**           | Where rows are POSTed. Remembered in the browser.                                                    |
| **Send**                  | One row per job listing, or one per company.                                                         |
