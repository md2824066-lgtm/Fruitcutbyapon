import type { ImageSourcePropType } from "react-native";

export type ModeId = "free" | "classic" | "hard" | "epic" | "legend";
export type KnifeId = "steel" | "fire" | "ice" | "lightning" | "shadow";
export type ThemeId = "jungle" | "neon" | "frost" | "storm";
export type JuiceId = "berry" | "citrus" | "mint" | "gold";
export type FruitId = "apple" | "watermelon" | "orange" | "pineapple" | "banana";
export type TargetKind = "fruit" | "golden" | "mystery" | "bomb" | "fake" | "armored" | "electric";

export type FruitDef = {
  id: FruitId;
  name: string;
  source: ImageSourcePropType;
  splash: string;
};

export type KnifeDef = {
  id: KnifeId;
  name: string;
  price: number;
  effect: string;
  colors: string[];
  unlockLevel: number;
};

export type ModeDef = {
  id: ModeId;
  name: string;
  description: string;
  speed: number;
  spawnMs: number;
  hazardChance: number;
  scoreMultiplier: number;
  startingLives: number;
  rule: string;
};

export const fruitAssets: Record<FruitId, FruitDef> = {
  apple: { id: "apple", name: "Apple", source: require("../../assets/images/apple.png"), splash: "#FF4766" },
  watermelon: { id: "watermelon", name: "Watermelon", source: require("../../assets/images/watermelon.png"), splash: "#39E77A" },
  orange: { id: "orange", name: "Orange", source: require("../../assets/images/orange.png"), splash: "#FF9B2F" },
  pineapple: { id: "pineapple", name: "Pineapple", source: require("../../assets/images/pineapple.png"), splash: "#FFE05D" },
  banana: { id: "banana", name: "Banana", source: require("../../assets/images/banana.png"), splash: "#FFF176" },
};

export const gameImages = {
  knife: require("../../assets/images/knife.png"),
  bomb: require("../../assets/images/bomb.png"),
  golden: require("../../assets/images/golden-fruit.png"),
  background: require("../../assets/images/arena-bg.png"),
};

export const modes: ModeDef[] = [
  { id: "free", name: "Free Mode", description: "Endless slicing with no pressure. Fruits can fall safely.", speed: 0.9, spawnMs: 900, hazardChance: 0.03, scoreMultiplier: 1, startingLives: 99, rule: "No game over unless you hit a bomb without shield." },
  { id: "classic", name: "Classic", description: "Avoid bombs and penalty targets. Fruits falling never costs lives.", speed: 1, spawnMs: 780, hazardChance: 0.12, scoreMultiplier: 1.2, startingLives: 3, rule: "Bombs and fake fruits cost lives. Missed fruit is safe." },
  { id: "hard", name: "Hard", description: "Faster arcs, more hazards, tighter combo timing.", speed: 1.25, spawnMs: 650, hazardChance: 0.18, scoreMultiplier: 1.55, startingLives: 3, rule: "Bombs, fake fruits, and electrified hits are dangerous." },
  { id: "epic", name: "Epic", description: "Combo-heavy chaos with more golden and mystery fruit.", speed: 1.42, spawnMs: 560, hazardChance: 0.2, scoreMultiplier: 2, startingLives: 2, rule: "Stay aggressive. Combos multiply rewards." },
  { id: "legend", name: "Legend", description: "Extreme speed, elite hazards, huge rewards.", speed: 1.72, spawnMs: 455, hazardChance: 0.28, scoreMultiplier: 3, startingLives: 1, rule: "One unshielded bomb ends the run." },
];

export const knives: KnifeDef[] = [
  { id: "steel", name: "Steel Knife", price: 0, effect: "Balanced metallic trail", colors: ["#E9F7FF", "#83A7BE"], unlockLevel: 1 },
  { id: "fire", name: "Fire Knife", price: 450, effect: "Burning orange slice bursts", colors: ["#FFD36A", "#FF4B1F"], unlockLevel: 2 },
  { id: "ice", name: "Ice Knife", price: 650, effect: "Crystalline slow shimmer", colors: ["#DDFBFF", "#5EDCFF"], unlockLevel: 3 },
  { id: "lightning", name: "Lightning Knife", price: 900, effect: "Electric combo sparks", colors: ["#FAFF6A", "#7DFFFD"], unlockLevel: 5 },
  { id: "shadow", name: "Shadow Knife", price: 1200, effect: "Dark violet afterimage", colors: ["#17122A", "#B892FF"], unlockLevel: 7 },
];

export const themes: { id: ThemeId; name: string; unlockLevel: number; colors: string[] }[] = [
  { id: "jungle", name: "Neon Jungle", unlockLevel: 1, colors: ["#07140E", "#12341F"] },
  { id: "neon", name: "Juice City", unlockLevel: 4, colors: ["#090920", "#361052"] },
  { id: "frost", name: "Frozen Market", unlockLevel: 6, colors: ["#061622", "#14324D"] },
  { id: "storm", name: "Legend Storm", unlockLevel: 8, colors: ["#06070E", "#261145"] },
];

export const juices: { id: JuiceId; name: string; unlockLevel: number; color: string }[] = [
  { id: "berry", name: "Berry Red", unlockLevel: 1, color: "#FF4766" },
  { id: "citrus", name: "Citrus Glow", unlockLevel: 3, color: "#FFB238" },
  { id: "mint", name: "Mint Splash", unlockLevel: 5, color: "#52FFA8" },
  { id: "gold", name: "Royal Gold", unlockLevel: 7, color: "#FFD76A" },
];

export const missionTemplates = [
  { id: "combo12", title: "Land a 12x combo", reward: 90, target: 12 },
  { id: "golden3", title: "Slice 3 golden fruits", reward: 120, target: 3 },
  { id: "score1500", title: "Score 1,500 in one run", reward: 150, target: 1500 },
];

export const seededLeaders = [
  { name: "Apon", score: 9850, mode: "Legend" },
  { name: "Blade Fox", score: 8420, mode: "Epic" },
  { name: "Citrus Ace", score: 7210, mode: "Hard" },
  { name: "Neon Chef", score: 6680, mode: "Classic" },
];
