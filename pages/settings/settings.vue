<template>
  <view class="page" :style="themeVars">
    <view class="safe-top" :style="{ height: `${statusBarHeight}px` }"></view>

    <view class="top-fixed">
      <view class="hero">
        <text class="eyebrow">我的</text>
        <view class="account-row">
          <text class="headline">{{ currentUsername || "未登录" }}</text>
          <view class="account-actions">
            <button class="mini-btn" @tap="logout">退出</button>
            <button class="mini-btn danger" @tap="deleteAccount">注销</button>
          </view>
        </view>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y>
      <view class="content-inner">
        <view class="card">
          <text class="group-title">番茄钟设置</text>
          <view class="field-row">
            <text class="field-label">专注时长</text>
            <view class="stepper">
              <text class="step-btn" :class="{ disabled: !canAdjustFocus(-1) }" @tap="adjustFocus(-1)">-</text>
              <text class="step-value">{{ form.focusMinutes }} 分钟</text>
              <text class="step-btn" :class="{ disabled: !canAdjustFocus(1) }" @tap="adjustFocus(1)">+</text>
            </view>
          </view>
          <view class="field-row">
            <text class="field-label">休息时长</text>
            <view class="stepper">
              <text class="step-btn" :class="{ disabled: !canAdjustBreak(-1) }" @tap="adjustBreak(-1)">-</text>
              <text class="step-value">{{ form.breakMinutes }} 分钟</text>
              <text class="step-btn" :class="{ disabled: !canAdjustBreak(1) }" @tap="adjustBreak(1)">+</text>
            </view>
          </view>
          <view class="field-row last">
            <text class="field-label">自动进入下一个番茄钟</text>
            <switch :checked="form.autoNextStage" :color="themeVars['--accent']" @change="onSwitch('autoNextStage', $event)" />
          </view>
        </view>

        <view class="card">
          <text class="group-title">目标与提醒</text>
          <view class="field-row">
            <text class="field-label">每日目标番茄数</text>
            <input class="number-input" type="number" v-model="form.dailyGoal" @blur="normalizeNumber('dailyGoal', 8, 1, 99)" />
          </view>
          <view class="field-row last">
            <text class="field-label">结束铃声</text>
            <switch :checked="form.finishBellEnabled" :color="themeVars['--accent']" @change="onSwitch('finishBellEnabled', $event)" />
          </view>
        </view>

        <view class="card">
          <text class="group-title">外观</text>
          <text class="group-desc">选择你喜欢的风格，页面会立即切换。</text>
          <view class="scheme-grid">
            <view v-for="item in colorSchemes" :key="item.value" class="scheme-card" :class="{ active: form.colorScheme === item.value }" @tap="selectScheme(item.value)">
              <view class="scheme-swatches">
                <view class="swatch" :style="{ background: item.colors[0] }"></view>
                <view class="swatch" :style="{ background: item.colors[1] }"></view>
                <view class="swatch" :style="{ background: item.colors[2] }"></view>
              </view>
              <text class="scheme-name">{{ item.label }}</text>
            </view>
          </view>

          <view class="font-row">
            <text class="field-label">字体大小</text>
          </view>
          <view class="font-options">
            <text
              v-for="item in fontScaleOptions"
              :key="item.value"
              class="font-pill"
              :class="{ active: form.fontScale === item.value }"
              @tap="selectFontScale(item.value)"
            >
              {{ item.label }}
            </text>
          </view>
        </view>

        <text class="version-text">V1.0.0</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { deleteCurrentUser, getCurrentUser, logoutUser } from "../../utils/auth";
import { clearCurrentUserScopedData, getUserStorage, setUserStorage } from "../../utils/user-storage";
import { ensureLogin } from "../../utils/guard";
import { cacheAppearanceSettings, getAppSettings, getThemeVars } from "../../utils/theme";

const SETTINGS_KEY = "timerSettings";
const FOCUS_MIN = 5;
const FOCUS_MAX = 60;
const FOCUS_STEP = 5;
const BREAK_MIN = 1;
const BREAK_MAX = 10;
const BREAK_STEP = 1;

const DEFAULT_FORM = {
  focusMinutes: 25,
  breakMinutes: 5,
  autoNextStage: false,
  dailyGoal: "8",
  finishBellEnabled: true,
  colorScheme: "calmBlue",
  fontScale: 110,
};

const colorSchemes = [
  { label: "静谧蓝", value: "calmBlue", colors: ["#2c76c9", "#dcecff", "#eef6ff"] },
  { label: "专注绿", value: "focusGreen", colors: ["#2f9f5b", "#dff5e6", "#f1fbf5"] },
  { label: "活力橙", value: "energyOrange", colors: ["#ee7b2d", "#ffe7d6", "#fff4ea"] },
];

const fontScaleOptions = [
  { label: "小", value: 100 },
  { label: "中", value: 110 },
  { label: "大", value: 120 },
];

const form = ref({ ...DEFAULT_FORM });
const currentUsername = ref("");
const themeVars = ref(getThemeVars(getAppSettings()));
const statusBarHeight = ref(0);

function loadSettings() {
  const saved = getUserStorage(SETTINGS_KEY, {}) || {};
  const legacyBreak = Number(saved.shortBreakMinutes ?? saved.longBreakMinutes ?? DEFAULT_FORM.breakMinutes);
  form.value = {
    ...DEFAULT_FORM,
    ...saved,
    focusMinutes: clampNumber(saved.focusMinutes, DEFAULT_FORM.focusMinutes, FOCUS_MIN, FOCUS_MAX),
    breakMinutes: clampNumber(saved.breakMinutes, legacyBreak, BREAK_MIN, BREAK_MAX),
    dailyGoal: String(clampNumber(saved.dailyGoal, DEFAULT_FORM.dailyGoal, 1, 99)),
    colorScheme: saved.colorScheme || DEFAULT_FORM.colorScheme,
    fontScale: normalizeFontScale(saved.fontScale),
  };
  themeVars.value = getThemeVars(form.value);
  cacheAppearanceSettings(form.value);
}

function persistSettings() {
  const payload = {
    focusMinutes: clampNumber(form.value.focusMinutes, DEFAULT_FORM.focusMinutes, FOCUS_MIN, FOCUS_MAX),
    breakMinutes: clampNumber(form.value.breakMinutes, DEFAULT_FORM.breakMinutes, BREAK_MIN, BREAK_MAX),
    shortBreakMinutes: clampNumber(form.value.breakMinutes, DEFAULT_FORM.breakMinutes, BREAK_MIN, BREAK_MAX),
    longBreakMinutes: clampNumber(form.value.breakMinutes, DEFAULT_FORM.breakMinutes, BREAK_MIN, BREAK_MAX),
    autoNextStage: Boolean(form.value.autoNextStage),
    dailyGoal: clampNumber(form.value.dailyGoal, DEFAULT_FORM.dailyGoal, 1, 99),
    finishBellEnabled: Boolean(form.value.finishBellEnabled),
    colorScheme: form.value.colorScheme || DEFAULT_FORM.colorScheme,
    fontScale: normalizeFontScale(form.value.fontScale),
  };
  form.value.focusMinutes = payload.focusMinutes;
  form.value.breakMinutes = payload.breakMinutes;
  form.value.dailyGoal = String(payload.dailyGoal);
  form.value.fontScale = payload.fontScale;
  setUserStorage(SETTINGS_KEY, payload);
  cacheAppearanceSettings(payload);
  themeVars.value = getThemeVars(payload);
}

function normalizeNumber(field, fallback, min, max) {
  form.value[field] = String(clampNumber(form.value[field], fallback, min, max));
  persistSettings();
}

function canAdjustFocus(direction) {
  const next = Number(form.value.focusMinutes || 0) + direction * FOCUS_STEP;
  return next >= FOCUS_MIN && next <= FOCUS_MAX;
}

function canAdjustBreak(direction) {
  const next = Number(form.value.breakMinutes || 0) + direction * BREAK_STEP;
  return next >= BREAK_MIN && next <= BREAK_MAX;
}

function adjustFocus(direction) {
  if (!canAdjustFocus(direction)) return;
  form.value.focusMinutes = Number(form.value.focusMinutes || 0) + direction * FOCUS_STEP;
  persistSettings();
}

function adjustBreak(direction) {
  if (!canAdjustBreak(direction)) return;
  form.value.breakMinutes = Number(form.value.breakMinutes || 0) + direction * BREAK_STEP;
  persistSettings();
}

function onSwitch(field, event) {
  form.value[field] = Boolean(event?.detail?.value);
  persistSettings();
}

function selectScheme(scheme) {
  form.value.colorScheme = scheme;
  persistSettings();
}

function selectFontScale(value) {
  form.value.fontScale = normalizeFontScale(value);
  persistSettings();
}

function logout() {
  logoutUser();
  uni.reLaunch({ url: "/pages/auth/auth" });
}

function deleteAccount() {
  uni.showModal({
    title: "注销账号",
    content: "会删除当前账号及其全部数据，确定继续吗？",
    confirmColor: "#d04a38",
    success: (res) => {
      if (!res.confirm) return;
      clearCurrentUserScopedData();
      const result = deleteCurrentUser();
      if (!result.ok) {
        uni.showToast({ title: result.message || "注销失败", icon: "none" });
        return;
      }
      uni.reLaunch({ url: "/pages/auth/auth" });
    },
  });
}

function normalizeFontScale(raw) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 110;
  if (num <= 105) return 100;
  if (num >= 115) return 120;
  return 110;
}

function clampNumber(raw, fallback, min, max) {
  const base = Number.isFinite(Number(raw)) ? Number(raw) : Number(fallback);
  if (base < min) return min;
  if (base > max) return max;
  return Math.floor(base);
}

onShow(() => {
  if (!ensureLogin()) return;
  const sysInfo = uni.getSystemInfoSync ? uni.getSystemInfoSync() : {};
  statusBarHeight.value = Math.max(0, Number(sysInfo?.statusBarHeight || 0));
  currentUsername.value = getCurrentUser()?.username || "";
  loadSettings();
});
</script>

<style scoped>
.page {
  height: 100vh;
  padding: 20rpx 24rpx calc(env(safe-area-inset-bottom) + 22rpx);
  box-sizing: border-box;
  background: linear-gradient(165deg, var(--bg-start) 0%, var(--bg-end) 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.safe-top {
  flex-shrink: 0;
}

.top-fixed {
  flex-shrink: 0;
}

.content-scroll {
  margin-top: 12rpx;
  flex: 1;
  min-height: 0;
}

.content-inner {
  padding-bottom: 8rpx;
}

.hero,
.card {
  background: var(--panel);
  box-shadow: 0 18rpx 44rpx rgba(22, 41, 31, 0.08);
}

.hero {
  border-radius: 34rpx;
  padding: 24rpx;
}

.account-row,
.field-row,
.font-row,
.stepper,
.font-options,
.scheme-swatches {
  display: flex;
  align-items: center;
}

.account-row,
.field-row,
.font-row {
  justify-content: space-between;
}

.account-row {
  margin-top: 12rpx;
  gap: 18rpx;
}

.eyebrow {
  display: block;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.headline {
  flex: 1;
  min-width: 0;
  font-size: calc(40rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.account-actions {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}

.mini-btn {
  min-width: 108rpx;
  height: 74rpx;
  line-height: 74rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 999rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
  text-align: center;
}

.mini-btn.danger {
  background: #ffe4df;
  color: #be4535;
}

.mini-btn::after {
  border: none;
}

.card {
  margin-top: 18rpx;
  border-radius: 28rpx;
  padding: 22rpx;
}

.content-inner .card:first-child {
  margin-top: 0;
}

.group-title {
  display: block;
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
  color: var(--text-main);
}

.group-desc {
  display: block;
  margin-top: 8rpx;
  font-size: calc(22rpx * var(--font-scale));
  line-height: 1.6;
  color: var(--text-sub);
}

.field-row,
.font-row {
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--border-soft);
}

.field-row.last {
  border-bottom: none;
}

.field-label {
  font-size: calc(26rpx * var(--font-scale));
  color: var(--text-main);
}

.stepper {
  gap: 14rpx;
}

.step-btn {
  width: 50rpx;
  height: 50rpx;
  border-radius: 14rpx;
  text-align: center;
  line-height: 50rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
}

.step-btn.disabled {
  opacity: 0.35;
}

.step-value {
  min-width: 130rpx;
  text-align: center;
  font-size: calc(24rpx * var(--font-scale));
  color: var(--text-main);
  font-weight: 700;
}

.number-input {
  width: 120rpx;
  text-align: right;
  font-size: calc(26rpx * var(--font-scale));
  color: var(--accent-deep);
}

.scheme-grid {
  margin-top: 18rpx;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
}

.scheme-card {
  padding: 16rpx;
  border-radius: 22rpx;
  background: var(--panel-soft);
  border: 2rpx solid transparent;
}

.scheme-card.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.9);
}

.scheme-swatches {
  gap: 8rpx;
}

.swatch {
  flex: 1;
  height: 48rpx;
  border-radius: 999rpx;
}

.scheme-name {
  display: block;
  margin-top: 12rpx;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-main);
  font-weight: 700;
}

.font-options {
  margin-top: 16rpx;
  gap: 12rpx;
}

.font-pill {
  flex: 1;
  padding: 16rpx 0;
  text-align: center;
  border-radius: 18rpx;
  background: #edf1ef;
  color: var(--text-sub);
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
}

.font-pill.active {
  background: var(--accent-soft);
  color: var(--accent-deep);
}

.version-text {
  display: block;
  margin: 22rpx 0 6rpx;
  text-align: center;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}
</style>
