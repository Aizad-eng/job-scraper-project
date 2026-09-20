import express from 'express';
import {
    listSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runScheduleNow,
    resetDelivered,
} from '../controllers/schedule.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

router.get('/schedules', requireAccessKey, listSchedules);
router.post('/schedules', requireAccessKey, createSchedule);
router.patch('/schedules/:scheduleId', requireAccessKey, updateSchedule);
router.delete('/schedules/:scheduleId', requireAccessKey, deleteSchedule);
router.post('/schedules/:scheduleId/run', requireAccessKey, runScheduleNow);
router.post('/schedules/:scheduleId/reset-sent', requireAccessKey, resetDelivered);

export default router;
