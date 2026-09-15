// Local SQLite schema for the desktop app's "Local" storage mode (see
// src/api/localEntities.js — the JS side that actually queries this via
// tauri-plugin-sql). Mirrors the 4 core-editing-flow tables from
// supabase/schema.sql (projects, chapters, glossary_terms, prompt_presets)
// column-for-column, translated to SQLite types:
//   uuid          -> TEXT (generated client-side with crypto.randomUUID())
//   jsonb         -> TEXT (JSON.stringify/parse at the JS boundary)
//   timestamptz   -> TEXT (ISO-8601, written by the JS boundary)
//   double precision -> REAL
// No RLS/user_id enforcement — this is a single-user local file, unlike the
// multi-tenant Postgres database. `user_id` is kept as a plain TEXT column
// (not a FK) purely so the sync engine (later phase, not built yet) can
// still match rows to the signed-in Supabase account when it starts pushing
// to Cloud.
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create core editing-flow tables",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                source_language TEXT NOT NULL DEFAULT 'Trung',
                cover_emoji TEXT NOT NULL DEFAULT '📚',
                custom_field_definitions TEXT NOT NULL DEFAULT '[]',
                batch_rules TEXT NOT NULL DEFAULT '[]',
                pronoun_rules TEXT NOT NULL DEFAULT '[]',
                contextual_pronoun_rules TEXT NOT NULL DEFAULT '[]',
                visible_columns TEXT NOT NULL DEFAULT '["raw","qt","edited"]',
                active_preset_id TEXT NOT NULL DEFAULT '',
                style_toggles TEXT NOT NULL DEFAULT '{}',
                created_date TEXT NOT NULL,
                updated_date TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chapters (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                chapter_order REAL NOT NULL DEFAULT 0,
                raw_original TEXT NOT NULL DEFAULT '',
                qt_raw TEXT NOT NULL DEFAULT '',
                edited TEXT NOT NULL DEFAULT '',
                created_date TEXT NOT NULL,
                updated_date TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chapters_project_order ON chapters(project_id, chapter_order);

            CREATE TABLE IF NOT EXISTS glossary_terms (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                source_term TEXT NOT NULL,
                translation TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Khác',
                notes TEXT NOT NULL DEFAULT '',
                custom_fields TEXT NOT NULL DEFAULT '{}',
                created_date TEXT NOT NULL,
                updated_date TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_glossary_terms_project_id ON glossary_terms(project_id);

            CREATE TABLE IF NOT EXISTS prompt_presets (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                genres TEXT NOT NULL DEFAULT '[]',
                setting_era TEXT NOT NULL DEFAULT '',
                character_notes TEXT NOT NULL DEFAULT '[]',
                prompt_instructions TEXT NOT NULL,
                forbidden_words TEXT NOT NULL DEFAULT '[]',
                created_date TEXT NOT NULL,
                updated_date TEXT NOT NULL
            );
        "#,
    }]
}
