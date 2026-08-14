import { z } from "zod";

const conditionLeaf = z.object({
  op: z.enum(["stat_gt", "stat_gte", "stat_lt", "stat_lte", "stat_eq", "relationship_gt", "relationship_gte", "relationship_lt", "relationship_lte", "relationship_eq", "flag_present", "flag_absent", "item_present", "item_absent", "mission_unlocked", "mission_completed"]),
  key: z.string().min(1),
  value: z.number().optional(),
});

export const conditionSchema = z.lazy(() => z.union([
  conditionLeaf,
  z.object({ all: z.array(conditionSchema).min(1) }),
  z.object({ any: z.array(conditionSchema).min(1) }),
  z.object({ not: conditionSchema }),
]));

export const effectSchema = z.object({
  op: z.enum(["add_stat", "set_stat", "add_relationship", "set_relationship", "set_flag", "unset_flag", "add_item", "remove_item"]),
  key: z.string().min(1),
  value: z.number().optional(),
});

const missionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["main", "side", "hidden"]),
  title: z.string().min(1),
  description: z.string().min(1),
  unlockWhen: conditionSchema.optional(),
  completeWhen: conditionSchema,
  failWhen: conditionSchema.optional(),
  failurePenalty: z.array(effectSchema).default([]),
  rewardText: z.string().default(""),
});

export const roleplayPackSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  source: z.object({ chapterIds: z.array(z.string()), chapterRangeLabel: z.string(), analysisId: z.string().optional().nullable() }),
  player: z.object({ role: z.string().min(1), canonicalCharacterId: z.string().optional().nullable(), isOriginalCharacter: z.boolean(), loreRule: z.string() }),
  system: z.object({
    name: z.string().min(1), activationText: z.string(), mainMission: z.string().min(1), failureText: z.string(),
    personality: z.string().default("Lạnh lùng, ngắn gọn và chỉ cung cấp thông tin cần thiết."),
    reliability: z.number().min(0).max(100).default(100),
    deviationMessages: z.array(z.object({ threshold: z.number().min(0).max(100), message: z.string() })).default([]),
  }),
  missions: z.object({ main: missionSchema, side: z.array(missionSchema).max(3), hidden: z.array(missionSchema).max(2) }).optional(),
  stateSchema: z.object({
    stats: z.record(z.object({ initial: z.number(), min: z.number(), max: z.number() })),
    relationships: z.record(z.object({ initial: z.number(), min: z.number(), max: z.number() })),
    flags: z.array(z.string()),
    items: z.array(z.string()),
  }),
  startSceneId: z.string().min(1),
  scenes: z.array(z.object({
    id: z.string().min(1), title: z.string().default(""), text: z.string().min(1), systemMessage: z.string().default(""),
    mood: z.string().optional(), primaryCharacterId: z.string().optional().nullable(),
    choices: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), resultText: z.string().optional(), systemReaction: z.string().optional(), requires: conditionSchema.optional(), effects: z.array(effectSchema).default([]), next: z.string().nullable(), basedOnEventId: z.string().optional() })).min(3).max(4),
  })).min(1).max(30),
  endings: z.array(z.object({ id: z.string().min(1), type: z.enum(["HE", "NE", "BE", "SPECIAL", "HIDDEN"]), priority: z.number().int(), title: z.string(), text: z.string(), when: conditionSchema })).min(1),
  meta: z.object({ generatorVersion: z.string(), promptVersions: z.record(z.string()).default({}), provider: z.string().default(""), model: z.string().default("") }).default({ generatorVersion: "generator-v1", promptVersions: {}, provider: "", model: "" }),
});

export function parseRoleplayPack(value) {
  return roleplayPackSchema.parse(value);
}
