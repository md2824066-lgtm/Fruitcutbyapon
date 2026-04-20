import AsyncStorage from "@react-native-async-storage/async-storage";
import { missionTemplates, type JuiceId, type KnifeId, type ModeId, type ThemeId } from "./data";

const SAVE_KEY = "fruit-blade-arena-save-v1";

export type PlayerSave = {
  coins: number;
  xp: number;
  level: number;
  bestScore: number;
  selectedKnife: KnifeId;
  ownedKnives: KnifeId[];
  selectedTheme: ThemeId;
  selectedJuice: JuiceId;
  skills: {
    combo: number;
    slowMo: number;
    extraLife: number;
  };
  settings: {
    colorblind: boolean;
    leftHanded: boolean;
    vibration: boolean;
    sound: boolean;
    difficultyAssist: boolean;
  };
  missions: Record<string, number>;
  achievements: string[];
  dailyRewardDate: string;
  streak: number;
  leaderboard: { name: string; score: number; mode: string }[];
  runs: number;
};

export const defaultSave: PlayerSave = {
  coins: 360,
  xp: 0,
  level: 1,
  bestScore: 0,
  selectedKnife: "steel",
  ownedKnives: ["steel"],
  selectedTheme: "jungle",
  selectedJuice: "berry",
  skills: { combo: 1, slowMo: 0, extraLife: 0 },
  settings: {
    colorblind: false,
    leftHanded: false,
    vibration: true,
    sound: true,
    difficultyAssist: false,
  },
  missions: Object.fromEntries(missionTemplates.map((mission) => [mission.id, 0])),
  achievements: [],
  dailyRewardDate: "",
  streak: 0,
  leaderboard: [],
  runs: 0,
};

export async function loadSave(): Promise<PlayerSave> {
  const raw = await AsyncStorage.getItem(SAVE_KEY);
  if (!raw) return defaultSave;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSave>;
    return {
      ...defaultSave,
      ...parsed,
      ownedKnives: parsed.ownedKnives?.length ? parsed.ownedKnives : defaultSave.ownedKnives,
      skills: { ...defaultSave.skills, ...parsed.skills },
      settings: { ...defaultSave.settings, ...parsed.settings },
      missions: { ...defaultSave.missions, ...parsed.missions },
    };
  } catch {
    return defaultSave;
  }
}

export async function saveGame(data: PlayerSave) {
  await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function xpForNext(level: number) {
  return 420 + level * 180;
}

export function applyRewards(save: PlayerSave, score: number, mode: ModeId, combo: number, golden: number) {
  const coinsEarned = Math.max(20, Math.floor(score / 18));
  let next = {
    ...save,
    coins: save.coins + coinsEarned,
    xp: save.xp + Math.floor(score / 9) + combo * 8,
    bestScore: Math.max(save.bestScore, score),
    runs: save.runs + 1,
    missions: { ...save.missions },
    leaderboard: [{ name: "You", score, mode }, ...save.leaderboard].sort((a, b) => b.score - a.score).slice(0, 8),
  };

  next.missions.combo12 = Math.max(next.missions.combo12 ?? 0, combo);
  next.missions.golden3 = Math.max(next.missions.golden3 ?? 0, golden);
  next.missions.score1500 = Math.max(next.missions.score1500 ?? 0, score);

  let needed = xpForNext(next.level);
  while (next.xp >= needed) {
    next = { ...next, xp: next.xp - needed, level: next.level + 1, coins: next.coins + 160 };
    needed = xpForNext(next.level);
  }

  const achievements = new Set(next.achievements);
  if (score >= 1000) achievements.add("First Thousand");
  if (combo >= 15) achievements.add("Combo Artist");
  if (mode === "legend" && score >= 2500) achievements.add("Legend Initiate");
  if (next.level >= 5) achievements.add("Rising Master");
  next.achievements = [...achievements];
  return { save: next, coinsEarned };
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
