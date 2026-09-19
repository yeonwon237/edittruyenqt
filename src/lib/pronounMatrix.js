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
      if (defaults.length && specifics.length) {
        lines.push("   ! ƯU TIÊN quy tắc người nghe CỤ THỂ; chỉ dùng MẶC ĐỊNH khi không khớp người cụ thể nào.");
      }
      if (defaults.length) {
        defaults.forEach((d) => {
          lines.push(
            `   • Mặc định (khi nói với MỌI NGƯỜI KHÁC không có quy tắc riêng): xưng "${d.self}" — gọi đối phương "${d.target}"${d.note ? ` (ghi chú: ${d.note})` : ""}`
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

// Build the "Ngôi Lời Dẫn" block: per-character third-person pronoun used
// in narration (outside direct dialogue), from project.style_toggles
// .story_memory.narrativeRules. Kept separate from buildPronounMatrixPrompt
// (dialogue self/target words) since it's a different axis of xưng hô —
// concatenate both into the {{PRONOUN_MATRIX}} slot at the call site.
export function buildNarrativeRulesPrompt(rules) {
  const valid = (Array.isArray(rules) ? rules : []).filter(
    (r) => r && typeof r.character === "string" && r.character.trim() && typeof r.pronoun === "string" && r.pronoun.trim()
  );
  if (!valid.length) return "";
  const lines = valid.map(
    (r) => `   • "${r.character.trim()}": gọi là "${r.pronoun.trim()}"${r.note?.trim() ? ` (ghi chú: ${r.note.trim()})` : ""}`
  );
  return `NGÔI LỜI DẪN (đại từ ngôi thứ ba dùng trong câu văn tường thuật/dẫn truyện, NGOÀI lời thoại trực tiếp — PHẢI dùng đúng và nhất quán cho từng nhân vật xuyên suốt, không đổi giữa các đoạn):\n${lines.join("\n")}`;
}

// A short human-readable summary used in the dialog list view.
export function ruleSummary(rule) {
  if (!rule) return "";
  const self = rule.self_word?.trim() || "?";
  const target = rule.target_word?.trim() || "?";
  const who = isDefaultRule(rule) ? "mọi người khác (mặc định)" : rule.listener.trim();
  return `${rule.speaker?.trim()} → ${who}: xưng "${self}" — gọi "${target}"`;
}
