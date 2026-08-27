// Synthetic session used only by tests/sync-preview.js's Vite alias.
export const supabase = { auth: { async getSession() { return { data: { session: { access_token: 'synthetic-editor-ui-session' } } }; } } };
