import express from 'express';
import { listCompanies, companyStats, setOverride } from '../controllers/company.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

router.get('/companies', requireAccessKey, listCompanies);
router.get('/companies/stats', requireAccessKey, companyStats);
router.patch('/companies/:key/override', requireAccessKey, setOverride);

export default router;
