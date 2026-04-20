import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ImageBackground,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  fruitAssets,
  gameImages,
  juices,
  knives,
  missionTemplates,
  modes,
  seededLeaders,
  themes,
  type FruitId,
  type KnifeId,
  type ModeDef,
  type ModeId,
  type TargetKind,
} from "./data";
import { applyRewards, defaultSave, loadSave, saveGame, todayKey, type PlayerSave, xpForNext } from "./storage";

type Screen = "home" | "mode" | "game" | "store" | "progress" | "challenges" | "settings" | "leaderboard";

type Target = {
  id: string;
  kind: TargetKind;
  fruit: FruitId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
  hits: number;
  sliced?: boolean;
};

type TrailPoint = { x: number; y: number; t: number };
type Splash = { id: string; x: number; y: number; color: string; size: number; created: number };
type FloatingText = { id: string; x: number; y: number; label: string; color: string; created: number };

type RunStats = {
  score: number;
  combo: number;
  bestCombo: number;
  golden: number;
  sliced: number;
};

const gravity = 0.34;
const targetPool = 22;
const fruitIds: FruitId[] = ["apple", "watermelon", "orange", "pineapple", "banana"];

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(4, Math.min(100, value * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

function Pill({ label, tone = "dark" }: { label: string; tone?: "dark" | "gold" | "hot" | "cool" }) {
  const backgroundColor = tone === "gold" ? "rgba(255,215,106,0.16)" : tone === "hot" ? "rgba(255,77,125,0.16)" : tone === "cool" ? "rgba(97,232,255,0.15)" : "rgba(255,255,255,0.09)";
  const borderColor = tone === "gold" ? "rgba(255,215,106,0.42)" : tone === "hot" ? "rgba(255,77,125,0.42)" : tone === "cool" ? "rgba(97,232,255,0.38)" : "rgba(255,255,255,0.13)";
  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function ActionButton({ label, icon, onPress, variant = "primary", disabled = false }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; variant?: "primary" | "dark" | "danger"; disabled?: boolean }) {
  const bg = variant === "primary" ? "#D7FF48" : variant === "danger" ? "#FF3848" : "rgba(255,255,255,0.1)";
  const fg = variant === "primary" ? "#10210C" : "#FFFFFF";
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.actionButton, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Feather name={icon} color={fg} size={18} />
      <Text style={[styles.actionText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function GameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("home");
  const [save, setSave] = useState<PlayerSave>(defaultSave);
  const [selectedMode, setSelectedMode] = useState<ModeId>("free");
  const [targets, setTargets] = useState<Target[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [floating, setFloating] = useState<FloatingText[]>([]);
  const [run, setRun] = useState<RunStats>({ score: 0, combo: 0, bestCombo: 0, golden: 0, sliced: 0 });
  const [lives, setLives] = useState(3);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [power, setPower] = useState({ freeze: 1, magnet: 1, shield: 1, drone: 1 });
  const [active, setActive] = useState({ freezeUntil: 0, shield: false, droneUntil: 0, disabledUntil: 0 });
  const [rewardText, setRewardText] = useState<string | null>(null);
  const mode = modes.find((m) => m.id === selectedMode) ?? modes[0];
  const selectedKnife = knives.find((knife) => knife.id === save.selectedKnife) ?? knives[0];
  const selectedTheme = themes.find((theme) => theme.id === save.selectedTheme) ?? themes[0];
  const selectedJuice = juices.find((juice) => juice.id === save.selectedJuice) ?? juices[0];
  const saveRef = useRef(save);
  const targetsRef = useRef<Target[]>([]);
  const runRef = useRef(run);
  const livesRef = useRef(lives);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const gameOverRef = useRef(gameOver);
  const spawnRef = useRef(0);
  const droneRef = useRef(0);
  const poolCursor = useRef(0);

  useEffect(() => {
    loadSave().then((loaded) => {
      saveRef.current = loaded;
      setSave(loaded);
    });
  }, []);

  useEffect(() => { saveRef.current = save; saveGame(save); }, [save]);
  useEffect(() => { targetsRef.current = targets; }, [targets]);
  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const vibrate = useCallback((kind: "light" | "medium" | "heavy" | "success" | "warning") => {
    if (!saveRef.current.settings.vibration || Platform.OS === "web") return;
    if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === "warning") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(kind === "light" ? Haptics.ImpactFeedbackStyle.Light : kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const updateSave = useCallback((updater: (current: PlayerSave) => PlayerSave) => {
    setSave((current) => {
      const next = updater(current);
      saveRef.current = next;
      return next;
    });
  }, []);

  const claimDaily = useCallback(() => {
    const today = todayKey();
    if (save.dailyRewardDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextStreak = save.dailyRewardDate === yesterday ? save.streak + 1 : 1;
    const reward = 140 + Math.min(7, nextStreak) * 35;
    updateSave((current) => ({ ...current, coins: current.coins + reward, dailyRewardDate: today, streak: nextStreak }));
    setRewardText(`Daily reward collected: ${reward} coins`);
    vibrate("success");
  }, [save.dailyRewardDate, save.streak, updateSave, vibrate]);

  const spawnTarget = useCallback((currentMode: ModeDef) => {
    const safeTop = Math.max(70, insets.top + 30);
    const usableHeight = height - insets.bottom - safeTop;
    const baseX = 36 + Math.random() * Math.max(1, width - 72);
    const direction = baseX < width / 2 ? 1 : -1;
    const hazardRoll = Math.random();
    const fruit = fruitIds[Math.floor(Math.random() * fruitIds.length)];
    let kind: TargetKind = "fruit";
    if (hazardRoll < currentMode.hazardChance) {
      const hazardTypes: TargetKind[] = currentMode.id === "free" ? ["bomb"] : ["bomb", "fake", "armored", "electric"];
      kind = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
    } else if (Math.random() < (currentMode.id === "epic" || currentMode.id === "legend" ? 0.12 : 0.06)) {
      kind = Math.random() > 0.45 ? "golden" : "mystery";
    }
    const size = kind === "bomb" ? 56 : kind === "armored" ? 70 : 62 + Math.random() * 22;
    const next: Target = {
      id: id(),
      kind,
      fruit,
      x: baseX,
      y: height + size,
      vx: direction * (1.2 + Math.random() * 2.4) * currentMode.speed,
      vy: -(10.5 + Math.random() * 5.4) * currentMode.speed * (saveRef.current.settings.difficultyAssist ? 0.9 : 1),
      size,
      rotation: Math.random() * 360,
      vr: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 7),
      hits: kind === "armored" ? 2 : 1,
    };
    setTargets((items) => {
      const activeItems = items.filter((item) => !item.sliced && item.y < height + 140);
      if (activeItems.length >= targetPool) {
        const copy = [...activeItems];
        copy[poolCursor.current % copy.length] = next;
        poolCursor.current += 1;
        return copy;
      }
      return [...activeItems, next];
    });
  }, [height, insets.bottom, insets.top, width]);

  const resetRun = useCallback((nextMode: ModeId = selectedMode) => {
    const config = modes.find((m) => m.id === nextMode) ?? modes[0];
    const extraLives = saveRef.current.skills.extraLife;
    setTargets([]);
    setTrail([]);
    setSplashes([]);
    setFloating([]);
    setRun({ score: 0, combo: 0, bestCombo: 0, golden: 0, sliced: 0 });
    setLives(config.startingLives + extraLives);
    setPower({ freeze: 1, magnet: 1, shield: 1, drone: 1 });
    setActive({ freezeUntil: 0, shield: false, droneUntil: 0, disabledUntil: 0 });
    setPaused(false);
    setGameOver(false);
    setRewardText(null);
    spawnRef.current = 0;
    droneRef.current = 0;
    setSelectedMode(nextMode);
    setScreen("game");
    vibrate("medium");
  }, [selectedMode, vibrate]);

  const endRun = useCallback((reason: string) => {
    if (gameOverRef.current) return;
    setGameOver(true);
    setPaused(false);
    setFloating((items) => [...items, { id: id(), x: width / 2, y: height * 0.34, label: reason, color: "#FF4D7D", created: Date.now() }]);
    const result = applyRewards(saveRef.current, runRef.current.score, selectedMode, runRef.current.bestCombo, runRef.current.golden);
    updateSave(() => result.save);
    setRewardText(`Run rewards: ${result.coinsEarned} coins earned`);
    vibrate("warning");
  }, [height, selectedMode, updateSave, vibrate, width]);

  const loseLifeOrEnd = useCallback((reason: string) => {
    if (selectedMode === "free") {
      endRun(reason);
      return;
    }
    const nextLives = livesRef.current - 1;
    setLives(nextLives);
    vibrate("warning");
    if (nextLives <= 0 || selectedMode === "legend") endRun(reason);
  }, [endRun, selectedMode, vibrate]);

  const addSplash = useCallback((x: number, y: number, color: string, size: number, label?: string) => {
    const created = Date.now();
    setSplashes((items) => [...items.slice(-24), { id: id(), x, y, color, size, created }]);
    if (label) setFloating((items) => [...items.slice(-12), { id: id(), x, y, label, color, created }]);
  }, []);

  const sliceTarget = useCallback((target: Target, speed: number, length: number, angle: number) => {
    if (target.sliced || gameOverRef.current) return;
    if (Date.now() < activeRef.current.disabledUntil) return;
    if (target.kind === "bomb") {
      if (activeRef.current.shield) {
        setActive((state) => ({ ...state, shield: false }));
        setTargets((items) => items.filter((item) => item.id !== target.id));
        addSplash(target.x, target.y, "#61E8FF", target.size * 1.25, "Shield Block");
        vibrate("heavy");
      } else {
        addSplash(target.x, target.y, "#FF3848", target.size * 1.5, "Bomb Hit");
        loseLifeOrEnd("Bomb strike");
      }
      return;
    }
    if (target.kind === "fake") {
      setTargets((items) => items.filter((item) => item.id !== target.id));
      addSplash(target.x, target.y, "#8A8F98", target.size, "Fake fruit penalty");
      loseLifeOrEnd("Fake fruit penalty");
      return;
    }
    if (target.kind === "electric") {
      setActive((state) => ({ ...state, disabledUntil: Date.now() + 1250 }));
      addSplash(target.x, target.y, "#FAFF6A", target.size * 1.25, "Blade disabled");
    }
    if (target.kind === "armored" && target.hits > 1) {
      setTargets((items) => items.map((item) => item.id === target.id ? { ...item, hits: item.hits - 1, vx: -item.vx * 0.6, vy: item.vy - 2 } : item));
      addSplash(target.x, target.y, "#D9E1E8", target.size * 0.9, "Armor cracked");
      vibrate("medium");
      return;
    }
    const fruitDef = fruitAssets[target.fruit];
    const now = Date.now();
    const comboWindow = 1100 + saveRef.current.skills.combo * 260;
    const currentCombo = runRef.current.combo > 0 && now - (trail[trail.length - 1]?.t ?? now) < comboWindow ? runRef.current.combo + 1 : runRef.current.combo + 1;
    const speedBonus = Math.min(3.2, Math.max(1, speed / 600));
    const lengthBonus = Math.min(1.8, Math.max(1, length / 130));
    const angleBonus = Math.abs(Math.sin(angle)) > 0.72 ? 1.2 : 1;
    const kindBonus = target.kind === "golden" ? 6 : target.kind === "mystery" ? 2.2 : 1;
    const gained = Math.round(10 * mode.scoreMultiplier * speedBonus * lengthBonus * angleBonus * kindBonus * Math.max(1, currentCombo / 4));
    const juiceColor = saveRef.current.settings.colorblind ? selectedJuice.color : target.kind === "golden" ? "#FFD76A" : fruitDef.splash;
    setTargets((items) => items.filter((item) => item.id !== target.id));
    setRun((stats) => ({
      score: stats.score + gained,
      combo: currentCombo,
      bestCombo: Math.max(stats.bestCombo, currentCombo),
      golden: stats.golden + (target.kind === "golden" ? 1 : 0),
      sliced: stats.sliced + 1,
    }));
    addSplash(target.x, target.y, juiceColor, target.size * (target.kind === "golden" ? 1.55 : 1.12), `+${gained}`);
    if (target.kind === "mystery") {
      const roll = Math.random();
      if (roll < 0.3) setActive((state) => ({ ...state, freezeUntil: Date.now() + 2600 }));
      else if (roll < 0.55) setActive((state) => ({ ...state, shield: true }));
      else if (roll < 0.8) setPower((state) => ({ ...state, drone: state.drone + 1 }));
      else updateSave((current) => ({ ...current, coins: current.coins + 80 }));
    }
    if (saveRef.current.settings.vibration) vibrate(currentCombo % 8 === 0 ? "heavy" : "light");
  }, [addSplash, loseLifeOrEnd, mode.scoreMultiplier, selectedJuice.color, trail, updateSave, vibrate]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !pausedRef.current && !gameOverRef.current,
    onMoveShouldSetPanResponder: () => !pausedRef.current && !gameOverRef.current,
    onPanResponderGrant: (evt) => {
      const point = { x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY, t: Date.now() };
      setTrail([point]);
    },
    onPanResponderMove: (evt) => {
      if (pausedRef.current || gameOverRef.current) return;
      const now = Date.now();
      const point = { x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY, t: now };
      setTrail((items) => {
        const last = items[items.length - 1] ?? point;
        const dt = Math.max(1, point.t - last.t);
        const length = Math.hypot(point.x - last.x, point.y - last.y);
        const speed = (length / dt) * 1000;
        const angle = Math.atan2(point.y - last.y, point.x - last.x);
        if (length > 5) {
          targetsRef.current.forEach((target) => {
            const distance = distanceToSegment(target.x, target.y, last.x, last.y, point.x, point.y);
            if (distance <= target.size * 0.62) sliceTarget(target, speed, length, angle);
          });
        }
        return [...items.slice(-9), point];
      });
    },
    onPanResponderRelease: () => {
      setTimeout(() => setTrail([]), 140);
    },
  }), [sliceTarget]);

  useEffect(() => {
    if (screen !== "game") return;
    let frame = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(34, now - last);
      last = now;
      if (!pausedRef.current && !gameOverRef.current) {
        const freeze = now < activeRef.current.freezeUntil;
        const speedScale = freeze ? 0.22 : 1;
        spawnRef.current += dt;
        const spawnEvery = mode.spawnMs * (saveRef.current.settings.difficultyAssist ? 1.15 : 1);
        if (spawnRef.current >= spawnEvery) {
          spawnRef.current = 0;
          spawnTarget(mode);
          if (mode.id === "epic" || mode.id === "legend") setTimeout(() => spawnTarget(mode), 120);
        }
        if (now < activeRef.current.droneUntil && now - droneRef.current > 620) {
          droneRef.current = now;
          const target = targetsRef.current.find((item) => item.kind !== "bomb" && item.kind !== "fake");
          if (target) sliceTarget(target, 900, 140, Math.PI / 4);
        }
        setTargets((items) => items
          .map((item) => {
            const magnetPull = power.magnet === 0 && item.kind !== "bomb" && item.kind !== "fake" ? (width / 2 - item.x) * 0.006 : 0;
            return {
              ...item,
              x: item.x + (item.vx + magnetPull) * speedScale,
              y: item.y + item.vy * speedScale,
              vy: item.vy + gravity * speedScale,
              rotation: item.rotation + item.vr * speedScale,
            };
          })
          .filter((item) => item.y < height + 150 && item.x > -130 && item.x < width + 130));
        setSplashes((items) => items.filter((item) => now - item.created < 900));
        setFloating((items) => items.filter((item) => now - item.created < 1100));
        setTrail((items) => items.filter((item) => now - item.t < 240));
        if (runRef.current.combo > 0 && trail.length === 0) {
          setRun((stats) => stats.combo > 0 ? { ...stats, combo: Math.max(0, stats.combo - 1) } : stats);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [height, mode, power.magnet, screen, sliceTarget, spawnTarget, trail.length, width]);

  const activatePower = useCallback((kind: "freeze" | "magnet" | "shield" | "drone") => {
    if (power[kind] <= 0 || gameOver || paused) return;
    setPower((state) => ({ ...state, [kind]: state[kind] - 1 }));
    if (kind === "freeze") setActive((state) => ({ ...state, freezeUntil: Date.now() + 3800 }));
    if (kind === "magnet") setTimeout(() => setPower((state) => ({ ...state, magnet: state.magnet })), 2800);
    if (kind === "shield") setActive((state) => ({ ...state, shield: true }));
    if (kind === "drone") setActive((state) => ({ ...state, droneUntil: Date.now() + 5400 }));
    vibrate("success");
  }, [gameOver, paused, power, vibrate]);

  const buyKnife = useCallback((knife: KnifeId) => {
    const item = knives.find((entry) => entry.id === knife);
    if (!item) return;
    if (save.ownedKnives.includes(knife)) {
      updateSave((current) => ({ ...current, selectedKnife: knife }));
      return;
    }
    if (save.level < item.unlockLevel || save.coins < item.price) return;
    updateSave((current) => ({ ...current, coins: current.coins - item.price, ownedKnives: [...current.ownedKnives, knife], selectedKnife: knife }));
    vibrate("success");
  }, [save.coins, save.level, save.ownedKnives, updateSave, vibrate]);

  const upgradeSkill = useCallback((skill: keyof PlayerSave["skills"]) => {
    const current = save.skills[skill];
    const cost = 220 + current * 180;
    if (current >= 5 || save.coins < cost) return;
    updateSave((data) => ({ ...data, coins: data.coins - cost, skills: { ...data.skills, [skill]: current + 1 } }));
    vibrate("success");
  }, [save.coins, save.skills, updateSave, vibrate]);

  const setThemeOrJuice = useCallback((kind: "theme" | "juice", value: string, unlockLevel: number) => {
    if (save.level < unlockLevel) return;
    updateSave((current) => kind === "theme" ? { ...current, selectedTheme: value as PlayerSave["selectedTheme"] } : { ...current, selectedJuice: value as PlayerSave["selectedJuice"] });
  }, [save.level, updateSave]);

  const renderHome = () => {
    const xpNeeded = xpForNext(save.level);
    const dailyReady = save.dailyRewardDate !== todayKey();
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.kicker}>Fruit Blade Arena</Text>
              <Text style={styles.title}>Slice fast. Never fear falling fruit.</Text>
            </View>
            <Image source={gameImages.knife} style={styles.heroKnife} contentFit="contain" />
          </View>
          <Text style={styles.developed}>Developed by Apon</Text>
          <View style={styles.heroStats}>
            <StatCard label="Best" value={`${save.bestScore}`} accent="#D7FF48" />
            <StatCard label="Coins" value={`${save.coins}`} accent="#FFD76A" />
            <StatCard label="Level" value={`${save.level}`} accent="#61E8FF" />
          </View>
          <ProgressBar value={save.xp / xpNeeded} color="#D7FF48" />
          <Text style={styles.mutedText}>{save.xp} / {xpNeeded} XP to next level</Text>
          <View style={styles.buttonRow}>
            <ActionButton label="Play" icon="play" onPress={() => setScreen("mode")} />
            <ActionButton label="Daily" icon="gift" onPress={claimDaily} variant={dailyReady ? "dark" : "primary"} disabled={!dailyReady} />
          </View>
        </View>
        {rewardText ? <Text style={styles.rewardText}>{rewardText}</Text> : null}
        <View style={styles.gridTwo}>
          <MenuTile icon="shopping-bag" title="Store" text="Knives and effects" onPress={() => setScreen("store")} />
          <MenuTile icon="trending-up" title="Skills" text="XP, upgrades, unlocks" onPress={() => setScreen("progress")} />
          <MenuTile icon="target" title="Missions" text="Daily goals and rewards" onPress={() => setScreen("challenges")} />
          <MenuTile icon="bar-chart-2" title="Leaderboard" text="Global-style ranks" onPress={() => setScreen("leaderboard")} />
          <MenuTile icon="sliders" title="Access" text="Controls and difficulty" onPress={() => setScreen("settings")} />
          <MenuTile icon="zap" title="Loadout" text={selectedKnife.name} onPress={() => setScreen("store")} />
        </View>
      </ScrollView>
    );
  };

  const MenuTile = ({ icon, title, text, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; text: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuTile, { opacity: pressed ? 0.74 : 1 }]}>
      <View style={styles.tileIcon}><Feather name={icon} color="#D7FF48" size={22} /></View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileText}>{text}</Text>
    </Pressable>
  );

  const renderModes = () => (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
      <Header title="Choose Mode" onBack={() => setScreen("home")} />
      {modes.map((entry) => (
        <Pressable key={entry.id} onPress={() => resetRun(entry.id)} style={({ pressed }) => [styles.modeCard, { opacity: pressed ? 0.78 : 1 }]}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>{entry.name}</Text>
            <Pill label={`${entry.scoreMultiplier}x rewards`} tone={entry.id === "legend" ? "hot" : entry.id === "epic" ? "gold" : "cool"} />
          </View>
          <Text style={styles.modeText}>{entry.description}</Text>
          <Text style={styles.ruleText}>{entry.rule}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderGame = () => {
    const now = Date.now();
    const disabled = now < active.disabledUntil;
    const freezeOn = now < active.freezeUntil;
    const droneOn = now < active.droneUntil;
    return (
      <View style={styles.gameRoot} {...panResponder.panHandlers}>
        <LinearGradient colors={[selectedTheme.colors[0], selectedTheme.colors[1]]} style={StyleSheet.absoluteFill} />
        <ImageBackground source={gameImages.background} resizeMode="cover" style={StyleSheet.absoluteFill} imageStyle={{ opacity: 0.22 }} />
        <View style={[styles.gameHud, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) }]} pointerEvents="box-none">
          <View style={styles.hudTop}>
            <Pressable onPress={() => setPaused(true)} style={styles.roundButton}><Feather name="pause" color="#FFFFFF" size={19} /></Pressable>
            <View style={styles.scoreBlock}>
              <Text style={styles.score}>{run.score}</Text>
              <Text style={styles.scoreLabel}>{mode.name} · combo {run.combo}x</Text>
            </View>
            <View style={styles.livesBox}>
              <Feather name="shield" color={active.shield ? "#61E8FF" : "#FF4D7D"} size={16} />
              <Text style={styles.livesText}>{selectedMode === "free" ? "SAFE" : lives}</Text>
            </View>
          </View>
          <View style={[styles.comboBar, { opacity: run.combo > 1 ? 1 : 0.35 }]}><ProgressBar value={Math.min(1, run.combo / 18)} color={selectedKnife.colors[1]} /></View>
          <View style={[styles.powerRail, save.settings.leftHanded ? styles.powerRailLeft : styles.powerRailRight]} pointerEvents="box-none">
            <PowerButton icon="snowflake" label="Freeze" count={power.freeze} active={freezeOn} onPress={() => activatePower("freeze")} />
            <PowerButton icon="magnet" label="Magnet" count={power.magnet} active={power.magnet === 0} onPress={() => activatePower("magnet")} />
            <PowerButton icon="shield" label="Shield" count={power.shield} active={active.shield} onPress={() => activatePower("shield")} />
            <PowerButton icon="crosshair" label="Drone" count={power.drone} active={droneOn} onPress={() => activatePower("drone")} />
          </View>
        </View>
        {targets.map((target) => {
          const source = target.kind === "bomb" ? gameImages.bomb : target.kind === "golden" ? gameImages.golden : fruitAssets[target.fruit].source;
          const opacity = target.kind === "fake" ? 0.48 : 1;
          return (
            <View key={target.id} style={[styles.target, { width: target.size, height: target.size, left: target.x - target.size / 2, top: target.y - target.size / 2, transform: [{ rotate: `${target.rotation}deg` }, { scale: target.kind === "electric" ? 1.04 : 1 }] }]}>
              <Image source={source} style={[styles.targetImage, { opacity }]} contentFit="contain" />
              {target.kind === "armored" ? <View style={styles.armorRing}><Text style={styles.armorText}>{target.hits}</Text></View> : null}
              {target.kind === "electric" ? <View style={styles.electricRing} /> : null}
            </View>
          );
        })}
        {splashes.map((splash) => {
          const age = Date.now() - splash.created;
          return <View key={splash.id} style={[styles.splash, { left: splash.x - splash.size / 2, top: splash.y - splash.size / 2, width: splash.size, height: splash.size, borderRadius: splash.size / 2, backgroundColor: splash.color, opacity: Math.max(0, 0.42 - age / 2200), transform: [{ scale: 1 + age / 650 }] }]} />;
        })}
        {trail.map((point, index) => {
          const next = trail[index + 1];
          if (!next) return null;
          const length = Math.hypot(next.x - point.x, next.y - point.y);
          const angle = Math.atan2(next.y - point.y, next.x - point.x);
          return <LinearGradient key={`${point.t}-${index}`} colors={selectedKnife.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.bladeTrail, { width: length, left: point.x, top: point.y, transform: [{ rotate: `${angle}rad` }], opacity: disabled ? 0.22 : 0.95 }]} />;
        })}
        {trail.length > 0 ? <Image source={gameImages.knife} style={[styles.knifeCursor, { left: trail[trail.length - 1].x - 28, top: trail[trail.length - 1].y - 24 }]} contentFit="contain" /> : null}
        {floating.map((item) => {
          const age = Date.now() - item.created;
          return <Text key={item.id} style={[styles.floatText, { left: item.x - 58, top: item.y - 30 - age / 18, color: item.color, opacity: Math.max(0, 1 - age / 1050) }]}>{item.label}</Text>;
        })}
        {disabled ? <View pointerEvents="none" style={styles.disabledBanner}><Feather name="zap-off" color="#10140A" size={18} /><Text style={styles.disabledText}>Blade disabled</Text></View> : null}
        {paused ? <Overlay title="Paused" text="Your run is held. Falling fruit still never costs lives." primary="Resume" onPrimary={() => setPaused(false)} secondary="Quit" onSecondary={() => { setScreen("home"); setPaused(false); }} /> : null}
        {gameOver ? <Overlay title="Run Complete" text={rewardText ?? "Rewards saved locally."} primary="Play Again" onPrimary={() => resetRun(selectedMode)} secondary="Home" onSecondary={() => setScreen("home")} stats={[`Score ${run.score}`, `Best combo ${run.bestCombo}x`, `Fruit sliced ${run.sliced}`]} /> : null}
      </View>
    );
  };

  const PowerButton = ({ icon, label, count, active: isActive, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; count: number; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.powerButton, { opacity: count <= 0 && !isActive ? 0.44 : pressed ? 0.72 : 1, borderColor: isActive ? "#D7FF48" : "rgba(255,255,255,0.14)" }]}>
      <MaterialCommunityIcons name={icon} color={isActive ? "#D7FF48" : "#FFFFFF"} size={19} />
      <Text style={styles.powerLabel}>{label}</Text>
      <Text style={styles.powerCount}>{isActive ? "ON" : count}</Text>
    </Pressable>
  );

  const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} style={styles.roundButton}><Feather name="chevron-left" color="#FFFFFF" size={22} /></Pressable>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.coinPill}><Feather name="disc" color="#FFD76A" size={15} /><Text style={styles.coinText}>{save.coins}</Text></View>
    </View>
  );

  const renderStore = () => (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
      <Header title="Knives & Store" onBack={() => setScreen("home")} />
      {knives.map((knife) => {
        const owned = save.ownedKnives.includes(knife.id);
        const locked = save.level < knife.unlockLevel;
        return (
          <Pressable key={knife.id} onPress={() => buyKnife(knife.id)} style={styles.storeCard}>
            <LinearGradient colors={knife.colors} style={styles.knifeGlow} />
            <Image source={gameImages.knife} style={styles.storeKnife} contentFit="contain" />
            <View style={styles.storeInfo}>
              <Text style={styles.cardTitle}>{knife.name}</Text>
              <Text style={styles.cardText}>{knife.effect}</Text>
              <View style={styles.rowWrap}>
                <Pill label={owned ? (save.selectedKnife === knife.id ? "Equipped" : "Owned") : `${knife.price} coins`} tone={owned ? "cool" : "gold"} />
                <Pill label={`Level ${knife.unlockLevel}`} tone={locked ? "hot" : "dark"} />
              </View>
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.subheading}>Juice Splash Colors</Text>
      <View style={styles.optionGrid}>{juices.map((juice) => <Pressable key={juice.id} onPress={() => setThemeOrJuice("juice", juice.id, juice.unlockLevel)} style={[styles.swatchCard, save.selectedJuice === juice.id && styles.selectedOutline]}><View style={[styles.swatch, { backgroundColor: juice.color }]} /><Text style={styles.swatchTitle}>{juice.name}</Text><Text style={styles.swatchText}>Level {juice.unlockLevel}</Text></Pressable>)}</View>
      <Text style={styles.subheading}>Background Themes</Text>
      <View style={styles.optionGrid}>{themes.map((theme) => <Pressable key={theme.id} onPress={() => setThemeOrJuice("theme", theme.id, theme.unlockLevel)} style={[styles.swatchCard, save.selectedTheme === theme.id && styles.selectedOutline]}><LinearGradient colors={theme.colors} style={styles.swatch} /><Text style={styles.swatchTitle}>{theme.name}</Text><Text style={styles.swatchText}>Level {theme.unlockLevel}</Text></Pressable>)}</View>
    </ScrollView>
  );

  const renderProgress = () => {
    const xpNeeded = xpForNext(save.level);
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
        <Header title="Progression" onBack={() => setScreen("home")} />
        <View style={styles.panel}>
          <Text style={styles.cardTitle}>Level {save.level}</Text>
          <ProgressBar value={save.xp / xpNeeded} color="#61E8FF" />
          <Text style={styles.cardText}>{save.xp} / {xpNeeded} XP. Level-ups award coins and unlock effects.</Text>
        </View>
        {([
          ["combo", "Combo Duration", "Keeps high multipliers alive longer"],
          ["slowMo", "Slow-Motion Chance", "Mystery fruit can trigger stronger slow moments"],
          ["extraLife", "Extra Life", "Adds lives to pressure modes"],
        ] as const).map(([key, title, text]) => {
          const value = save.skills[key];
          const cost = 220 + value * 180;
          return <View key={key} style={styles.skillCard}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text><ProgressBar value={value / 5} color="#D7FF48" /></View><ActionButton label={value >= 5 ? "Max" : `${cost}`} icon="arrow-up" onPress={() => upgradeSkill(key)} variant="dark" disabled={value >= 5 || save.coins < cost} /></View>;
        })}
        <Text style={styles.subheading}>Achievements</Text>
        <View style={styles.rowWrap}>{["First Thousand", "Combo Artist", "Legend Initiate", "Rising Master"].map((achievement) => <Pill key={achievement} label={save.achievements.includes(achievement) ? achievement : `Locked: ${achievement}`} tone={save.achievements.includes(achievement) ? "gold" : "dark"} />)}</View>
      </ScrollView>
    );
  };

  const renderChallenges = () => (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
      <Header title="Missions" onBack={() => setScreen("home")} />
      <View style={styles.panel}><Text style={styles.cardTitle}>Streak Rewards</Text><Text style={styles.cardText}>Current streak: {save.streak} day{save.streak === 1 ? "" : "s"}. Daily rewards grow for the first week.</Text><ActionButton label={save.dailyRewardDate === todayKey() ? "Collected" : "Claim Daily"} icon="gift" onPress={claimDaily} disabled={save.dailyRewardDate === todayKey()} /></View>
      {missionTemplates.map((mission) => {
        const progress = save.missions[mission.id] ?? 0;
        const complete = progress >= mission.target;
        return <View key={mission.id} style={styles.missionCard}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{mission.title}</Text><Text style={styles.cardText}>Reward: {mission.reward} coins</Text><ProgressBar value={progress / mission.target} color={complete ? "#D7FF48" : "#FF9B45"} /></View><Pill label={complete ? "Complete" : `${progress}/${mission.target}`} tone={complete ? "gold" : "dark"} /></View>;
      })}
    </ScrollView>
  );

  const renderLeaderboard = () => {
    const board = [...seededLeaders, ...save.leaderboard].sort((a, b) => b.score - a.score).slice(0, 10);
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
        <Header title="Leaderboard" onBack={() => setScreen("home")} />
        <View style={styles.panel}><Text style={styles.cardTitle}>Global Challenge Board</Text><Text style={styles.cardText}>Your scores join the current device board with seeded world rivals for instant competition.</Text></View>
        {board.map((entry, index) => <View key={`${entry.name}-${entry.score}-${index}`} style={styles.rankRow}><Text style={styles.rankNumber}>{index + 1}</Text><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{entry.name}</Text><Text style={styles.cardText}>{entry.mode}</Text></View><Text style={styles.rankScore}>{entry.score}</Text></View>)}
      </ScrollView>
    );
  };

  const Toggle = ({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={styles.toggleRow}>
      <Text style={styles.cardTitle}>{label}</Text>
      <View style={[styles.toggle, value && styles.toggleOn]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></View>
    </Pressable>
  );

  const renderSettings = () => (
    <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18), paddingBottom: insets.bottom + 34 }]}>
      <Header title="Accessibility" onBack={() => setScreen("home")} />
      <Toggle label="Colorblind juice palette" value={save.settings.colorblind} onPress={() => updateSave((current) => ({ ...current, settings: { ...current.settings, colorblind: !current.settings.colorblind } }))} />
      <Toggle label="Left-handed HUD" value={save.settings.leftHanded} onPress={() => updateSave((current) => ({ ...current, settings: { ...current.settings, leftHanded: !current.settings.leftHanded } }))} />
      <Toggle label="Haptic feedback" value={save.settings.vibration} onPress={() => updateSave((current) => ({ ...current, settings: { ...current.settings, vibration: !current.settings.vibration } }))} />
      <Toggle label="Sound controls" value={save.settings.sound} onPress={() => updateSave((current) => ({ ...current, settings: { ...current.settings, sound: !current.settings.sound } }))} />
      <Toggle label="Adjustable difficulty assist" value={save.settings.difficultyAssist} onPress={() => updateSave((current) => ({ ...current, settings: { ...current.settings, difficultyAssist: !current.settings.difficultyAssist } }))} />
      <View style={styles.panel}><Text style={styles.cardTitle}>Fair Play Rule</Text><Text style={styles.cardText}>Fruit falling off screen never causes a loss. Only bombs, fake fruits, or mode hazards can end a run.</Text></View>
    </ScrollView>
  );

  const Overlay = ({ title, text, primary, secondary, onPrimary, onSecondary, stats }: { title: string; text: string; primary: string; secondary: string; onPrimary: () => void; onSecondary: () => void; stats?: string[] }) => (
    <View style={styles.overlay}>
      <View style={styles.overlayCard}>
        <Text style={styles.overlayTitle}>{title}</Text>
        <Text style={styles.overlayText}>{text}</Text>
        {stats ? <View style={styles.rowWrap}>{stats.map((stat) => <Pill key={stat} label={stat} tone="cool" />)}</View> : null}
        <View style={styles.buttonRow}><ActionButton label={primary} icon="play" onPress={onPrimary} /><ActionButton label={secondary} icon="home" onPress={onSecondary} variant="dark" /></View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      {screen !== "game" ? <LinearGradient colors={[selectedTheme.colors[0], selectedTheme.colors[1], "#050A07"]} style={StyleSheet.absoluteFill} /> : null}
      {screen === "home" ? renderHome() : null}
      {screen === "mode" ? renderModes() : null}
      {screen === "game" ? renderGame() : null}
      {screen === "store" ? renderStore() : null}
      {screen === "progress" ? renderProgress() : null}
      {screen === "challenges" ? renderChallenges() : null}
      {screen === "leaderboard" ? renderLeaderboard() : null}
      {screen === "settings" ? renderSettings() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, gap: 16 },
  heroPanel: { borderRadius: 34, padding: 20, backgroundColor: "rgba(8,19,13,0.78)", borderWidth: 1, borderColor: "rgba(215,255,72,0.2)", overflow: "hidden", gap: 14 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  kicker: { color: "#D7FF48", fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase", fontSize: 12 },
  title: { color: "#FFFFFF", fontWeight: "700", fontSize: 38, lineHeight: 42, maxWidth: 265 },
  developed: { color: "#FFD76A", fontWeight: "700", fontSize: 15 },
  heroKnife: { width: 94, height: 94, transform: [{ rotate: "-32deg" }] },
  heroStats: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 19, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  statValue: { fontWeight: "700", fontSize: 22 },
  statLabel: { color: "#A8C7AD", fontWeight: "500", fontSize: 11, marginTop: 2 },
  progressTrack: { height: 9, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99 },
  mutedText: { color: "#A8C7AD", fontWeight: "500", fontSize: 13 },
  rewardText: { color: "#D7FF48", fontWeight: "700", textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  actionButton: { minHeight: 48, paddingHorizontal: 17, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  actionText: { fontWeight: "700", fontSize: 14 },
  gridTwo: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  menuTile: { width: "48%", minHeight: 132, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 24, padding: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", gap: 8 },
  tileIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: "rgba(215,255,72,0.12)", alignItems: "center", justifyContent: "center" },
  tileTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 17 },
  tileText: { color: "#A8C7AD", fontWeight: "500", fontSize: 12, lineHeight: 17 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  sectionTitle: { flex: 1, color: "#FFFFFF", fontWeight: "700", fontSize: 27 },
  coinPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: "rgba(255,215,106,0.14)", borderWidth: 1, borderColor: "rgba(255,215,106,0.28)" },
  coinText: { color: "#FFD76A", fontWeight: "700" },
  modeCard: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 26, padding: 18, gap: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  modeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  modeTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 22 },
  modeText: { color: "#DCEBDC", fontWeight: "500", fontSize: 14, lineHeight: 20 },
  ruleText: { color: "#D7FF48", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  pillText: { color: "#FFFFFF", fontWeight: "700", fontSize: 11 },
  gameRoot: { flex: 1, overflow: "hidden" },
  gameHud: { position: "absolute", zIndex: 20, left: 0, right: 0, paddingHorizontal: 14, gap: 8 },
  hudTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  scoreBlock: { flex: 1, alignItems: "center" },
  score: { color: "#FFFFFF", fontWeight: "700", fontSize: 38, lineHeight: 40 },
  scoreLabel: { color: "#D7FF48", fontWeight: "600", fontSize: 12 },
  livesBox: { minWidth: 72, height: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  livesText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  comboBar: { paddingHorizontal: 62 },
  powerRail: { position: "absolute", top: 150, gap: 9 },
  powerRailRight: { right: 12 },
  powerRailLeft: { left: 12 },
  powerButton: { width: 74, paddingVertical: 9, borderRadius: 18, backgroundColor: "rgba(5,10,7,0.72)", borderWidth: 1, alignItems: "center", gap: 2 },
  powerLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "600" },
  powerCount: { color: "#D7FF48", fontSize: 11, fontWeight: "700" },
  target: { position: "absolute", alignItems: "center", justifyContent: "center", zIndex: 5 },
  targetImage: { width: "100%", height: "100%" },
  armorRing: { position: "absolute", inset: -4, borderRadius: 80, borderWidth: 3, borderColor: "rgba(217,225,232,0.8)", alignItems: "center", justifyContent: "center" },
  armorText: { color: "#FFFFFF", fontWeight: "700", textShadowColor: "#000", textShadowRadius: 5 },
  electricRing: { position: "absolute", inset: -6, borderRadius: 80, borderWidth: 3, borderColor: "#FAFF6A" },
  splash: { position: "absolute", zIndex: 3 },
  bladeTrail: { position: "absolute", height: 8, borderRadius: 4, zIndex: 16, shadowColor: "#FFFFFF", shadowOpacity: 0.8, shadowRadius: 12 },
  knifeCursor: { position: "absolute", width: 56, height: 56, zIndex: 18, transform: [{ rotate: "-38deg" }] },
  floatText: { position: "absolute", width: 116, textAlign: "center", fontWeight: "700", fontSize: 16, zIndex: 30, textShadowColor: "#000", textShadowRadius: 8 },
  disabledBanner: { position: "absolute", top: "48%", alignSelf: "center", zIndex: 40, backgroundColor: "#FAFF6A", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  disabledText: { color: "#10140A", fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  overlayCard: { width: "100%", maxWidth: 430, backgroundColor: "rgba(12,25,17,0.96)", borderRadius: 32, padding: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", gap: 14 },
  overlayTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 32 },
  overlayText: { color: "#DCEBDC", fontWeight: "500", fontSize: 14, lineHeight: 20 },
  storeCard: { minHeight: 136, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 26, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden" },
  knifeGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, left: -36, opacity: 0.35 },
  storeKnife: { width: 84, height: 84, transform: [{ rotate: "-32deg" }] },
  storeInfo: { flex: 1, gap: 8 },
  cardTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 17 },
  cardText: { color: "#A8C7AD", fontWeight: "500", fontSize: 13, lineHeight: 18 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  subheading: { color: "#FFFFFF", fontWeight: "700", fontSize: 22, marginTop: 4 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatchCard: { width: "48%", padding: 12, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", gap: 8 },
  selectedOutline: { borderColor: "#D7FF48", borderWidth: 2 },
  swatch: { height: 52, borderRadius: 16 },
  swatchTitle: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  swatchText: { color: "#A8C7AD", fontWeight: "500", fontSize: 12 },
  panel: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 26, padding: 18, gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  skillCard: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", flexDirection: "row", gap: 12, alignItems: "center" },
  missionCard: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", flexDirection: "row", gap: 12, alignItems: "center" },
  rankRow: { minHeight: 76, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 22, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 14 },
  rankNumber: { width: 35, color: "#D7FF48", fontWeight: "700", fontSize: 22 },
  rankScore: { color: "#FFD76A", fontWeight: "700", fontSize: 18 },
  toggleRow: { height: 70, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 22, paddingHorizontal: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggle: { width: 58, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.13)", padding: 4 },
  toggleOn: { backgroundColor: "rgba(215,255,72,0.35)" },
  toggleKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF" },
  toggleKnobOn: { transform: [{ translateX: 24 }], backgroundColor: "#D7FF48" },
});
