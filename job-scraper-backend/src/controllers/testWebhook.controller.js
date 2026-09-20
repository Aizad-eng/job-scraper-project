import { buildSamplePayload, postOnce } from '../services/delivery.service.js';
import { isValidWebhookUrl } from '../services/search.service.js';
import { DELIVERY_MODE, DEFAULT_DELIVERY_MODE } from '../constants/deliveryConstants.js';

// Sends ONE sample record so the receiver (Clay, Sheets, Zapier…) can build
// its columns before a real run. Costs nothing.
export const testWebhook = async (req, res) => {
    const { webhookUrl, deliveryMode } = req.body || {};

    if (!isValidWebhookUrl(webhookUrl)) {
        return res.status(400).json({ success: false, error: 'Enter a valid webhook URL (must start with https://).' });
    }

    const mode = Object.values(DELIVERY_MODE).includes(deliveryMode) ? deliveryMode : DEFAULT_DELIVERY_MODE;
    const payload = buildSamplePayload(mode, { runId: 'test', sentAt: new Date().toISOString() });

    try {
        const response = await postOnce(webhookUrl, payload);
        res.json({ success: true, statusCode: response.status, payload });
    } catch (error) {
        const statusCode = error.response?.status ?? null;
        res.status(200).json({
            success: false,
            statusCode,
            error: statusCode
                ? `Webhook answered HTTP ${statusCode}.`
                : `Could not reach the webhook: ${error.message}`,
            payload,
        });
    }
};
