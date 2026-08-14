function compare(actual, op, expected) {
  if (op.endsWith("_gt")) return actual > expected;
  if (op.endsWith("_gte")) return actual >= expected;
  if (op.endsWith("_lt")) return actual < expected;
  if (op.endsWith("_lte")) return actual <= expected;
  return actual === expected;
}

export function createInitialState(pack) {
  const visibleMissionIds = pack.missions ? [pack.missions.main?.id, ...(pack.missions.side || []).map((mission) => mission.id)].filter(Boolean) : [];
  return {
    stats: Object.fromEntries(Object.entries(pack.stateSchema.stats).map(([key, rule]) => [key, rule.initial])),
    relationships: Object.fromEntries(Object.entries(pack.stateSchema.relationships).map(([key, rule]) => [key, rule.initial])),
    flags: [], inventory: [], path: [pack.startSceneId], choices: [],
    missions: { unlocked: visibleMissionIds, completed: [], failed: [] }, notifications: [],
  };
}

// Makes packs created before the stricter V1 contract playable. New packs
// must already contain 3–4 choices and explicit transitions; this adapter is
// intentionally UI-only compatibility data and is never written back.
export function preparePackForPlay(pack) {
  const copy = structuredClone(pack);
  copy.stateSchema ||= { stats: {}, relationships: {}, flags: [], items: [] };
  copy.stateSchema.stats ||= {};
  copy.stateSchema.relationships ||= {};
  copy.stateSchema.flags = Array.isArray(copy.stateSchema.flags) ? copy.stateSchema.flags : [];
  copy.stateSchema.items = Array.isArray(copy.stateSchema.items) ? copy.stateSchema.items : [];
  copy.scenes = Array.isArray(copy.scenes) ? copy.scenes : [];
  copy.endings = Array.isArray(copy.endings) ? copy.endings : [];
  copy.system = {
    personality: "Lạnh lùng, ngắn gọn và chỉ cung cấp thông tin cần thiết.", reliability: 100, deviationMessages: [],
    ...copy.system,
  };
  if (!copy.missions) {
    copy.missions = {
      main: { id: "mission_main", type: "main", title: "Nhiệm vụ chính", description: copy.system.mainMission, completeWhen: { op: "stat_gt", key: "survival", value: 100 }, rewardText: "Hoàn thành mục tiêu xuyên sách." },
      side: [], hidden: [],
    };
  }
  copy.missions.main ||= { id: "mission_main", type: "main", title: "Nhiệm vụ chính", description: copy.system.mainMission || "Hoàn thành mục tiêu xuyên sách.", completeWhen: { op: "stat_gt", key: "survival", value: 100 }, rewardText: "" };
  copy.missions.side = Array.isArray(copy.missions.side) ? copy.missions.side.filter(Boolean) : [];
  copy.missions.hidden = Array.isArray(copy.missions.hidden) ? copy.missions.hidden.filter(Boolean) : [];
  const knownSceneIds = new Set(copy.scenes.map((scene) => scene.id));
  copy.scenes = copy.scenes.map((scene, index) => {
    const finalScene = index === copy.scenes.length - 1;
    const fallbackNext = finalScene ? null : copy.scenes[index + 1].id;
    const choices = (scene.choices || []).map((choice) => ({
      ...choice,
      effects: Array.isArray(choice.effects) ? choice.effects : (choice.effects && typeof choice.effects === "object" ? [choice.effects] : []),
      next: finalScene
        ? null
        : (!choice.next || !knownSceneIds.has(choice.next) ? fallbackNext : choice.next),
    }));
    while (choices.length < 3) {
      choices.push({
        id: `${scene.id}_compat_${choices.length + 1}`,
        text: "Tạm thời quan sát tình hình trước khi hành động",
        effects: copy.stateSchema.stats.plotDeviation ? [{ op: "add_stat", key: "plotDeviation", value: 2 }] : [],
        next: fallbackNext,
      });
    }
    return { ...scene, choices };
  });
  return copy;
}

export function evaluateCondition(condition, state) {
  if (!condition) return true;
  if (typeof condition !== "object") return false;
  if (Array.isArray(condition.all)) return condition.all.every((item) => evaluateCondition(item, state));
  if (Array.isArray(condition.any)) return condition.any.some((item) => evaluateCondition(item, state));
  if (condition.not) return !evaluateCondition(condition.not, state);
  if (typeof condition.op !== "string") return false;
  if (condition.op.startsWith("stat_")) return compare(state.stats[condition.key] ?? 0, condition.op, condition.value);
  if (condition.op.startsWith("relationship_")) return compare(state.relationships[condition.key] ?? 0, condition.op, condition.value);
  if (condition.op === "flag_present") return state.flags.includes(condition.key);
  if (condition.op === "flag_absent") return !state.flags.includes(condition.key);
  if (condition.op === "item_present") return state.inventory.includes(condition.key);
  if (condition.op === "item_absent") return !state.inventory.includes(condition.key);
  if (condition.op === "mission_unlocked") return state.missions?.unlocked?.includes(condition.key);
  if (condition.op === "mission_completed") return state.missions?.completed?.includes(condition.key);
  return false;
}

function updateMissions(pack, state) {
  let next = { ...state, missions: { unlocked: [...(state.missions?.unlocked || [])], completed: [...(state.missions?.completed || [])], failed: [...(state.missions?.failed || [])] }, notifications: [] };
  const all = pack.missions ? [pack.missions.main, ...(pack.missions.side || []), ...(pack.missions.hidden || [])].filter(Boolean) : [];
  for (const mission of all) {
    const hidden = mission.type === "hidden";
    if (hidden && !next.missions.unlocked.includes(mission.id) && mission.unlockWhen && evaluateCondition(mission.unlockWhen, next)) {
      next.missions.unlocked.push(mission.id);
      next.notifications.push({ type: "mission_unlocked", title: "Đã kích hoạt nhiệm vụ ẩn", message: mission.title });
    }
    if (!next.missions.unlocked.includes(mission.id)) continue;
    if (!next.missions.completed.includes(mission.id) && evaluateCondition(mission.completeWhen, next)) {
      next.missions.completed.push(mission.id);
      next.notifications.push({ type: "mission_completed", title: "Hoàn thành nhiệm vụ", message: mission.title });
    }
    if (mission.failWhen && !next.missions.failed.includes(mission.id) && evaluateCondition(mission.failWhen, next)) {
      next.missions.failed.push(mission.id);
      const notices = next.notifications;
      next = applyEffects(next, mission.failurePenalty, pack.stateSchema);
      next.notifications = notices;
      next.notifications.push({ type: "mission_failed", title: "Nhiệm vụ thất bại · Đã nhận hình phạt", message: mission.title });
    }
  }
  return next;
}

function clamp(value, rule) {
  return Math.max(rule.min, Math.min(rule.max, value));
}

export function applyEffects(state, effects, stateSchema) {
  const next = { ...state, stats: { ...state.stats }, relationships: { ...state.relationships }, flags: [...state.flags], inventory: [...state.inventory] };
  const normalizedEffects = Array.isArray(effects) ? effects : (effects && typeof effects === "object" ? [effects] : []);
  for (const effect of normalizedEffects) {
    if (!effect || typeof effect !== "object" || typeof effect.op !== "string") continue;
    const value = effect.value ?? 0;
    if (effect.op === "add_stat" || effect.op === "set_stat") {
      const rule = stateSchema.stats[effect.key];
      if (!rule) continue;
      const raw = effect.op === "add_stat" ? (next.stats[effect.key] ?? rule.initial) + value : value;
      next.stats[effect.key] = clamp(raw, rule);
    } else if (effect.op === "add_relationship" || effect.op === "set_relationship") {
      const rule = stateSchema.relationships[effect.key];
      if (!rule) continue;
      const raw = effect.op === "add_relationship" ? (next.relationships[effect.key] ?? rule.initial) + value : value;
      next.relationships[effect.key] = clamp(raw, rule);
    } else if (effect.op === "set_flag" && !next.flags.includes(effect.key)) next.flags.push(effect.key);
    else if (effect.op === "unset_flag") next.flags = next.flags.filter((key) => key !== effect.key);
    else if (effect.op === "add_item" && !next.inventory.includes(effect.key)) next.inventory.push(effect.key);
    else if (effect.op === "remove_item") next.inventory = next.inventory.filter((key) => key !== effect.key);
  }
  return next;
}

export function getScene(pack, sceneId) {
  return pack.scenes.find((scene) => scene.id === sceneId) || null;
}

export function availableChoices(scene, state) {
  return (scene?.choices || []).filter((choice) => evaluateCondition(choice.requires, state));
}

export function resolveEnding(pack, state) {
  return [...(pack.endings || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0)).find((ending) => evaluateCondition(ending.when, state)) || null;
}

function fallbackEnding(pack, state) {
  const survival = state.stats?.survival;
  if (typeof survival === "number" && survival <= 0) return { id: "runtime_fallback_be", type: "BE", priority: -1, title: "Không thể trở về", text: pack.system?.failureText || "Bạn đã không thể hoàn thành nhiệm vụ xuyên sách." };
  return { id: "runtime_fallback_ne", type: "NE", priority: -1, title: "Một kết cục chưa được ghi lại", text: "Bạn đã đi đến cuối hành trình, nhưng những lựa chọn hiện tại không khớp với kết cục có sẵn. Thế giới tiếp tục vận hành trên một nhánh mới ngoài nguyên tác." };
}

export function choose(pack, state, sceneId, choiceId) {
  const scene = getScene(pack, sceneId);
  const choice = availableChoices(scene, state).find((item) => item.id === choiceId);
  if (!choice) throw new Error("Lựa chọn không tồn tại hoặc chưa được mở khóa.");
  const beforeDeviation = state.stats.plotDeviation ?? 0;
  let updated = applyEffects(state, choice.effects, pack.stateSchema);
  updated = updateMissions(pack, updated);
  const afterDeviation = updated.stats.plotDeviation ?? 0;
  const crossed = [...(pack.system.deviationMessages || [])].sort((a, b) => b.threshold - a.threshold).find((item) => beforeDeviation < item.threshold && afterDeviation >= item.threshold);
  if (crossed) updated.notifications.push({ type: "system_warning", title: `Cốt truyện sai lệch ${afterDeviation}%`, message: crossed.message });
  updated.choices = [...updated.choices, choiceId];
  const survivalRule = pack.stateSchema.stats?.survival;
  const suspicionRule = pack.stateSchema.stats?.suspicion;
  if (survivalRule && updated.stats.survival <= survivalRule.min) return { state: updated, nextSceneId: null, ending: { id: "runtime_survival_be", type: "BE", priority: 999, title: "Sinh tồn thất bại", text: pack.system?.failureText || "Sinh mệnh của ký chủ đã về không." } };
  if (suspicionRule && updated.stats.suspicion >= suspicionRule.max) return { state: updated, nextSceneId: null, ending: { id: "runtime_exposed_be", type: "BE", priority: 999, title: "Thân phận bại lộ", text: "Mức nghi ngờ đã chạm giới hạn. Thế giới nguyên tác xác định bạn là kẻ xâm nhập." } };
  if (choice.next) {
    updated.path = [...updated.path, choice.next];
    return { state: updated, nextSceneId: choice.next, ending: null };
  }
  return { state: updated, nextSceneId: null, ending: resolveEnding(pack, updated) || fallbackEnding(pack, updated) };
}
