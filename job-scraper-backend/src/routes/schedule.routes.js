import express from 'express';
import {
    listSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runScheduleNow,
    resetDelivered,
    bulkUpdateSchedules,
} from '../controllers/schedule.controller.js';
import { requireAccessKey } from '../middleware/auth.js';

const router = express.Router();

router.get('/schedules', requireAccessKey, listSchedules);
router.post('/schedules', requireAccessKey, createSchedule);
// must come before /schedules/:scheduleId so "bulk" is not taken as an id
router.post('/schedules/bulk', requireAccessKey, bulkUpdateSchedules);
router.patch('/schedules/:scheduleId', requireAccessKey, updateSchedule);
router.delete('/schedules/:scheduleId', requireAccessKey, deleteSchedule);
router.post('/schedules/:scheduleId/run', requireAccessKey, runScheduleNow);
router.post('/schedules/:scheduleId/reset-sent', requireAccessKey, resetDelivered);

export default router;
