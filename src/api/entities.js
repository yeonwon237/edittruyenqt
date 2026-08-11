import { supabase } from '@/api/supabaseClient';

// Thin adapter over supabase-js matching the shape the app already calls
// (get/list/filter/create/update/delete/bulkCreate), so callers written
// against the old Base44 SDK need only swap the import, not their logic.
// Sort strings follow the existing "-field" (desc) / "field" (asc) convention.
function makeEntity(table) {
  const applyOrder = (query, sort) => {
    if (!sort) return query;
    const desc = sort.startsWith('-');
    return query.order(desc ? sort.slice(1) : sort, { ascending: !desc });
  };

  const applyRange = (query, limit, skip) => {
    if (limit == null) return query;
    const from = skip || 0;
    return query.range(from, from + limit - 1);
  };

  return {
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async getMany(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const { data, error } = await supabase.from(table).select('*').in('id', ids);
      if (error) throw error;
      return data;
    },

    async list(sort, limit, skip) {
      let query = supabase.from(table).select('*');
      query = applyOrder(query, sort);
      query = applyRange(query, limit, skip);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async filter(match = {}, sort, limit, skip, fields) {
      // Callers rely on `.id` being present even on a trimmed fields
      // projection (mirrors the old Base44 SDK's behavior), so make sure it's
      // always selected.
      const select = fields ? [...new Set(['id', ...fields])].join(',') : '*';
      let query = supabase.from(table).select(select);
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }
      query = applyOrder(query, sort);
      query = applyRange(query, limit, skip);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async filterNonEmpty(match = {}, field, sort, limit, skip, fields) {
      const select = fields ? [...new Set(['id', ...fields])].join(',') : '*';
      let query = supabase.from(table).select(select);
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }
      query = query.not(field, 'is', null).neq(field, '');
      query = applyOrder(query, sort);
      query = applyRange(query, limit, skip);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw error;
      return data;
    },

    async bulkCreate(rows) {
      const { data, error } = await supabase.from(table).insert(rows).select();
      if (error) throw error;
      return data;
    },

    async bulkUpsert(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'id' }).select();
      if (error) throw error;
      return data;
    },

    async update(id, values, { returning = true } = {}) {
      let query = supabase.from(table).update(values).eq('id', id);
      if (returning) query = query.select().single();
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },

    async deleteMany(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
    },
  };
}

export const Project = makeEntity('projects');
export const Chapter = makeEntity('chapters');
export const GlossaryTerm = makeEntity('glossary_terms');
export const PromptPreset = makeEntity('prompt_presets');
