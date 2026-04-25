<template>
  <view class="page" :style="themeVars">
    <view class="safe-top" :style="{ height: `${statusBarHeight}px` }"></view>

    <view class="top-fixed">
      <view class="hero-card">
        <view class="status-banner" @tap="toggleMode">
          <view class="status-main">
            <text class="eyebrow">当前状态</text>
            <view class="mode-row">
              <text class="mode">{{ currentMode.label }}</text>
              <text class="mode-emoji">{{ modeEmoji }}</text>
            </view>
          </view>
          <text class="cycle-badge">第{{ cycleIndex }}个番茄</text>
        </view>

        <view class="timer-ring" :style="ringStyle">
          <view class="timer-core">
            <text class="timer-text">{{ formattedTime }}</text>
            <text v-if="timerSubText" class="timer-sub">{{ timerSubText }}</text>
          </view>
        </view>

        <view class="timer-copy">
          <text class="copy-title">{{ statusPoem.title }}</text>
          <text class="copy-desc">{{ statusPoem.desc }}</text>
        </view>

        <view class="action-row">
          <button class="main-btn" @tap="toggleTimer">{{ isRunning ? "暂停" : "开始" }}</button>
          <button class="ghost-btn" @tap="resetTimer">重置</button>
        </view>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y>
      <view class="content-inner">
        <view class="card progress-card">
          <view class="section-head">
            <text class="section-title">今日进度</text>
            <text class="section-meta">{{ todayFocusCount }} / {{ dailyGoal }}</text>
          </view>
          <view class="progress-track"><view class="progress-fill" :style="{ width: `${todayProgress}%` }"></view></view>
        </view>

        <view class="card task-card" @tap="showTaskPopup = true">
          <view>
            <text class="section-title">任务关联</text>
            <text class="section-desc">可以独立专注，也可以把本次番茄绑定到任务。</text>
          </view>
          <text class="task-name">{{ selectedTaskName }}</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="showTaskPopup" class="sheet-mask" @tap="closeTaskPopup">
      <view class="sheet-panel" @tap.stop>
        <text class="sheet-title">选择任务</text>
        <view class="sheet-item featured" @tap="selectTask(null)">
          <text class="sheet-name">不关联任务</text>
          <text class="sheet-meta">本次专注按独立模式记录</text>
        </view>
        <scroll-view scroll-y class="sheet-list">
          <view v-for="todo in todos" :key="todo.id" class="sheet-item" @tap="selectTask(todo.id)">
            <text class="sheet-name">{{ todo.title || "未命名任务" }}</text>
            <text class="sheet-meta">已专注 {{ readTaskPomodoroCount(todo) }} 个番茄</text>
          </view>
          <view v-if="todos.length === 0" class="empty">暂无待办任务</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import { getUserStorage, setUserStorage } from "../../utils/user-storage";
import { ensureLogin } from "../../utils/guard";
import { getAppSettings, getThemeVars } from "../../utils/theme";

const STORAGE_KEYS = {
  todos: "todos",
  focusRecords: "focusRecords",
  timerSnapshot: "timerSnapshot",
};

const MODES = {
  focus: { key: "focus", label: "专注" },
  break: { key: "break", label: "休息" },
};

const currentModeKey = ref("focus");
const remainingSeconds = ref(25 * 60);
const sessionTotalSeconds = ref(25 * 60);
const isRunning = ref(false);
const startTimestamp = ref(null);
const expectedEndTimestamp = ref(null);
const timerId = ref(null);
const showTaskPopup = ref(false);
const todos = ref([]);
const selectedTaskId = ref(null);
const focusRecords = ref([]);
const timerSettings = ref(getAppSettings());
const themeVars = ref(getThemeVars(timerSettings.value));
const statusBarHeight = ref(0);

const currentMode = computed(() => MODES[currentModeKey.value] || MODES.focus);
const dailyGoal = computed(() => Number(timerSettings.value.dailyGoal || 8));
const cycleIndex = computed(() => todayFocusCount.value + 1);
const todayFocusCount = computed(() => focusRecords.value.filter((item) => item.dateKey === getDateKey(Date.now()) && item.mode === "focus").length);
const todayProgress = computed(() => (dailyGoal.value ? Math.min(100, Math.round((todayFocusCount.value / dailyGoal.value) * 100)) : 0));
const formattedTime = computed(() => `${`${Math.floor(remainingSeconds.value / 60)}`.padStart(2, "0")}:${`${remainingSeconds.value % 60}`.padStart(2, "0")}`);
const selectedTaskName = computed(() => {
  if (!selectedTaskId.value) return "独立模式";
  return todos.value.find((item) => item.id === selectedTaskId.value)?.title || "独立模式";
});
const timerSubText = computed(() => (currentModeKey.value === "focus" ? selectedTaskName.value : ""));
const modeEmoji = computed(() => (currentModeKey.value === "focus" ? "🍅" : "☕"));
const statusPoem = computed(() =>
  currentModeKey.value === "focus"
    ? {
        title: "让心沉下来，光会自己亮起来。🍅",
        desc: "专注的每一分钟，都是你写给未来的答案。",
      }
    : {
        title: "休息不是停下，是给灵感留白。☕",
        desc: "慢慢呼吸，把节奏调回最舒服的状态。",
      }
);
const countdownProgress = computed(() => {
  const total = Math.max(1, Number(sessionTotalSeconds.value || getModeDuration(currentModeKey.value)));
  return Math.max(0, Math.min(100, (remainingSeconds.value / total) * 100));
});
const ringStyle = computed(() => ({
  "--ring-progress": `${Math.max(0, Math.min(360, countdownProgress.value * 3.6))}deg`,
}));
const toneAudioContext = ref(null);

function normalizeModeKey(raw) {
  if (raw === "shortBreak" || raw === "longBreak" || raw === "break") return "break";
  return "focus";
}

function getModeDuration(modeKey) {
  const normalized = normalizeModeKey(modeKey);
  const breakMinutes = Number(timerSettings.value.breakMinutes ?? timerSettings.value.shortBreakMinutes ?? timerSettings.value.longBreakMinutes ?? 5);
  const map = {
    focus: Number(timerSettings.value.focusMinutes || 25) * 60,
    break: breakMinutes * 60,
  };
  return map[normalized] || 25 * 60;
}

function toggleMode() {
  const nextMode = currentModeKey.value === "focus" ? "break" : "focus";
  applyMode(nextMode, { autoStart: false, persist: true });
}

function toggleTimer() {
  if (isRunning.value) {
    pauseTimer();
    persistSnapshot();
    return;
  }
  startTimer();
  persistSnapshot();
}

function startTimer() {
  if (remainingSeconds.value <= 0) {
    remainingSeconds.value = getModeDuration(currentModeKey.value);
  }
  if (!Number.isFinite(Number(sessionTotalSeconds.value)) || sessionTotalSeconds.value < remainingSeconds.value) {
    sessionTotalSeconds.value = remainingSeconds.value;
  }
  isRunning.value = true;
  if (!startTimestamp.value) startTimestamp.value = Date.now();
  expectedEndTimestamp.value = Date.now() + remainingSeconds.value * 1000;
  runTick();
}

function pauseTimer() {
  isRunning.value = false;
  clearTick();
  expectedEndTimestamp.value = null;
}

function resetTimer() {
  pauseTimer();
  const duration = getModeDuration(currentModeKey.value);
  remainingSeconds.value = duration;
  sessionTotalSeconds.value = duration;
  startTimestamp.value = null;
  persistSnapshot();
}

function applyMode(modeKey, options = {}) {
  const normalized = normalizeModeKey(modeKey);
  const autoStart = options.autoStart === true;
  const shouldPersist = options.persist !== false;
  pauseTimer();
  currentModeKey.value = normalized;
  const duration = getModeDuration(normalized);
  remainingSeconds.value = duration;
  sessionTotalSeconds.value = duration;
  startTimestamp.value = null;
  if (autoStart) startTimer();
  if (shouldPersist) persistSnapshot();
}

function runTick() {
  clearTick();
  timerId.value = setInterval(() => {
    if (!expectedEndTimestamp.value) return;
    const left = Math.max(0, Math.ceil((expectedEndTimestamp.value - Date.now()) / 1000));
    remainingSeconds.value = left;
    if (left <= 0) finishSession();
  }, 250);
}

function clearTick() {
  if (!timerId.value) return;
  clearInterval(timerId.value);
  timerId.value = null;
}

function finishSession() {
  clearTick();
  isRunning.value = false;
  expectedEndTimestamp.value = null;
  const finishedMode = normalizeModeKey(currentModeKey.value);
  const finishedDuration = Number(sessionTotalSeconds.value || getModeDuration(finishedMode));
  remainingSeconds.value = 0;
  if (finishedMode === "focus") {
    persistFocusRecord(finishedDuration);
  }
  notifySessionFinished(finishedMode);

  if (finishedMode === "focus") {
    // 专注结束后，休息阶段总是自动开始
    applyMode("break", { autoStart: true, persist: true });
    return;
  }

  // 休息结束后，是否自动进入下一个专注，取决于设置开关
  const shouldAutoStartNextFocus = timerSettings.value.autoNextStage === true;
  applyMode("focus", { autoStart: shouldAutoStartNextFocus, persist: true });
}

function notifySessionFinished(modeKey) {
  const modeLabel = MODES[normalizeModeKey(modeKey)].label;
  uni.showToast({ title: `${modeLabel}结束`, icon: "none" });
  if (timerSettings.value.notificationEnabled !== false) {
    uni.vibrateLong({ fail: () => {} });
  }
  if (timerSettings.value.finishBellEnabled !== false) playSessionTone(modeKey);
}

function playSessionTone(modeKey) {
  stopSessionTone();
  const normalized = normalizeModeKey(modeKey);
  const src = normalized === "focus" ? "/static/audio/focus-end.wav" : "/static/audio/break-end.wav";
  try {
    const audio = uni.createInnerAudioContext();
    audio.autoplay = false;
    audio.loop = false;
    audio.src = src;
    audio.onEnded(() => stopSessionTone());
    audio.onError(() => {
      stopSessionTone();
      fallbackBell();
    });
    toneAudioContext.value = audio;
    audio.play();
  } catch (error) {
    fallbackBell();
  }
}

function stopSessionTone() {
  const audio = toneAudioContext.value;
  if (!audio) return;
  try {
    audio.stop();
  } catch (error) {}
  try {
    audio.destroy();
  } catch (error) {}
  toneAudioContext.value = null;
}

function fallbackBell() {
  try {
    if (typeof plus !== "undefined" && plus && plus.device && typeof plus.device.beep === "function") {
      plus.device.beep(1);
      return;
    }
  } catch (error) {}
  uni.vibrateShort({ fail: () => {} });
}

function selectTask(taskId) {
  selectedTaskId.value = taskId;
  showTaskPopup.value = false;
  persistSnapshot();
}

function closeTaskPopup() {
  showTaskPopup.value = false;
}

function persistFocusRecord(durationSeconds) {
  const finishedAt = Date.now();
  const safeDuration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0 ? Number(durationSeconds) : getModeDuration("focus");
  const record = {
    id: `${finishedAt}-${Math.random().toString(16).slice(2, 8)}`,
    mode: "focus",
    durationSeconds: safeDuration,
    startAt: startTimestamp.value || finishedAt - safeDuration * 1000,
    endAt: finishedAt,
    dateKey: getDateKey(finishedAt),
    taskId: selectedTaskId.value,
    taskTitle: selectedTaskId.value ? selectedTaskName.value : null,
  };
  const nextRecords = [...focusRecords.value, record];
  focusRecords.value = nextRecords;
  setUserStorage(STORAGE_KEYS.focusRecords, nextRecords);

  if (!selectedTaskId.value) return;
  const nextTodos = todos.value.map((todo) => {
    if (todo.id !== selectedTaskId.value) return todo;
    const nextCount = readTaskPomodoroCount(todo) + 1;
    return { ...todo, pomodoroCount: nextCount, tomatoCount: nextCount, focusCount: nextCount };
  });
  todos.value = nextTodos;
  setUserStorage(STORAGE_KEYS.todos, nextTodos);
}

function readTaskPomodoroCount(todo) {
  return Number(todo.pomodoroCount ?? todo.tomatoCount ?? todo.focusCount ?? 0);
}

function getDateKey(ts) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function getBootId() {
  if (typeof getApp !== "function") return "default-boot";
  const app = getApp();
  if (!app) return "default-boot";
  if (!app.globalData) app.globalData = {};
  if (!app.globalData.__fgbBootId) {
    app.globalData.__fgbBootId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
  return app.globalData.__fgbBootId;
}

function persistSnapshot() {
  setUserStorage(STORAGE_KEYS.timerSnapshot, {
    bootId: getBootId(),
    currentModeKey: currentModeKey.value,
    remainingSeconds: remainingSeconds.value,
    sessionTotalSeconds: sessionTotalSeconds.value,
    isRunning: isRunning.value,
    expectedEndTimestamp: expectedEndTimestamp.value,
    startTimestamp: startTimestamp.value,
    selectedTaskId: selectedTaskId.value,
  });
}

function resetToFocusInitial() {
  clearTick();
  isRunning.value = false;
  currentModeKey.value = "focus";
  const duration = getModeDuration("focus");
  remainingSeconds.value = duration;
  sessionTotalSeconds.value = duration;
  expectedEndTimestamp.value = null;
  startTimestamp.value = null;
}

function recoverSnapshot() {
  const snapshot = getUserStorage(STORAGE_KEYS.timerSnapshot, null);
  if (!snapshot || snapshot.bootId !== getBootId()) {
    // 进程被杀后重新进入，强制回到专注初始态
    resetToFocusInitial();
    persistSnapshot();
    return;
  }

  const restoredMode = normalizeModeKey(snapshot.currentModeKey);
  currentModeKey.value = restoredMode;
  const modeDuration = getModeDuration(restoredMode);
  const restoredTotal = Number(snapshot.sessionTotalSeconds);
  sessionTotalSeconds.value = Number.isFinite(restoredTotal) && restoredTotal > 0 ? restoredTotal : modeDuration;
  const restoredRemaining = Number(snapshot.remainingSeconds);
  remainingSeconds.value = Number.isFinite(restoredRemaining) ? Math.max(0, Math.min(restoredRemaining, sessionTotalSeconds.value)) : modeDuration;
  startTimestamp.value = Number.isFinite(Number(snapshot.startTimestamp)) ? Number(snapshot.startTimestamp) : null;
  if (snapshot.selectedTaskId !== undefined) selectedTaskId.value = snapshot.selectedTaskId;

  if (!snapshot.isRunning || !snapshot.expectedEndTimestamp) return;

  const left = Math.max(0, Math.ceil((Number(snapshot.expectedEndTimestamp) - Date.now()) / 1000));
  remainingSeconds.value = left;
  if (left > 0) {
    isRunning.value = true;
    expectedEndTimestamp.value = Date.now() + left * 1000;
    runTick();
    return;
  }
  finishSession();
}

function loadData() {
  timerSettings.value = getAppSettings();
  themeVars.value = getThemeVars(timerSettings.value);
  todos.value = getUserStorage(STORAGE_KEYS.todos, []) || [];
  focusRecords.value = getUserStorage(STORAGE_KEYS.focusRecords, []) || [];
}

onShow(() => {
  if (!ensureLogin()) return;
  const sysInfo = uni.getSystemInfoSync ? uni.getSystemInfoSync() : {};
  statusBarHeight.value = Math.max(0, Number(sysInfo?.statusBarHeight || 0));
  loadData();
  recoverSnapshot();
});

onHide(() => {
  if (isRunning.value && expectedEndTimestamp.value) {
    remainingSeconds.value = Math.max(0, Math.ceil((expectedEndTimestamp.value - Date.now()) / 1000));
  }
  clearTick();
  stopSessionTone();
  persistSnapshot();
});

onUnload(() => {
  clearTick();
  stopSessionTone();
  persistSnapshot();
});
</script>

<style scoped>
.page {
  height: 100vh;
  padding: 18rpx 24rpx calc(env(safe-area-inset-bottom) + 22rpx);
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

.hero-card,
.card,
.sheet-panel {
  background: var(--panel);
  border: 1rpx solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 18rpx 44rpx rgba(22, 41, 31, 0.08);
}

.hero-card {
  border-radius: 36rpx;
  padding: 24rpx 24rpx 26rpx;
  display: flex;
  flex-direction: column;
}

.section-head,
.task-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.status-banner {
  position: relative;
  width: 100%;
  padding: 20rpx 22rpx;
  border-radius: 26rpx;
  box-sizing: border-box;
  background: linear-gradient(135deg, var(--accent-soft) 0%, rgba(255, 255, 255, 0.96) 100%);
  border: 1rpx solid rgba(255, 255, 255, 0.72);
}

.status-main {
  min-height: 96rpx;
  padding-right: 200rpx;
}

.eyebrow {
  display: block;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.mode {
  display: inline-block;
  font-size: calc(48rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.mode-row {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
  gap: 8rpx;
}

.mode-emoji {
  font-size: calc(34rpx * var(--font-scale));
  opacity: 0.78;
}

.cycle-badge {
  position: absolute;
  right: 20rpx;
  top: 18rpx;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.72);
  border: 1rpx solid rgba(255, 255, 255, 0.92);
  color: var(--accent-deep);
  font-size: calc(22rpx * var(--font-scale));
  font-weight: 700;
}

.timer-ring {
  --ring-progress: 0deg;
  margin: 58rpx auto 0;
  width: 520rpx;
  height: 520rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(var(--accent) var(--ring-progress), #e5ecf2 0deg);
  box-shadow: 0 16rpx 44rpx rgba(34, 61, 86, 0.16);
}

.timer-core {
  width: 430rpx;
  height: 430rpx;
  border-radius: 50%;
  background: var(--panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 10rpx rgba(255, 255, 255, 0.9);
}

.timer-text {
  font-size: calc(86rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.timer-sub {
  margin-top: 10rpx;
  font-size: calc(24rpx * var(--font-scale));
  color: var(--text-sub);
}

.timer-copy {
  margin-top: 28rpx;
  text-align: center;
}

.copy-title {
  display: block;
  font-size: calc(28rpx * var(--font-scale));
  color: var(--text-main);
  font-weight: 700;
}

.copy-desc {
  display: block;
  margin-top: 10rpx;
  font-size: calc(22rpx * var(--font-scale));
  line-height: 1.6;
  color: var(--text-sub);
}

.action-row {
  margin-top: 30rpx;
  display: flex;
  gap: 18rpx;
}

.main-btn,
.ghost-btn {
  flex: 1;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 24rpx;
  font-size: calc(28rpx * var(--font-scale));
  font-weight: 700;
}

.main-btn {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%);
  color: #ffffff;
}

.ghost-btn {
  background: var(--panel-soft);
  color: var(--text-main);
}

.main-btn::after,
.ghost-btn::after {
  border: none;
}

.card {
  margin-top: 14rpx;
  border-radius: 28rpx;
  padding: 22rpx;
}

.content-inner .card:first-child {
  margin-top: 0;
}

.section-title {
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
  color: var(--text-main);
}

.section-meta,
.section-desc {
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.section-desc {
  display: block;
  margin-top: 8rpx;
  line-height: 1.55;
}

.progress-track {
  margin-top: 18rpx;
  height: 18rpx;
  border-radius: 999rpx;
  background: #ebf1eb;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-deep) 100%);
}

.task-name {
  max-width: 34%;
  text-align: right;
  font-size: calc(24rpx * var(--font-scale));
  color: var(--accent-deep);
  font-weight: 700;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(13, 19, 16, 0.28);
  display: flex;
  align-items: flex-end;
  z-index: 30;
}

.sheet-panel {
  width: 100%;
  border-radius: 32rpx 32rpx 0 0;
  padding: 24rpx;
  box-sizing: border-box;
}

.sheet-title {
  display: block;
  margin-bottom: 18rpx;
  font-size: calc(32rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.sheet-list {
  max-height: 50vh;
}

.sheet-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--border-soft);
}

.sheet-item.featured {
  padding-top: 6rpx;
}

.sheet-name {
  display: block;
  font-size: calc(28rpx * var(--font-scale));
  color: var(--text-main);
}

.sheet-meta,
.empty {
  display: block;
  margin-top: 8rpx;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}
</style>
