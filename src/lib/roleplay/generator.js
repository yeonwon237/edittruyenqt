import { Chapter, GlossaryTerm } from "@/api/entities";
import { RoleplayAnalysis, RoleplayGenerationRun, RoleplayScenario } from "@/api/roleplayEntities";
import { callLLM, getModel, getProvider } from "@/lib/llm";
import { validateRoleplayPack, simulateRoleplay } from "./validator";

const PROMPT_VERSIONS = { context: "context-v2-drama", blueprint: "blueprint-v3-branching", scenes: "scenes-v4-split" };

// scene_04 and scene_07 are fixed branch points: the model supplies a distinct
// `next` per choice there (05a/05b, 08a/08b). Every other scene has exactly
// one correct successor, used as a fallback when the model omits/mistypes `next`.
const FALLBACK_NEXT = {
  scene_01: "scene_02", scene_02: "scene_03", scene_03: "scene_04",
  scene_05a: "scene_06", scene_05b: "scene_06",
  scene_06: "scene_07",
  scene_08a: "scene_09", scene_08b: "scene_09",
  scene_09: "scene_10",
  scene_10: null,
};

// --- Draft repair -----------------------------------------------------
// LLMs reliably follow the *content* instructions but sometimes slip on
// exact JSON shape (e.g. writing `effects` as a lone object instead of a
// 1-item array, or using "good"/"bad" instead of the HE/BE enum). Rather
// than let one shape slip mark the whole generation "draft" (and the
// scene text/logic get thrown away), repair the handful of safe, easy to
// disambiguate shape mistakes here before validation runs. Anything not
// safely repairable (e.g. a malformed `requires`/`completeWhen` string
// expression) is either dropped (if optional) or replaced with an
// always-true fallback (if required by the schema) rather than guessed at.
const CONDITION_OPS = new Set(["stat_gt", "stat_gte", "stat_lt", "stat_lte", "stat_eq", "relationship_gt", "relationship_gte", "relationship_lt", "relationship_lte", "relationship_eq", "flag_present", "flag_absent", "item_present", "item_absent", "mission_unlocked", "mission_completed"]);
const EFFECT_OPS = new Set(["add_stat", "set_stat", "add_relationship", "set_relationship", "set_flag", "unset_flag", "add_item", "remove_item"]);
const ENDING_TYPES = new Set(["HE", "NE", "BE", "SPECIAL", "HIDDEN"]);
const ENDING_TYPE_SYNONYMS = { good: "HE", happy: "HE", win: "HE", success: "HE", bad: "BE", death: "BE", fail: "BE", failure: "BE", neutral: "NE", normal: "NE", ok: "NE" };

function isValidCondition(value, depth = 0) {
  if (depth > 5 || !value || typeof value !== "object") return false;
  if (Array.isArray(value.all)) return value.all.length > 0 && value.all.every((item) => isValidCondition(item, depth + 1));
  if (Array.isArray(value.any)) return value.any.length > 0 && value.any.every((item) => isValidCondition(item, depth + 1));
  if (value.not !== undefined) return isValidCondition(value.not, depth + 1);
  return typeof value.op === "string" && CONDITION_OPS.has(value.op) && typeof value.key === "string" && value.key.length > 0;
}

function isValidEffect(value) {
  return Boolean(value) && typeof value === "object" && typeof value.op === "string" && EFFECT_OPS.has(value.op) && typeof value.key === "string" && value.key.length > 0;
}

function normalizeEffects(effects) {
  const arr = Array.isArray(effects) ? effects : (effects && typeof effects === "object" ? [effects] : []);
  // "value" is optional in the schema (irrelevant for set_flag/unset_flag/
  // add_item/remove_item) — the model sometimes still sends a non-numeric
  // placeholder like `value: true` out of habit; drop it rather than reject
  // the whole effect, since every op tolerates a missing value.
  return arr.filter(isValidEffect).map((effect) => (typeof effect.value === "number" ? effect : { op: effect.op, key: effect.key }));
}

function fallbackCondition(stateSchema) {
  const [key, rule] = Object.entries(stateSchema?.stats || {})[0] || ["survival", { min: 0 }];
  return { op: "stat_gte", key, value: rule.min };
}

function normalizeCondition(value, stateSchema, required) {
  if (isValidCondition(value)) return value;
  return required ? fallbackCondition(stateSchema) : undefined;
}

function normalizeMission(mission, stateSchema) {
  if (!mission || typeof mission !== "object") return mission;
  return {
    ...mission,
    completeWhen: normalizeCondition(mission.completeWhen, stateSchema, true),
    failWhen: normalizeCondition(mission.failWhen, stateSchema, false),
    unlockWhen: normalizeCondition(mission.unlockWhen, stateSchema, false),
    failurePenalty: normalizeEffects(mission.failurePenalty),
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}

// Occasionally a scene or choice comes back double-JSON-encoded — a string
// containing `{"id":"...",...}` instead of the actual object. Spreading a
// string (`{..."abc"}`) silently produces `{0:"a",1:"b",2:"c"}` instead of
// throwing, so this must be caught explicitly before it reaches that point.
function parseIfJsonString(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function collectEffectKeys(effects, ops, into) {
  (effects || []).forEach((effect) => { if (ops.includes(effect.op)) into.add(effect.key); });
}

function collectConditionKeys(condition, ops, into) {
  if (!condition || typeof condition !== "object") return;
  if (Array.isArray(condition.all)) return condition.all.forEach((item) => collectConditionKeys(item, ops, into));
  if (Array.isArray(condition.any)) return condition.any.forEach((item) => collectConditionKeys(item, ops, into));
  if (condition.not) return collectConditionKeys(condition.not, ops, into);
  if (ops.includes(condition.op)) into.add(condition.key);
}

// Item/flag names are freely invented per-story (unlike the fixed 3-stat
// design), so a model that references one in an effect/condition without
// having pre-declared it in stateSchema is usually just a bookkeeping slip,
// not a content mistake — auto-declare it instead of failing validation.
function reconcileItemsAndFlags(stateSchema, scenes, missions, endings) {
  const items = new Set(stateSchema?.items || []);
  const flags = new Set(stateSchema?.flags || []);
  scenes.forEach((scene) => scene.choices.forEach((choice) => {
    collectEffectKeys(choice.effects, ["add_item", "remove_item"], items);
    collectEffectKeys(choice.effects, ["set_flag", "unset_flag"], flags);
    collectConditionKeys(choice.requires, ["item_present", "item_absent"], items);
    collectConditionKeys(choice.requires, ["flag_present", "flag_absent"], flags);
  }));
  const allMissions = [missions?.main, ...(missions?.side || []), ...(missions?.hidden || [])].filter(Boolean);
  allMissions.forEach((mission) => {
    collectEffectKeys(mission.failurePenalty, ["add_item", "remove_item"], items);
    collectEffectKeys(mission.failurePenalty, ["set_flag", "unset_flag"], flags);
    [mission.completeWhen, mission.failWhen, mission.unlockWhen].forEach((condition) => {
      collectConditionKeys(condition, ["item_present", "item_absent"], items);
      collectConditionKeys(condition, ["flag_present", "flag_absent"], flags);
    });
  });
  endings.forEach((ending) => {
    collectConditionKeys(ending.when, ["item_present", "item_absent"], items);
    collectConditionKeys(ending.when, ["flag_present", "flag_absent"], flags);
  });
  return stateSchema ? { ...stateSchema, items: [...items], flags: [...flags] } : stateSchema;
}

function normalizePackDraft(pack) {
  const stateSchema = pack.stateSchema;
  const missions = pack.missions ? {
    main: normalizeMission(pack.missions.main, stateSchema),
    side: asArray(pack.missions.side).map((mission) => normalizeMission(mission, stateSchema)),
    hidden: asArray(pack.missions.hidden).map((mission) => normalizeMission(mission, stateSchema)),
  } : pack.missions;
  const scenes = (pack.scenes || []).map((rawScene) => {
    const scene = parseIfJsonString(rawScene) || {};
    const rawChoices = parseIfJsonString(scene.choices);
    const choices = (Array.isArray(rawChoices) ? rawChoices : []).map((rawChoice) => {
      const choice = parseIfJsonString(rawChoice) || {};
      return {
        ...choice,
        effects: normalizeEffects(choice.effects),
        requires: choice.requires !== undefined ? normalizeCondition(choice.requires, stateSchema, false) : undefined,
      };
    });
    return { ...scene, choices };
  });
  const endings = (pack.endings || []).map((ending, index) => {
    const upper = String(ending?.type || "").toUpperCase();
    const type = ENDING_TYPES.has(upper) ? upper : (ENDING_TYPE_SYNONYMS[String(ending?.type || "").toLowerCase()] || "NE");
    return { ...ending, type, priority: typeof ending?.priority === "number" ? ending.priority : -index, text: typeof ending?.text === "string" ? ending.text : "", when: normalizeCondition(ending?.when, stateSchema, true) };
  });
  const patchedStateSchema = reconcileItemsAndFlags(stateSchema, scenes, missions, endings);
  return { ...pack, stateSchema: patchedStateSchema, missions, scenes, endings };
}

function cleanJson(raw) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter((n) => n >= 0));
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(start >= 0 && end >= start ? text.slice(start, end + 1) : text);
}

// A small fraction of LLM responses have a minor JSON syntax slip (a stray
// comma, an unescaped quote inside dialogue) that's sampling noise, not a
// structural prompt problem — the same prompt re-run usually comes back
// clean. Retry once before surfacing the error to the user.
async function callLLMForJson(prompt, options) {
  try {
    return cleanJson(await callLLM(prompt, null, options));
  } catch {
    return cleanJson(await callLLM(prompt, null, options));
  }
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function chapterText(chapter) {
  return String(chapter.edited || chapter.qt_raw || chapter.raw_original || "").trim();
}

function sourceBlock(chapters) {
  return chapters.map((chapter) => `### ${chapter.title}\n${chapterText(chapter)}`).join("\n\n");
}

async function updateRun(run, values) {
  return RoleplayGenerationRun.update(run.id, values);
}

function pickRandomRole(analysis) {
  const candidates = Array.isArray(analysis?.roleCandidates) ? analysis.roleCandidates.filter(Boolean) : [];
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function roleConstraintBlock(chosenRole) {
  if (!chosenRole) return "";
  return `\n\nBẮT BUỘC: vai người chơi đã được chọn ngẫu nhiên trước, không được đổi:\n- role: ${chosenRole.role}\n- canonical: ${chosenRole.canonical}\n- logic xuyên/nhập vai: ${chosenRole.logic}\n- cơ hội xuất hiện trong truyện: ${chosenRole.opportunity}\nDùng chính xác vai này cho player.role/player.canonicalCharacterId/player.loreRule. KHÔNG được tự chọn vai khác, kể cả khi bạn nghĩ nhân vật chính hợp lý hơn.`;
}

const sceneContract = `Mỗi scene: {id,title,text,systemMessage,mood?,primaryCharacterId?,choices}. Mỗi scene BẮT BUỘC có từ 3 đến 4 choices — kể cả scene cuối scene_10, dù mọi choice.next ở scene_10 đều là null.

VÍ DỤ CHÍNH XÁC MỘT CHOICE HỢP LỆ (chép đúng cấu trúc này, chỉ đổi nội dung):
{"id":"scene_01_a","text":"Bí mật theo dõi thay vì ra mặt ngay","resultText":"Bạn ẩn mình sau tảng đá, quan sát từng cử động của đối phương mà không bị phát hiện.","systemReaction":"Ký chủ hành động thận trọng, hợp lý.","effects":[{"op":"add_stat","key":"suspicion","value":-5},{"op":"add_relationship","key":"npc_guard","value":3}],"requires":{"op":"stat_gte","key":"survival","value":20},"next":"scene_02","basedOnEventId":"ev_xxx"}

QUY TẮC BẮT BUỘC (vi phạm sẽ khiến scene bị hệ thống từ chối):
1) "effects" LUÔN LUÔN là một MẢNG các object {op,key,value} — kể cả khi choice chỉ có ĐÚNG 1 effect vẫn phải bọc trong dấu ngoặc vuông. Đúng: "effects":[{"op":"add_stat","key":"survival","value":-8}]. SAI (không bao giờ làm vậy): "effects":{"op":"add_stat","key":"survival","value":-8}.
2) "requires" (nếu có) là DUY NHẤT MỘT object điều kiện, không phải mảng: leaf {"op":...,"key":...,"value":...} hoặc {"all":[...]}/{"any":[...]}/{"not":{...}}. TUYỆT ĐỐI không viết requires dạng chuỗi văn bản như "a >= 1 and b == true".
3) Effect "op" CHỈ được là một trong: add_stat, set_stat, add_relationship, set_relationship, set_flag, unset_flag, add_item, remove_item — không tự đặt tên field khác như "stat"/"change" thay cho "op"/"key"/"value".
4) Condition "op" CHỈ được là một trong: stat_gt, stat_gte, stat_lt, stat_lte, stat_eq, relationship_gt, relationship_gte, relationship_lt, relationship_lte, relationship_eq, flag_present, flag_absent, item_present, item_absent, mission_unlocked, mission_completed.
5) resultText mô tả 2-4 câu hậu quả diễn ra ngay sau hành động; systemReaction là lời Hệ Thống phản ứng theo đúng tính cách.
6) mood là 1 từ khóa tiếng Anh mô tả không khí cảnh (tense, danger, romantic, triumphant, melancholic, mysterious, neutral, hope, chaos) nếu tự tin, không thì bỏ trống.
7) primaryCharacterId là id nhân vật (đúng theo characters[].id trong Context Bible) đang xuất hiện chính trong cảnh, nếu không rõ thì bỏ trống.
8) basedOnEventId trỏ tới đúng 1 events[].id có thật trong Context Bible mà effects của choice là hệ quả trực tiếp; nếu không dựa trên event cụ thể thì bỏ trống — không bịa id không tồn tại.
9) "choices" là một MẢNG các OBJECT thật — TUYỆT ĐỐI không biến từng choice hay cả mảng choices thành một chuỗi JSON (stringify) rồi nhét vào, dù chỉ một phần tử.
10) Mỗi scene có 3-4 choices khác nhau thật sự: một lựa chọn an toàn nhưng mất cơ hội, một lựa chọn mạo hiểm có phần thưởng lớn, một lựa chọn xã hội/mưu trí phụ thuộc trạng thái. Một số choices nên bị khóa bằng requires. Lựa chọn phải thực sự cập nhật biến qua effects để nhiệm vụ có thể mở khóa/hoàn thành sau này. Không viết tên hay điều kiện nhiệm vụ ẩn vào nội dung trước khi nó mở khóa.`;

const missionsExample = `VÍ DỤ CHÍNH XÁC missions (chép đúng cấu trúc, chỉ đổi nội dung/giá trị):
{"main":{"id":"mission_main","type":"main","title":"...","description":"...","completeWhen":{"op":"flag_present","key":"truth_revealed"},"failWhen":{"op":"stat_lte","key":"survival","value":0},"failurePenalty":[{"op":"add_stat","key":"suspicion","value":20}],"rewardText":"..."},"side":[{"id":"mission_side_1","type":"side","title":"...","description":"...","completeWhen":{"op":"relationship_gte","key":"npc_a","value":30},"failurePenalty":[],"rewardText":"..."}],"hidden":[{"id":"mission_hidden","type":"hidden","title":"...","description":"...","unlockWhen":{"all":[{"op":"stat_gte","key":"plotDeviation","value":30}]},"completeWhen":{"op":"flag_present","key":"heroic_gamble"},"failurePenalty":[],"rewardText":"..."}]}
QUY TẮC BẮT BUỘC: "hidden" LUÔN LUÔN là một MẢNG dù chỉ có đúng 1 phần tử — SAI nếu viết hidden thành 1 object đơn lẻ không bọc trong []. "completeWhen"/"failWhen"/"unlockWhen" LUÔN LUÔN là 1 object điều kiện đúng DSL (leaf op/key/value hoặc all/any/not), TUYỆT ĐỐI không viết bằng chuỗi văn bản như "a >= 1 and b == true". "failurePenalty" LUÔN LUÔN là MẢNG các effect {op,key,value} đúng DSL (dùng op add_stat/set_stat/add_relationship/set_relationship/set_flag/unset_flag/add_item/remove_item), kể cả khi rỗng vẫn phải là [] chứ không được thiếu field.`;

const endingsExample = `VÍ DỤ CHÍNH XÁC 1 ending (chép đúng cấu trúc): {"id":"ending_he","type":"HE","priority":100,"title":"...","text":"...","when":{"all":[{"op":"flag_present","key":"truth_revealed"}]}}
QUY TẮC BẮT BUỘC: "type" CHỈ ĐƯỢC LÀ MỘT TRONG 5 GIÁ TRỊ CHÍNH XÁC SAU (viết hoa nguyên văn): "HE","NE","BE","SPECIAL","HIDDEN". TUYỆT ĐỐI KHÔNG dùng "good"/"bad"/"neutral"/"happy"/"sad" hay từ nào khác. Mọi ending PHẢI có đủ 6 field: id, type, priority (số nguyên), title, text, when (object điều kiện đúng DSL, không phải chuỗi) — không được thiếu field nào.`;

const branchingLayout = `BẮT BUỘC cấu trúc 10 beat, 12 scene node theo đúng sơ đồ sau (không được đổi id, không được thêm/bớt branch point):
scene_01 → scene_02 → scene_03 → scene_04 → [rẽ nhánh tại đây] → scene_05a HOẶC scene_05b (nội dung, hậu quả, systemReaction PHẢI khác nhau rõ rệt giữa hai nhánh — không phải chỉ đổi câu chữ) → cả hai đều dẫn về scene_06 → scene_07 → [rẽ nhánh lần 2, đây là cao trào] → scene_08a HOẶC scene_08b (khác biệt rõ rệt, đây phải là beat thử thách/kịch tính nhất trong toàn bộ game) → cả hai đều dẫn về scene_09 → scene_10 (kết, mọi choice.next = null).
Tại scene_04, choice dẫn tới scene_05a phải khác choice dẫn tới scene_05b theo đúng lựa chọn của người chơi (không được cả hai lựa chọn cùng dẫn 1 nơi, phải set next tường minh là "scene_05a" hoặc "scene_05b"). Tương tự cho scene_07 → scene_08a/scene_08b (set next tường minh là "scene_08a" hoặc "scene_08b").
Trạng thái (flags/stats) đặt ra trong scene_05a/05b hoặc 08a/08b phải được ít nhất một choice ở scene_06+ hoặc scene_09+ hoặc một ending tham chiếu lại (qua requires/when) — nhánh phải để lại dấu vết cơ học, không chỉ đổi văn bản rồi biến mất khi hội tụ.`;

export async function generateRoleplay({ project, chapterIds, onProgress }) {
  const provider = getProvider();
  const model = getModel(provider);
  const unordered = await Chapter.getMany(chapterIds);
  const order = new Map(chapterIds.map((id, index) => [id, index]));
  const chapters = unordered.sort((a, b) => order.get(a.id) - order.get(b.id));
  if (!chapters.length || chapters.some((chapter) => !chapterText(chapter))) throw new Error("Khoảng chương đã chọn có chương chưa có nội dung.");
  const glossary = await GlossaryTerm.filter({ project_id: project.id }, "source_term", 1000);
  const glossaryRows = /** @type {any[]} */ (glossary);
  const source = sourceBlock(chapters);
  const sourceHash = await hashText(chapters.map((chapter) => `${chapter.id}:${chapter.updated_date}:${chapterText(chapter)}`).join("\n"));
  const loreRules = JSON.stringify({ glossary: glossaryRows.map((term) => [term.source_term, term.translation]), pronouns: project.contextual_pronoun_rules || [], preset: project.active_preset_id || "" });
  const loreRulesHash = await hashText(loreRules);
  let run = await RoleplayGenerationRun.create({ project_id: project.id, status: "running", current_step: "context", step_state: {}, provider, model, prompt_versions: PROMPT_VERSIONS });
  const checkpoint = async (step, output) => {
    onProgress?.(step);
    run = await updateRun(run, { current_step: step, step_state: { ...(run.step_state || {}), [step]: { status: "done", output } } });
  };
  try {
    onProgress?.("context");
    let analysis = await RoleplayAnalysis.findCached(project.id, sourceHash, loreRulesHash, PROMPT_VERSIONS.context);
    if (!analysis) {
      const output = await callLLMForJson(`Bạn là Story Analyzer cho interactive fiction xuyên sách. Phân tích đúng phần truyện được cung cấp; không viết game. Trả DUY NHẤT JSON object có keys: summary (string), characters (array {id,name,aliases,role,personality,goals,status,knowledge}), relationships (array {from,to,type,state}), events (array {id,chapter,title,description,stakes,dramaScore}), locations (array), items (array), knowledgeFacts (array {fact,knownBy,notKnownBy}), roleCandidates (array {role,canonical,logic,opportunity}). stakes mô tả mức độ kịch tính/nguy hiểm/hệ quả nếu thất bại, càng cụ thể càng tốt. dramaScore là số nguyên 1-10, 10 là cao trào/nguy hiểm nhất, dùng để bước sau ưu tiên sự kiện kịch tính nhất. Ưu tiên sự thật tại đúng thời điểm, không dùng kiến thức tương lai.\n\nGỢI Ý TỪ EDITQT:\n${loreRules.slice(0, 12000)}\n\nTRUYỆN:\n${source}`);
      analysis = await RoleplayAnalysis.create({ project_id: project.id, chapter_ids: chapterIds, source_hash: sourceHash, lore_rules_hash: loreRulesHash, analyzer_version: PROMPT_VERSIONS.context, status: "ready", analysis: output });
    }
    await checkpoint("context", analysis.analysis);

    onProgress?.("blueprint");
    const chosenRole = pickRandomRole(analysis.analysis);
    const blueprint = await callLLMForJson(`Bạn là Scenario Designer cho game xuyên sách có Hệ Thống. Từ Context Bible bên dưới, thiết kế đúng 10 beat theo sơ đồ cấu trúc bắt buộc. Trước khi thiết kế sceneOutline, chọn ra 4-6 event có dramaScore cao nhất từ events[] trong Context Bible — đây là các biến cố PHẢI xuất hiện hoặc PHẢI là hệ quả trực tiếp của một lựa chọn trong game. KHÔNG kể lại tuần tự toàn bộ nội dung chương đã chọn — hãy nén, bỏ qua các đoạn thuật lại không có xung đột, và dựng 10 beat xoay quanh các event kịch tính nhất. Nếu một chương không có event dramaScore ≥ 6, có thể bỏ qua chương đó khi thiết kế beat mà vẫn được, miễn cốt truyện fanfic vẫn nhất quán. Tự chọn loại Hệ Thống phù hợp nhất với truyện (Sinh Tồn, Cứu Rỗi Phản Diện, Sửa Chữa Cốt Truyện, Nghịch Thiên Cải Mệnh hoặc Cá Mặn). Hệ Thống có cá tính riêng và chỉ biết nguyên tác nên không đáng tin tuyệt đối khi độ lệch tăng.${roleConstraintBlock(chosenRole)}\n\n${branchingLayout}\n\nTrả DUY NHẤT JSON object gồm: title, player {role,canonicalCharacterId,isOriginalCharacter,loreRule}, system {name,personality,reliability từ 50 đến 95,activationText,mainMission,failureText,deviationMessages:[{threshold:30 hoặc 70,message}]}, missions {main: 1 mission object, side: mảng 1-2 mission, hidden: MẢNG chứa đúng 1 mission (không phải object đơn lẻ)}, stateSchema {stats,relationships,flags,items}, startSceneId phải là "scene_01", sceneOutline (12 phần tử theo đúng id sơ đồ: scene_01,scene_02,scene_03,scene_04,scene_05a,scene_05b,scene_06,scene_07,scene_08a,scene_08b,scene_09,scene_10 — mỗi phần tử {id,title,beat,allowedFacts}), endingsPlan (mảng, mỗi phần tử theo đúng cấu trúc ending bên dưới). Mỗi mission có {id,type,title,description,unlockWhen?,completeWhen,failWhen?,failurePenalty,rewardText}; main type main, side type side, hidden type hidden. Mỗi nhiệm vụ có thể thất bại phải có hình phạt thật (failurePenalty) lên survival/suspicion/relationship, đủ sức làm thay đổi cách chơi. Nhiệm vụ ẩn phải mở khóa quanh scene_05a/05b hoặc scene_08a/08b bằng chuỗi trạng thái có thể đạt được nhưng không được tiết lộ trước.\n\n${missionsExample}\n\n${endingsExample}\n\nstateSchema.stats và relationships là object có key ổn định, mỗi value đúng dạng {initial:number,min:number,max:number}; flags và items là array string. Stats chỉ gồm survival/suspicion/plotDeviation; relationship tối đa 5 NPC. Mọi flag/item phải khai báo trước.\n\nCONTEXT BIBLE:\n${JSON.stringify(analysis.analysis)}`);
    await checkpoint("blueprint", blueprint);

    // Split into 4 small scene-writer calls instead of 2 large ones — a
    // single call asking for 7 richly-fielded scenes (mood/primaryCharacterId/
    // basedOnEventId per choice) reliably exceeds the 8192-token response cap
    // and comes back as truncated/invalid JSON. Each call below stays well
    // under that budget and receives all previously-written scenes as
    // context so character voice/state stays consistent across calls.
    onProgress?.("scenes_1_4");
    const part1 = await callLLMForJson(`Bạn là Scene Writer. Viết scenes scene_01, scene_02, scene_03, scene_04 đúng theo blueprint và sơ đồ rẽ nhánh bắt buộc. scene_04 phải có choices dẫn rõ ràng bằng next tới "scene_05a" hoặc "scene_05b" (hai scene này sẽ được viết ở bước sau, cứ tham chiếu đúng id). Trả DUY NHẤT JSON array (4 phần tử). ${sceneContract}\n\n${branchingLayout}\n\nCONTEXT:\n${JSON.stringify(analysis.analysis)}\n\nBLUEPRINT:\n${JSON.stringify(blueprint)}`, { maxTokens: 8192 });
    await checkpoint("scenes_1_4", part1);

    onProgress?.("scenes_5_6");
    const part2 = await callLLMForJson(`Bạn là Scene Writer. Viết scenes scene_05a, scene_05b, scene_06 đúng theo blueprint và sơ đồ rẽ nhánh bắt buộc. scene_05a và scene_05b PHẢI khác biệt rõ rệt về nội dung, hậu quả, systemReaction (không chỉ đổi câu chữ) — đây là kết quả của hai lựa chọn khác nhau ở scene_04. Cả hai đều phải có choices dẫn về scene_06. Trả DUY NHẤT JSON array (3 phần tử). ${sceneContract}\n\n${branchingLayout}\n\nCONTEXT:\n${JSON.stringify(analysis.analysis)}\n\nBLUEPRINT:\n${JSON.stringify(blueprint)}\n\nSCENES ĐÃ VIẾT (scene_01..scene_04):\n${JSON.stringify(part1)}`, { maxTokens: 8192 });
    await checkpoint("scenes_5_6", part2);

    onProgress?.("scenes_7_8");
    const part3 = await callLLMForJson(`Bạn là Scene Writer. Viết scenes scene_07, scene_08a, scene_08b đúng theo blueprint và sơ đồ rẽ nhánh bắt buộc. scene_07 là cao trào, choices phải dẫn rõ ràng bằng next tới "scene_08a" hoặc "scene_08b" (hai scene này sẽ được viết ngay dưới đây). scene_08a và scene_08b PHẢI khác biệt rõ rệt, đây là beat thử thách/kịch tính nhất toàn game. Trả DUY NHẤT JSON array (3 phần tử). ${sceneContract}\n\n${branchingLayout}\n\nCONTEXT:\n${JSON.stringify(analysis.analysis)}\n\nBLUEPRINT:\n${JSON.stringify(blueprint)}\n\nSCENES ĐÃ VIẾT (scene_01..scene_06):\n${JSON.stringify([...part1, ...part2])}`, { maxTokens: 8192 });
    await checkpoint("scenes_7_8", part3);

    onProgress?.("scenes_9_10");
    const part4 = await callLLMForJson(`Bạn là Scene Writer và Ending Designer. Viết scenes scene_09, scene_10 theo blueprint. scene_10 vẫn PHẢI có đủ 3-4 choices như mọi scene khác (chỉ khác là next của tất cả choices ở scene_10 là null) — TUYỆT ĐỐI không được viết ít hơn 3 choices cho scene_10. Trả DUY NHẤT JSON object {scenes,endings}. scenes là array 2 phần tử. endings là mảng gồm 1 HE, 1-2 NE, 2-3 BE, optional SPECIAL/HIDDEN; mỗi ending theo đúng cấu trúc bên dưới. Điều kiện "when" phải dựa trên state/flags và luôn có một BE fallback priority 0 có điều kiện luôn đạt bằng stat_gte với min của một stat. ${sceneContract}\n\n${endingsExample}\n\n${branchingLayout}\n\nCONTEXT:\n${JSON.stringify(analysis.analysis)}\n\nBLUEPRINT:\n${JSON.stringify(blueprint)}\n\nSCENES ĐÃ VIẾT (scene_01..scene_08b):\n${JSON.stringify([...part1, ...part2, ...part3])}`, { maxTokens: 8192 });
    await checkpoint("scenes_9_10", part4);

    const generatedScenes = [...part1, ...part2, ...part3, ...(part4.scenes || [])].map((scene) => ({
      ...scene,
      choices: (scene.choices || []).map((choice) => ({ ...choice, next: choice.next || FALLBACK_NEXT[scene.id] || null })),
    }));
    const pack = {
      schemaVersion: 1, id: crypto.randomUUID(), projectId: project.id, title: blueprint.title,
      source: { chapterIds, chapterRangeLabel: `${chapters[0].title}–${chapters.at(-1).title}`, analysisId: analysis.id },
      player: blueprint.player, system: blueprint.system, missions: blueprint.missions, stateSchema: blueprint.stateSchema,
      startSceneId: "scene_01", scenes: generatedScenes, endings: part4.endings || [],
      meta: { generatorVersion: "generator-v2-branching", promptVersions: PROMPT_VERSIONS, provider, model, roleSelection: chosenRole ? "random_from_candidates" : "ai_fallback", roleCandidateChosen: chosenRole || null },
    };
    const repairedPack = normalizePackDraft(pack);
    onProgress?.("validation");
    const validation = validateRoleplayPack(repairedPack, { events: analysis.analysis?.events || [] });
    const simulation = validation.valid ? simulateRoleplay(repairedPack, 1000) : null;
    const report = { ...validation, simulation };
    const scenario = await RoleplayScenario.create({ project_id: project.id, analysis_id: analysis.id, title: repairedPack.title, status: validation.valid ? "ready" : "draft", source_chapter_ids: chapterIds, source_hash: sourceHash, pack: repairedPack, validation_report: report });
    await updateRun(run, { status: "completed", current_step: "completed", scenario_id: scenario.id, analysis_id: analysis.id, step_state: { ...(run.step_state || {}), validation: { status: "done", output: report } } });
    onProgress?.("completed");
    return scenario;
  } catch (error) {
    await updateRun(run, { status: "failed", error: { message: error.message }, current_step: run.current_step }).catch(() => {});
    throw error;
  }
}
