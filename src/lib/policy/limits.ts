// Keep MAX_FILE_BYTES below Next.js's 10 MB proxy body buffer, which silently truncates larger bodies.
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PAGES = 80;
export const MAX_OCR_PAGES = 30;
export const OCR_PAGES_PER_STEP = 3;
export const MAX_PAGE_CHARS = 40_000;
export const MIN_TEXT_CHARS_PER_PAGE = 40;

export const MAX_URL_LENGTH = 2048;
export const MAX_URL_REDIRECTS = 3;
export const URL_FETCH_TIMEOUT_MS = 20_000;

export const MAX_COMPARE_DOCUMENTS = 4;
export const MAX_QUESTION_CHARS = 600;

// Original files are temporary working copies; see docs/policy-retention.md.
export const TEMP_FILE_TTL_HOURS = 24;
export const STUCK_PROCESSING_HOURS = 24;

export const POLICY_BUCKET = "policy-documents";
