const LOCAL_PREFIX = "etq-roleplay-v1:";

function readLocal(table) {
  try { return JSON.parse(localStorage.getItem(`${LOCAL_PREFIX}${table}`) || "[]"); }
  catch { return []; }
}

function writeLocal(table, rows) {
  localStorage.setItem(`${LOCAL_PREFIX}${table}`, JSON.stringify(rows));
}

function localCreate(table, values) {
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), created_date: now, updated_date: now, ...values };
  writeLocal(table, [row, ...readLocal(table)]);
  return row;
}

function entity(table) {
  return {
    async get(id) {
      return readLocal(table).find((row) => row.id === id) || null;
    },
    async list(projectId) {
      return readLocal(table).filter((row) => row.project_id === projectId).sort((a, b) => String(b.updated_date).localeCompare(String(a.updated_date)));
    },
    async create(values) {
      return localCreate(table, values);
    },
    async update(id, values) {
      let updated = null;
      const rows = readLocal(table).map((row) => {
        if (row.id !== id) return row;
        updated = { ...row, ...values, updated_date: new Date().toISOString() };
        return updated;
      });
      writeLocal(table, rows);
      return updated;
    },
    async delete(id) {
      writeLocal(table, readLocal(table).filter((row) => row.id !== id));
    },
  };
}

export const RoleplayAnalysis = {
  ...entity("roleplay_analyses"),
  async findCached(projectId, sourceHash, loreRulesHash, analyzerVersion = "context-v1") {
    return readLocal("roleplay_analyses").find((row) => row.project_id === projectId && row.source_hash === sourceHash && row.lore_rules_hash === loreRulesHash && row.analyzer_version === analyzerVersion && row.status === "ready") || null;
  },
};

export const RoleplayScenario = entity("roleplay_scenarios");
export const RoleplayGenerationRun = entity("roleplay_generation_runs");
