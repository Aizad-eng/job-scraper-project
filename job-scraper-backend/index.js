import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import connectDB from './src/config/db.js';

// Importing Routes
import scrapeRoutes from './src/routes/scrape.routes.js';
import webhookRoutes from './src/routes/webhook.routes.js';
import { requireAccessKey } from './src/middleware/auth.js';
import { loginRateLimit } from './src/middleware/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Render sits behind a proxy; without this every request looks like one IP.
app.set('trust proxy', 1);

connectDB();

app.use(express.json({ limit: '50mb' }));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// Open, so Render's health check keeps working. Reveals nothing.
app.get('/api/health', (req, res) => {
    res.json({ status: 'Backend Running' });
});

// The frontend calls this once to check a typed password before storing it.
// Costs nothing and starts no jobs — it only answers yes or no.
app.post('/api/login', loginRateLimit, requireAccessKey, (req, res) => {
    res.json({ success: true });
});

app.use('/api', scrapeRoutes);
app.use('/api', webhookRoutes);

// ---------------------------------------------------------------------------
// Frontend — the built React app is served by this same process, so the whole
// thing is ONE Render service and there is no cross-origin request at all.
// ---------------------------------------------------------------------------
const clientDist = path.resolve(__dirname, '../job-scraper-frontend/dist');

app.use(express.static(clientDist));

// SPA fallback: anything that isn't an API route returns index.html.
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
