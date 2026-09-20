import mongoose from 'mongoose';
import { DELIVERED_TTL_DAYS } from '../constants/scheduleConstants.js';

// One row per listing (or company) a schedule has already sent, so the next
// run of that schedule can skip it.
const deliveredListingSchema = new mongoose.Schema({
    scheduleId: { type: String, required: true },
    key: { type: String, required: true },
    jobId: { type: String, default: null },
    sentAt: { type: Date, default: Date.now, expires: DELIVERED_TTL_DAYS * 24 * 60 * 60 },
});

deliveredListingSchema.index({ scheduleId: 1, key: 1 }, { unique: true });

export default mongoose.model('DeliveredListing', deliveredListingSchema);
