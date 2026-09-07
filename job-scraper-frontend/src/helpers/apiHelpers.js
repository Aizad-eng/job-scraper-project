import { API_BASE_URL } from '../constants/statusConstants.js';

const STORAGE_KEY = 'jobScraperAccessKey';

export const getAccessKey = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

export const setAccessKey = (key) => {
    try {
        localStorage.setItem(STORAGE_KEY, key);
    } catch {
        /* private browsing — the key just won't be remembered */
    }
};

export const clearAccessKey = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* nothing to do */
    }
};

const request = async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-access-key': getAccessKey(),
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        // Password changed on the server, or it was wrong. Force a re-prompt.
        clearAccessKey();
        window.location.reload();
        throw new Error('Session expired. Please enter the password again.');
    }

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
};

// Checks a password without starting any work. Returns true/false.
export const verifyAccessKey = async (key) => {
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': key },
    });
    return response.ok;
};

export const startScrape = (payload) =>
    request('/scrape', { method: 'POST', body: JSON.stringify(payload) });

export const fetchJobStatus = (jobId) => request(`/job-status/${jobId}`);

// A download is a plain link, so it can't send a header — the key rides
// along in the query string instead.
export const buildDownloadUrl = (jobId, format) =>
    `${API_BASE_URL}/download/${jobId}?format=${format}&key=${encodeURIComponent(getAccessKey())}`;
