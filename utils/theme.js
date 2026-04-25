import { getUserStorage } from "./user-storage";

const DEFAULT_SETTINGS = {
  colorScheme: "focusGreen",
  fontScale: 100,
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
  const saved = getUserStorage("timerSettings", {}) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    fontScale: Number(saved.fontScale ?? DEFAULT_SETTINGS.fontScale),
  };
}

export function getThemeVars(settings = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
  const palette = PALETTES[merged.colorScheme] || PALETTES.focusGreen;
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
    "--font-scale": String(Math.max(0.85, Math.min(1.2, merged.fontScale / 100))),
  };
}

export function getPaletteLabel(colorScheme) {
  if (colorScheme === "energyOrange") return "活力橙";
  if (colorScheme === "calmBlue") return "静谧蓝";
  return "专注绿";
}
