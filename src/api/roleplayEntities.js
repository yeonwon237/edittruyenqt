import { supabase } from "@/api/supabaseClient";

// Roleplay Studio authoring data (in-progress generation runs, cached
// analyses, finished/draft scenario packs) lives in Supabase like every
// other entity in this app — an unfinished draft has to survive a browser
// clear or a device switch. This is deliberately separate from the
// player-facing save/resume progress in src/lib/roleplay/progress.js, which
// stays in localStorage on purpose: that's the READER's own play-through
// state on their own device, no account involved, exactly the "portable, no
// backend" case the feature was originally meant for.
function entity(table) {
  return {
    async get(id) {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async list(projectId) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("project_id", projectId)
        .order("updated_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

export const RoleplayAnalysis = {
  ...entity("roleplay_analyses"),
  async findCached(projectId, sourceHash, loreRulesHash, analyzerVersion = "context-v1") {
    const { data, error } = await supabase
      .from("roleplay_analyses")
      .select("*")
      .eq("project_id", projectId)
      .eq("source_hash", sourceHash)
      .eq("lore_rules_hash", loreRulesHash)
      .eq("analyzer_version", analyzerVersion)
      .eq("status", "ready")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

export const RoleplayScenario = entity("roleplay_scenarios");
export const RoleplayGenerationRun = entity("roleplay_generation_runs");
