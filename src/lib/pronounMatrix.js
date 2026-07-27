// Build the AI System Instruction block for contextual pronoun rules.
// Each rule describes Speaker → Listener mapping of self/target addressing words.
// listener === "" or "*" represents the DEFAULT rule (applies to everyone).

export function isDefaultRule(rule) {
  return !rule?.listener || rule.listener.trim() === "" || rule.listener.trim() === "*";
}

// Validate that a rule has all mandatory fields (skip blank, obviously incomplete rows).
function ruleIsValid(rule) {
  return (
    rule &&
    typeof rule.speaker === "string" && rule.speaker.trim() &&
    typeof rule.self_word === "string" && rule.self_word.trim() &&
    typeof rule.target_word === "string" && rule.target_word.trim() &&
    // listener can be blank for default rules
    true
  );
}

// Group rules by speaker for readability and to help the AI understand defaults vs overrides.
export function buildPronounMatrixPrompt(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return "";
  const valid = rules.filter(ruleIsValid);
  if (valid.length === 0) return "";

  // Group defaults (listener === "*") and specific (per-listener) rules by speaker.
  const bySpeaker = {};
  valid.forEach((r) => {
    const name = r.speaker.trim();
    if (!bySpeaker[name]) bySpeaker[name] = { defaults: [], specifics: [] };
    const lineInfo = {
      self: r.self_word.trim(),
      target: r.target_word.trim(),
      note: (r.note || "").trim(),
      listener: r.listener && r.listener.trim() !== "*" ? r.listener.trim() : ""
    };
    if (isDefaultRule(r)) {
      bySpeaker[name].defaults.push(lineInfo);
    } else {
      lineInfo.listener = r.listener.trim();
      bySpeaker[name].specifics.push(lineInfo);
    }
  });

  const blocks = [];
  Object.keys(bySpeaker)
    .sort((a, b) => a.localeCompare(b, "vi"))
    .forEach((name) => {
      const { defaults, specifics } = bySpeaker[name];
      const lines = [];
      lines.push(`◆ NHÂN VẬT "${name}":`);
      if (defaults.length) {
        defaults.forEach((d) => {
          lines.push(
            `   • Mặc định (khi nói với TẤT CẢ MỌI NGƯỜI): xưng "${d.self}" — gọi đối phương "${d.target}"${d.note ? ` (ghi chú: ${d.note})` : ""}`
          );
        });
      }
      if (specifics.length) {
        specifics.forEach((s) => {
          lines.push(
            `   • Riêng khi nói với "${s.listener}": xưng "${s.self}" — gọi "${s.target}"${s.note ? ` (ghi chú: ${s.note})` : ""}`
          );
        });
      }
      blocks.push(lines.join("\n"));
    });

  return blocks.join("\n\n");
}

// A short human-readable summary used in the dialog list view.
export function ruleSummary(rule) {
  if (!rule) return "";
  const self = rule.self_word?.trim() || "?";
  const target = rule.target_word?.trim() || "?";
  const who = isDefaultRule(rule) ? "mọi người" : rule.listener.trim();
  return `${rule.speaker?.trim()} → ${who}: xưng "${self}" — gọi "${target}"`;
}