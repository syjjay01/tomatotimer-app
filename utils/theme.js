import { getUserStorage } from "./user-storage";

const APPEARANCE_CACHE_KEY = "fgb:lastAppearance";

const DEFAULT_SETTINGS = {
  colorScheme: "calmBlue",
  fontScale: 110,
  focusMinutes: 25,
  breakMinutes: 5,
};

const PALETTES = {
  focusGreen: {
    accent: "#2f9f5b",
    accentDeep: "#1f7c45",
    accentSoft: "#dff5e6",
    panel: "#ffffff",
    panelSoft: "#f4fbf6",
    text: "#183024",
    subtext: "#5e7668",
    border: "#d9eadf",
    bgStart: "#f1fbf5",
    bgEnd: "#f8f4ea",
  },
  energyOrange: {
    accent: "#ee7b2d",
    accentDeep: "#c55c11",
    accentSoft: "#ffe7d6",
    panel: "#ffffff",
    panelSoft: "#fff6ef",
    text: "#352111",
    subtext: "#7c6557",
    border: "#f3dfcf",
    bgStart: "#fff8ef",
    bgEnd: "#fff2e5",
  },
  calmBlue: {
    accent: "#2c76c9",
    accentDeep: "#185aab",
    accentSoft: "#dcecff",
    panel: "#ffffff",
    panelSoft: "#f3f8ff",
    text: "#13283d",
    subtext: "#5e7288",
    border: "#d9e6f5",
    bgStart: "#eef6ff",
    bgEnd: "#f6f8fb",
  },
};

export function getAppSettings() {
  const cachedAppearance = uni.getStorageSync(APPEARANCE_CACHE_KEY) || {};
  const saved = getUserStorage("timerSettings", {}) || {};
  const rawFontScale = Number(saved.fontScale ?? cachedAppearance.fontScale ?? DEFAULT_SETTINGS.fontScale);
  const fallbackBreak = Number(saved.shortBreakMinutes ?? saved.longBreakMinutes ?? DEFAULT_SETTINGS.breakMinutes);
  return {
    ...DEFAULT_SETTINGS,
    ...(typeof cachedAppearance === "object" ? cachedAppearance : {}),
    ...saved,
    colorScheme: saved.colorScheme || cachedAppearance.colorScheme || DEFAULT_SETTINGS.colorScheme,
    fontScale: normalizeFontScale(rawFontScale),
    focusMinutes: clampNumber(saved.focusMinutes, DEFAULT_SETTINGS.focusMinutes, 5, 60),
    breakMinutes: clampNumber(saved.breakMinutes, fallbackBreak, 1, 10),
  };
}

export function getThemeVars(settings = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
  const palette = PALETTES[merged.colorScheme] || PALETTES.calmBlue;
  return {
    "--accent": palette.accent,
    "--accent-deep": palette.accentDeep,
    "--accent-soft": palette.accentSoft,
    "--panel": palette.panel,
    "--panel-soft": palette.panelSoft,
    "--text-main": palette.text,
    "--text-sub": palette.subtext,
    "--border-soft": palette.border,
    "--bg-start": palette.bgStart,
    "--bg-end": palette.bgEnd,
    "--font-scale": String(normalizeFontScale(merged.fontScale) / 100),
  };
}

export function getPaletteLabel(colorScheme) {
  if (colorScheme === "energyOrange") return "\u6d3b\u529b\u6a59";
  if (colorScheme === "focusGreen") return "\u4e13\u6ce8\u7eff";
  return "\u9759\u8c27\u84dd";
}

export function cacheAppearanceSettings(settings = {}) {
  const payload = {
    colorScheme: settings.colorScheme || DEFAULT_SETTINGS.colorScheme,
    fontScale: normalizeFontScale(settings.fontScale),
  };
  uni.setStorageSync(APPEARANCE_CACHE_KEY, payload);
}

function normalizeFontScale(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS.fontScale;
  const options = [100, 110, 120];
  let closest = options[0];
  let minDiff = Math.abs(num - closest);
  options.forEach((item) => {
    const diff = Math.abs(num - item);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  });
  return closest;
}

function clampNumber(raw, fallback, min, max) {
  const base = Number.isFinite(Number(raw)) ? Number(raw) : Number(fallback);
  if (base < min) return min;
  if (base > max) return max;
  return Math.floor(base);
}
