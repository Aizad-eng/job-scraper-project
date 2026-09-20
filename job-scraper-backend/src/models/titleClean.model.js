import mongoose from 'mongoose';

// Raw job title -> email-ready title, so the same title is cleaned once.
const titleCleanSchema = new mongoose.Schema(
    {
        rawKey: { type: String, required: true, unique: true, index: true },
        raw: { type: String, default: null },
        clean: { type: String, default: null },
        source: { type: String, default: null },   // 'rules' | 'claude'
        createdAt: { type: Date, default: Date.now, expires: 365 * 24 * 60 * 60 },
    }
);

export default mongoose.model('TitleClean', titleCleanSchema);
