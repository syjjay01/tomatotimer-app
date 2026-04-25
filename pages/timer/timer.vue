<template>
  <view class="page" :style="themeVars">
    <view class="hero-card">
      <view class="hero-top">
        <view>
          <text class="eyebrow">当前模式</text>
          <text class="mode">{{ currentMode.label }}</text>
        </view>
        <view class="cycle-pill">第 {{ cycleIndex }} 个番茄</view>
      </view>

      <view class="timer-ring">
        <text class="timer-text">{{ formattedTime }}</text>
        <text class="timer-sub">{{ selectedTaskName }}</text>
      </view>

      <view class="action-row">
        <button class="main-btn" @tap="toggleTimer">{{ isRunning ? "暂停" : "开始" }}</button>
        <button class="ghost-btn" @tap="resetTimer">重置</button>
      </view>
    </view>

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
  timerSettings: "timerSettings",
  timerSnapshot: "timerSnapshot",
};

const MODES = {
  focus: { key: "focus", label: "专注" },
  shortBreak: { key: "shortBreak", label: "短休息" },
  longBreak: { key: "longBreak", label: "长休息" },
};

const currentModeKey = ref("focus");
const remainingSeconds = ref(25 * 60);
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

function getModeDuration(modeKey) {
  const map = {
    focus: Number(timerSettings.value.focusMinutes || 25) * 60,
    shortBreak: Number(timerSettings.value.shortBreakMinutes || 5) * 60,
    longBreak: Number(timerSettings.value.longBreakMinutes || 15) * 60,
  };
  return map[modeKey] || 25 * 60;
}

function toggleTimer() {
  if (isRunning.value) {
    pauseTimer();
    persistSnapshot();
    return;
  }
  if (remainingSeconds.value <= 0) remainingSeconds.value = getModeDuration(currentModeKey.value);
  isRunning.value = true;
  startTimestamp.value = Date.now();
  expectedEndTimestamp.value = Date.now() + remainingSeconds.value * 1000;
  runTick();
  persistSnapshot();
}

function pauseTimer() {
  isRunning.value = false;
  clearTick();
  expectedEndTimestamp.value = null;
}

function resetTimer() {
  pauseTimer();
  remainingSeconds.value = getModeDuration(currentModeKey.value);
  startTimestamp.value = null;
  persistSnapshot();
}

function runTick() {
  clearTick();
  timerId.value = setInterval(() => {
    if (!expectedEndTimestamp.value) return;
    const left = Math.max(0, Math.ceil((expectedEndTimestamp.value - Date.now()) / 1000));
    remainingSeconds.value = left;
    if (left <= 0) finishSession();
  }, 300);
}

function clearTick() {
  if (!timerId.value) return;
  clearInterval(timerId.value);
  timerId.value = null;
}

function finishSession() {
  clearTick();
  isRunning.value = false;
  remainingSeconds.value = 0;
  expectedEndTimestamp.value = null;
  persistFocusRecord();
  notifySessionFinished();
  switchModeAfterFinish();
  persistSnapshot();
}

function switchModeAfterFinish() {
  if (currentModeKey.value !== "focus") {
    currentModeKey.value = "focus";
    remainingSeconds.value = getModeDuration("focus");
    return;
  }
  currentModeKey.value = todayFocusCount.value % 4 === 0 ? "longBreak" : "shortBreak";
  remainingSeconds.value = getModeDuration(currentModeKey.value);
}

function notifySessionFinished() {
  uni.showToast({ title: `${currentMode.value.label}结束`, icon: "none" });
  if (timerSettings.value.notificationEnabled !== false) {
    uni.vibrateLong({ fail: () => {} });
  }
  // #ifdef APP-PLUS
  if (timerSettings.value.finishBellEnabled !== false && typeof plus !== "undefined" && plus.device?.beep) {
    plus.device.beep(1);
  }
  // #endif
}

function selectTask(taskId) {
  selectedTaskId.value = taskId;
  showTaskPopup.value = false;
  persistSnapshot();
}

function closeTaskPopup() {
  showTaskPopup.value = false;
}

function persistFocusRecord() {
  if (currentModeKey.value !== "focus") return;
  const finishedAt = Date.now();
  const record = {
    id: `${finishedAt}-${Math.random().toString(16).slice(2, 8)}`,
    mode: "focus",
    durationSeconds: getModeDuration("focus"),
    startAt: startTimestamp.value || finishedAt - getModeDuration("focus") * 1000,
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

function persistSnapshot() {
  setUserStorage(STORAGE_KEYS.timerSnapshot, {
    currentModeKey: currentModeKey.value,
    remainingSeconds: remainingSeconds.value,
    isRunning: isRunning.value,
    expectedEndTimestamp: expectedEndTimestamp.value,
    selectedTaskId: selectedTaskId.value,
  });
}

function recoverSnapshot() {
  const snapshot = getUserStorage(STORAGE_KEYS.timerSnapshot, {}) || {};
  if (snapshot.currentModeKey) currentModeKey.value = snapshot.currentModeKey;
  if (typeof snapshot.remainingSeconds === "number") remainingSeconds.value = snapshot.remainingSeconds;
  if (snapshot.selectedTaskId !== undefined) selectedTaskId.value = snapshot.selectedTaskId;
  if (!snapshot.isRunning || !snapshot.expectedEndTimestamp) return;

  const left = Math.max(0, Math.ceil((snapshot.expectedEndTimestamp - Date.now()) / 1000));
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
  if (!getUserStorage(STORAGE_KEYS.timerSnapshot, null)) {
    remainingSeconds.value = getModeDuration(currentModeKey.value);
  }
}

onShow(() => {
  if (!ensureLogin()) return;
  loadData();
  recoverSnapshot();
});

onHide(() => {
  if (isRunning.value && expectedEndTimestamp.value) {
    remainingSeconds.value = Math.max(0, Math.ceil((expectedEndTimestamp.value - Date.now()) / 1000));
  }
  clearTick();
  persistSnapshot();
});

onUnload(() => {
  clearTick();
  persistSnapshot();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(24rpx + env(safe-area-inset-top)) 24rpx 40rpx;
  box-sizing: border-box;
  background: linear-gradient(165deg, var(--bg-start) 0%, var(--bg-end) 100%);
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
  padding: 26rpx;
}

.hero-top,
.section-head,
.task-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.eyebrow {
  display: block;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.mode {
  display: block;
  margin-top: 10rpx;
  font-size: calc(46rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.cycle-pill {
  background: var(--accent-soft);
  color: var(--accent-deep);
  border-radius: 999rpx;
  padding: 12rpx 18rpx;
  font-size: calc(22rpx * var(--font-scale));
}

.timer-ring {
  margin: 28rpx auto 0;
  width: 420rpx;
  height: 420rpx;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at center, #ffffff 0 52%, transparent 53%),
    conic-gradient(var(--accent) 0deg, var(--accent-soft) 250deg, #eef4ef 360deg);
  box-shadow: inset 0 0 0 18rpx rgba(255, 255, 255, 0.85);
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

.action-row {
  margin-top: 28rpx;
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
  margin-top: 18rpx;
  border-radius: 28rpx;
  padding: 22rpx;
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
