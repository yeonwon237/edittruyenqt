// Local SQLite entity layer for the desktop app's "Local" storage mode (see
// src/api/dataClient.js, which picks this or src/api/entities.js at
// runtime). Deliberately mirrors makeEntity()'s method surface in
// entities.js exactly — get/getMany/list/filter/filterNonEmpty/create/
// bulkCreate/bulkUpsert/update/delete/deleteMany, same argument shapes,
// same "-field" descending-sort convention — so call sites written against
// either one are interchangeable through dataClient.
//
// Schema: src-tauri/src/local_db.rs (SQLite mirror of the 4 core-editing
// Postgres tables — projects/chapters/glossary_terms/prompt_presets — see
// that file's header for the type-translation notes). No RLS/auth here;
// this is a single-user local file. No sync yet (later phase) — this file
// only implements local-only CRUD.
import Database from "@tauri-apps/plugin-sql";

const LOCAL_DB_URL = "sqlite:etq-local.db";
let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = Database.load(LOCAL_DB_URL);
  return dbPromise;
}

const nowIso = () => new Date().toISOString();

function applyOrderAndRange(rows, sort, limit, skip) {
  if (sort) {
    const desc = sort.startsWith("-");
    const field = desc ? sort.slice(1) : sort;
    rows = [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    });
  }
  if (limit != null) {
    const start = skip || 0;
    rows = rows.slice(start, start + limit);
  }
  return rows;
}

function makeLocalEntity(table, jsonFields = []) {
  const parseRow = (row) => {
    if (!row) return row;
    const out = { ...row };
    for (const field of jsonFields) {
      if (typeof out[field] === "string") {
        try {
          out[field] = JSON.parse(out[field]);
        } catch {
          // leave as-is if not valid JSON (shouldn't happen — we always write JSON)
        }
      }
    }
    return out;
  };

  const serializeValues = (values) => {
    const out = { ...values };
    for (const field of jsonFields) {
      if (field in out && typeof out[field] !== "string") out[field] = JSON.stringify(out[field] ?? null);
    }
    return out;
  };

  async function selectAll(where, params) {
    const db = await getDb();
    const rows = await db.select(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""}`, params || []);
    return rows.map(parseRow);
  }

  return {
    async get(id) {
      const rows = await selectAll("id = $1", [id]);
      return rows[0] || null;
    },

    async getMany(ids) {
      if (!Array.isArray(ids) || !ids.length) return [];
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
      return selectAll(`id IN (${placeholders})`, ids);
    },

    async list(sort, limit, skip) {
      const rows = await selectAll();
      return applyOrderAndRange(rows, sort, limit, skip);
    },

    async filter(match = {}, sort, limit, skip, fields) {
      const keys = Object.keys(match);
      const where = keys.length ? keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ") : "";
      const rows = await selectAll(where, keys.map((k) => match[k]));
      const ordered = applyOrderAndRange(rows, sort, limit, skip);
      if (!fields) return ordered;
      const projected = new Set(["id", ...fields]);
      return ordered.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => projected.has(k))));
    },

    async filterNonEmpty(match = {}, field, sort, limit, skip, fields) {
      const keys = Object.keys(match);
      const clauses = keys.map((k, i) => `${k} = $${i + 1}`);
      clauses.push(`${field} IS NOT NULL`, `${field} != ''`);
      const rows = await selectAll(clauses.join(" AND "), keys.map((k) => match[k]));
      const ordered = applyOrderAndRange(rows, sort, limit, skip);
      if (!fields) return ordered;
      const projected = new Set(["id", ...fields]);
      return ordered.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => projected.has(k))));
    },

    async create(values) {
      const db = await getDb();
      const id = values.id || crypto.randomUUID();
      const row = serializeValues({ ...values, id, created_date: values.created_date || nowIso(), updated_date: nowIso() });
      const cols = Object.keys(row);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
      await db.execute(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`, cols.map((c) => row[c]));
      return this.get(id);
    },

    async bulkCreate(rows) {
      const created = [];
      for (const values of rows) created.push(await this.create(values));
      return created;
    },

    async bulkUpsert(rows) {
      if (!rows?.length) return [];
      const db = await getDb();
      const updated = [];
      for (const values of rows) {
        const id = values.id || crypto.randomUUID();
        const row = serializeValues({ ...values, id, updated_date: nowIso() });
        const existing = await this.get(id);
        if (existing) {
          const cols = Object.keys(row).filter((c) => c !== "id");
          const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(",");
          await db.execute(`UPDATE ${table} SET ${setClause} WHERE id = $${cols.length + 1}`, [...cols.map((c) => row[c]), id]);
        } else {
          row.created_date = row.created_date || nowIso();
          const cols = Object.keys(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
          await db.execute(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`, cols.map((c) => row[c]));
        }
        updated.push(await this.get(id));
      }
      return updated;
    },

    async update(id, values, { returning = true } = {}) {
      const db = await getDb();
      const row = serializeValues({ ...values, updated_date: nowIso() });
      const cols = Object.keys(row);
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(",");
      await db.execute(`UPDATE ${table} SET ${setClause} WHERE id = $${cols.length + 1}`, [...cols.map((c) => row[c]), id]);
      return returning ? this.get(id) : undefined;
    },

    async delete(id) {
      const db = await getDb();
      await db.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
    },

    async deleteMany(ids) {
      if (!Array.isArray(ids) || !ids.length) return;
      const db = await getDb();
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
      await db.execute(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
    },
  };
}

export const LocalProject = makeLocalEntity("projects", [
  "custom_field_definitions", "batch_rules", "pronoun_rules", "contextual_pronoun_rules", "visible_columns", "style_toggles",
]);
export const LocalChapter = makeLocalEntity("chapters");
export const LocalGlossaryTerm = makeLocalEntity("glossary_terms", ["custom_fields"]);
export const LocalPromptPreset = makeLocalEntity("prompt_presets", ["genres", "character_notes", "forbidden_words"]);
