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

A search can also be saved as a **schedule**: every day, every N days, or chosen weekdays at a set time in the user's timezone. Scheduled runs skip listings the schedule already sent, so the webhook only receives new ones.

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
5. **Repeat** — *Run once now*, or *Run on a schedule*: a name, how often (every day / every N days / chosen weekdays), the time of day, and whether to skip listings already sent. The timezone is taken from the browser.

The progress page shows each stage with counts, why listings were removed, the settings used, and lets you run again with the same settings.

### Schedules

The **Schedules** tab lists every saved schedule with its next run, last run, and past runs. From there you can **Run now**, **Pause** / **Resume**, **Edit** (same form, pre-filled), **Delete**, or **Forget sent listings** so the next run sends everything again.

How it runs: the backend checks every 30 seconds for schedules whose next run time has passed and starts them one at a time. If the server was down at the scheduled time, the run starts as soon as it is back. Each schedule remembers the job URLs (or company domains, in company mode) it has delivered for 120 days; a scheduled run drops those before sending and reports them as *Already sent by this schedule*.

Render's free tier sleeps idle services, which would stall the scheduler. Use a paid instance type (the `starter` plan in `render.yaml`) or an external ping to keep it awake.

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
  "scheduleId": "… or null",
  "sentAt": "2026-09-20T10:32:21.117Z"
}
```

One row per **company** carries the same company fields plus `openRolesFound`, `firstJobTitle`, `firstJobUrl`, `firstJobLocation`, `firstJobPostedAt`, `allJobTitles` (pipe-separated) and a nested `jobs` array.

`isStaffingAgency` is `true`/`false` when the AI check ran, `false` after the word screen only, and `null` when agency checks are off.

Delivery is capped at 5 requests per second (Clay's webhook limit), waits 15 s per request, and retries 429 / 5xx / network errors up to four times with backoff (honouring `Retry-After`). A run is marked failed only if **every** request was rejected; partial failures are reported with the last error.

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
│   ├── deliveryConstants.js        Delivery modes, rate limit, retry policy
│   └── scheduleConstants.js        Frequencies, tick interval, sent-listing retention
├── src/middleware/
│   ├── auth.js                     Access-key gate and Apify webhook secret
│   └── rateLimit.js                Brute-force guard for the password check
├── src/models/
│   ├── job.model.js                The Job document — inputs, results, delivery stats
│   ├── schedule.model.js           A saved search with its timing and last-run info
│   └── deliveredListing.model.js   What each schedule has already sent (TTL 120 days)
├── src/routes/
│   ├── scrape.routes.js            POST /scrape, GET /job-status/:id, POST /test-webhook
│   ├── schedule.routes.js          CRUD, run now, reset sent
│   └── webhook.routes.js           POST /apify-webhook
├── src/controllers/
│   ├── scrape.controller.js        Starts a one-off search, reports status
│   ├── schedule.controller.js      Schedule CRUD and actions
│   ├── webhook.controller.js       Apify callback + the whole pipeline
│   └── testWebhook.controller.js   Sends one sample row to a webhook
├── src/services/
│   ├── search.service.js           Input validation + launching Apify runs (shared)
│   ├── scheduler.service.js        30-second tick that starts due schedules
│   ├── apify.service.js            Triggers actors, fetches results (paginated)
│   ├── filter.service.js           Rule filters and per-company cap
│   ├── ai.service.js               GPT and Perplexity calls
│   ├── classification.service.js   Batched agency classification
│   └── delivery.service.js         Payload shapes, rate-limited retrying POSTs
└── src/helpers/
    ├── jobHelpers.js               Platform normalising, size parsing, word matching
    └── scheduleHelpers.js          Timezone math, next-run calculation

job-scraper-frontend/src/
├── App.jsx                         Routing (search / run / schedules), polling, prefill
├── components/
│   ├── PasswordGate.jsx            Password prompt before anything loads
│   ├── SearchForm.jsx              The five-step form (also edits schedules)
│   ├── ScheduleFields.jsx          Step 5: frequency, days, time, skip-sent
│   ├── Schedules.jsx               Schedules tab: list, run now, pause, edit, delete
│   ├── RunProgress.jsx             Stages, totals, removal reasons, settings, rerun
│   ├── RecentRuns.jsx              Last runs from this browser
│   ├── ChipGroup.jsx               Multi-select toggle buttons
│   └── TagInput.jsx                Multi-value input (Enter, comma, paste)
├── constants/
│   ├── searchConstants.js          Form defaults, options, hints
│   ├── scheduleConstants.js        Repeat / frequency / weekday options
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
