import express from 'express';
import { listCompanies, companyStats, setOverride, allowAgain } from '../controllers/company.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

router.get('/companies', requireAccessKey, listCompanies);
router.get('/companies/stats', requireAccessKey, companyStats);
router.patch('/companies/:key/override', requireAccessKey, setOverride);
router.post('/companies/:key/allow-again', requireAccessKey, allowAgain);

export default router;
