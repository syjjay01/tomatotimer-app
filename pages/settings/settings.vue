<template>
  <view class="page" :style="themeVars">
    <view class="hero">
      <view>
        <text class="eyebrow">我的</text>
        <text class="headline">{{ currentUsername || "未登录" }}</text>
      </view>
      <view class="account-actions">
        <text class="action-link" @tap="logout">退出</text>
        <text class="action-link danger" @tap="deleteAccount">注销</text>
      </view>
    </view>

    <view class="card">
      <text class="group-title">计时设置</text>
      <view class="field-row">
        <text class="field-label">专注时长</text>
        <input class="number-input" type="number" v-model="form.focusMinutes" @blur="normalizeNumber('focusMinutes', 25, 1, 180)" />
      </view>
      <view class="field-row">
        <text class="field-label">短休息时长</text>
        <input class="number-input" type="number" v-model="form.shortBreakMinutes" @blur="normalizeNumber('shortBreakMinutes', 5, 1, 60)" />
      </view>
      <view class="field-row">
        <text class="field-label">长休息时长</text>
        <input class="number-input" type="number" v-model="form.longBreakMinutes" @blur="normalizeNumber('longBreakMinutes', 15, 1, 120)" />
      </view>
      <view class="field-row last">
        <text class="field-label">自动进入下一个阶段</text>
        <switch :checked="form.autoNextStage" color="#2f9f5b" @change="onSwitch('autoNextStage', $event)" />
      </view>
    </view>

    <view class="card">
      <text class="group-title">目标与提醒</text>
      <view class="field-row">
        <text class="field-label">每日目标番茄数</text>
        <input class="number-input" type="number" v-model="form.dailyGoal" @blur="normalizeNumber('dailyGoal', 8, 1, 99)" />
      </view>
      <view class="field-row">
        <text class="field-label">结束铃声</text>
        <switch :checked="form.finishBellEnabled" color="#2f9f5b" @change="onSwitch('finishBellEnabled', $event)" />
      </view>
      <view class="field-row last">
        <text class="field-label">通知提醒</text>
        <switch :checked="form.notificationEnabled" color="#2f9f5b" @change="onSwitch('notificationEnabled', $event)" />
      </view>
    </view>

    <view class="card">
      <text class="group-title">外观</text>
      <text class="group-desc">选择你更喜欢的情绪色调，页面会立即切换。</text>
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
        <text class="font-value">{{ form.fontScale }}%</text>
      </view>
      <slider :value="form.fontScale" :min="85" :max="120" :step="5" activeColor="#2f9f5b" @change="onFontScaleChange" />
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { deleteCurrentUser, getCurrentUser, logoutUser } from "../../utils/auth";
import { clearCurrentUserScopedData, getUserStorage, setUserStorage } from "../../utils/user-storage";
import { ensureLogin } from "../../utils/guard";
import { getAppSettings, getThemeVars } from "../../utils/theme";

const SETTINGS_KEY = "timerSettings";
const DEFAULT_FORM = {
  focusMinutes: "25",
  shortBreakMinutes: "5",
  longBreakMinutes: "15",
  autoNextStage: false,
  dailyGoal: "8",
  finishBellEnabled: true,
  notificationEnabled: true,
  colorScheme: "focusGreen",
  fontScale: 100,
};

const colorSchemes = [
  { label: "专注绿", value: "focusGreen", colors: ["#2f9f5b", "#dff5e6", "#f1fbf5"] },
  { label: "活力橙", value: "energyOrange", colors: ["#ee7b2d", "#ffe7d6", "#fff4ea"] },
  { label: "静谧蓝", value: "calmBlue", colors: ["#2c76c9", "#dcecff", "#eef6ff"] },
];

const form = ref({ ...DEFAULT_FORM });
const currentUsername = ref("");
const themeVars = ref(getThemeVars(getAppSettings()));

function loadSettings() {
  const saved = getUserStorage(SETTINGS_KEY, {}) || {};
  form.value = {
    ...DEFAULT_FORM,
    ...saved,
    focusMinutes: String(saved.focusMinutes ?? DEFAULT_FORM.focusMinutes),
    shortBreakMinutes: String(saved.shortBreakMinutes ?? DEFAULT_FORM.shortBreakMinutes),
    longBreakMinutes: String(saved.longBreakMinutes ?? DEFAULT_FORM.longBreakMinutes),
    dailyGoal: String(saved.dailyGoal ?? DEFAULT_FORM.dailyGoal),
    fontScale: Number(saved.fontScale ?? DEFAULT_FORM.fontScale),
  };
  themeVars.value = getThemeVars(form.value);
}

function persistSettings() {
  const payload = {
    focusMinutes: Number(form.value.focusMinutes || 25),
    shortBreakMinutes: Number(form.value.shortBreakMinutes || 5),
    longBreakMinutes: Number(form.value.longBreakMinutes || 15),
    autoNextStage: Boolean(form.value.autoNextStage),
    dailyGoal: Number(form.value.dailyGoal || 8),
    finishBellEnabled: Boolean(form.value.finishBellEnabled),
    notificationEnabled: Boolean(form.value.notificationEnabled),
    colorScheme: form.value.colorScheme || "focusGreen",
    fontScale: Number(form.value.fontScale || 100),
  };
  setUserStorage(SETTINGS_KEY, payload);
  themeVars.value = getThemeVars(payload);
}

function normalizeNumber(field, fallback, min, max) {
  let safe = Number(form.value[field]);
  safe = Number.isFinite(safe) ? safe : fallback;
  if (safe < min) safe = min;
  if (safe > max) safe = max;
  form.value[field] = String(Math.floor(safe));
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

function onFontScaleChange(event) {
  form.value.fontScale = Number(event?.detail?.value ?? 100);
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

onShow(() => {
  if (!ensureLogin()) return;
  currentUsername.value = getCurrentUser()?.username || "";
  loadSettings();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(24rpx + env(safe-area-inset-top)) 24rpx 40rpx;
  box-sizing: border-box;
  background: linear-gradient(165deg, var(--bg-start) 0%, var(--bg-end) 100%);
}

.hero,
.card {
  background: var(--panel);
  box-shadow: 0 18rpx 44rpx rgba(22, 41, 31, 0.08);
}

.hero {
  border-radius: 34rpx;
  padding: 24rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.eyebrow {
  display: block;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.headline {
  display: block;
  margin-top: 10rpx;
  font-size: calc(40rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.account-actions {
  display: flex;
  gap: 18rpx;
}

.action-link {
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
  color: var(--accent-deep);
}

.action-link.danger {
  color: #c84e3d;
}

.card {
  margin-top: 18rpx;
  border-radius: 28rpx;
  padding: 22rpx;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--border-soft);
}

.field-row.last {
  border-bottom: none;
}

.field-label,
.font-value {
  font-size: calc(26rpx * var(--font-scale));
  color: var(--text-main);
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
  display: flex;
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
</style>
