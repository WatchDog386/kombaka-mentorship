// Settings for the frontend.

// The system's name, shown beside the logo and wherever no school is set up yet.
// Mwangaza is Swahili for light, like the gold arc rising behind the book in the logo.
export const APP_NAME = 'Mwangaza';
export const APP_FULL_NAME = 'Mwangaza School Manager';

// Where the API lives.
// Empty means "the same address this page was loaded from", which is the
// case when Flask serves the frontend (python run.py).
// If you serve the frontend from another address (for example VS Code Live
// Server), set this to 'http://localhost:5000' and add that address to
// CORS_ORIGINS in backend/.env.
export const API_BASE = '';

// How often open pages fetch fresh records, in seconds.
export const REFRESH_SECONDS = 30;
