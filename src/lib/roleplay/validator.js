import { roleplayPackSchema } from "./schema";
import { availableChoices, choose, createInitialState, getScene, resolveEnding } from "./engine";

function conditionLeaves(condition) {
  if (!condition) return [];
  if (condition.all) return condition.all.flatMap(conditionLeaves);
  if (condition.any) return condition.any.flatMap(conditionLeaves);
  if (condition.not) return conditionLeaves(condition.not);
  return [condition];
}

export function validateRoleplayPack(pack, { events = [] } = {}) {
  const errors = [];
  const warnings = [];
  const eventIds = new Set(events.map((event) => event?.id).filter(Boolean));
  const parsed = roleplayPackSchema.safeParse(pack);
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => errors.push({ code: "SCHEMA", message: `${issue.path.join(".")}: ${issue.message}` }));
    return { valid: false, errors, warnings, stats: {} };
  }
  const value = parsed.data;
  const sceneIds = new Set();
  const choiceIds = new Set();
  const endingIds = new Set();
  value.scenes.forEach((scene) => {
    if (sceneIds.has(scene.id)) errors.push({ code: "DUPLICATE_SCENE", target: scene.id, message: `Scene ID trùng: ${scene.id}` });
    sceneIds.add(scene.id);
    scene.choices.forEach((choice) => {
      if (choiceIds.has(choice.id)) errors.push({ code: "DUPLICATE_CHOICE", target: choice.id, message: `Choice ID trùng: ${choice.id}` });
      choiceIds.add(choice.id);
    });
  });
  value.endings.forEach((ending) => {
    if (endingIds.has(ending.id)) errors.push({ code: "DUPLICATE_ENDING", target: ending.id, message: `Ending ID trùng: ${ending.id}` });
    endingIds.add(ending.id);
  });
  if (!sceneIds.has(value.startSceneId)) errors.push({ code: "START_MISSING", message: "startSceneId không tồn tại." });
  value.scenes.forEach((scene) => scene.choices.forEach((choice) => {
    if (choice.next && !sceneIds.has(choice.next)) errors.push({ code: "NEXT_MISSING", target: choice.id, message: `${choice.id} trỏ tới scene không tồn tại: ${choice.next}` });
    for (const effect of choice.effects) {
      if (effect.op.includes("stat") && !value.stateSchema.stats[effect.key]) errors.push({ code: "UNKNOWN_STAT", target: choice.id, message: `Stat chưa khai báo: ${effect.key}` });
      if (effect.op.includes("relationship") && !value.stateSchema.relationships[effect.key]) errors.push({ code: "UNKNOWN_RELATIONSHIP", target: choice.id, message: `Relationship chưa khai báo: ${effect.key}` });
      if (effect.op.includes("flag") && !value.stateSchema.flags.includes(effect.key)) errors.push({ code: "UNKNOWN_FLAG", target: choice.id, message: `Flag chưa khai báo: ${effect.key}` });
      if (effect.op.includes("item") && !value.stateSchema.items.includes(effect.key)) errors.push({ code: "UNKNOWN_ITEM", target: choice.id, message: `Item chưa khai báo: ${effect.key}` });
    }
    conditionLeaves(choice.requires).forEach((leaf) => {
      if (leaf.op.startsWith("stat_") && !value.stateSchema.stats[leaf.key]) errors.push({ code: "UNKNOWN_STAT", target: choice.id, message: `Stat chưa khai báo: ${leaf.key}` });
      if (leaf.op.startsWith("relationship_") && !value.stateSchema.relationships[leaf.key]) errors.push({ code: "UNKNOWN_RELATIONSHIP", target: choice.id, message: `Relationship chưa khai báo: ${leaf.key}` });
    });
    if (choice.effects.length && !choice.basedOnEventId) warnings.push({ code: "NO_EVENT_TRACE", target: choice.id, message: `${choice.id} có effects nhưng không tham chiếu event nào trong Context Bible.` });
    else if (choice.basedOnEventId && eventIds.size && !eventIds.has(choice.basedOnEventId)) warnings.push({ code: "UNKNOWN_EVENT_TRACE", target: choice.id, message: `${choice.id} tham chiếu event không tồn tại: ${choice.basedOnEventId}` });
  }));
  value.scenes.forEach((scene, index) => {
    const finalScene = index === value.scenes.length - 1;
    scene.choices.forEach((choice) => {
      if (!finalScene && !choice.next) errors.push({ code: "EARLY_TERMINAL", target: choice.id, message: `${choice.id} phải dẫn tới một scene tiếp theo.` });
      if (finalScene && choice.next) warnings.push({ code: "FINAL_CONTINUES", target: choice.id, message: `${choice.id} ở cảnh cuối vẫn dẫn sang scene khác.` });
    });
  });
  const reachable = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push({ code: "CYCLE", target: id, message: `Phát hiện vòng lặp tại ${id}.` }); return; }
    if (reachable.has(id)) return;
    reachable.add(id); visiting.add(id);
    getScene(value, id)?.choices.forEach((choice) => { if (choice.next) visit(choice.next); });
    visiting.delete(id);
  }
  visit(value.startSceneId);
  value.scenes.forEach((scene) => { if (!reachable.has(scene.id)) warnings.push({ code: "ORPHAN_SCENE", target: scene.id, message: `Scene không thể đi tới: ${scene.id}` }); });
  if (value.scenes.length < 8 || value.scenes.length > 12) warnings.push({ code: "SCENE_COUNT", message: `V2 khuyến nghị 8–12 scene node (10 beat, tối đa 2 điểm rẽ nhánh); hiện có ${value.scenes.length}.` });
  return { valid: errors.length === 0, errors, warnings, stats: { sceneCount: value.scenes.length, endingCount: value.endings.length, reachableScenes: reachable.size } };
}

export function simulateRoleplay(pack, runs = 1000) {
  const endings = {};
  let deadEnds = 0;
  let totalSteps = 0;
  for (let run = 0; run < runs; run += 1) {
    let state = createInitialState(pack);
    let sceneId = pack.startSceneId;
    let ending = null;
    let steps = 0;
    while (sceneId && steps < 50) {
      const scene = getScene(pack, sceneId);
      const choices = availableChoices(scene, state);
      if (!scene || !choices.length) { deadEnds += 1; break; }
      const choice = choices[Math.floor(Math.random() * choices.length)];
      const result = choose(pack, state, sceneId, choice.id);
      state = result.state; sceneId = result.nextSceneId; ending = result.ending; steps += 1;
    }
    if (!ending && !sceneId) ending = resolveEnding(pack, state);
    if (ending) endings[ending.id] = (endings[ending.id] || 0) + 1;
    else if (steps >= 50) deadEnds += 1;
    totalSteps += steps;
  }
  return { runs, endings, deadEnds, averageSteps: Number((totalSteps / runs).toFixed(1)) };
}
