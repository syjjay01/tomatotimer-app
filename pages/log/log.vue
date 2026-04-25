<template>
  <view class="page" :style="themeVars">
    <view class="hero">
      <view>
        <text class="eyebrow">工作日志</text>
        <text class="headline">{{ selectedDateLabel }}</text>
      </view>
      <picker mode="date" :value="selectedDate" @change="onDateChange">
        <view class="date-trigger">切换日期</view>
      </picker>
    </view>

    <view class="card">
      <text class="section-title">今日记录</text>
      <textarea v-model="logContent" class="editor" placeholder="记录进展、阻塞和今天的收获..." maxlength="5000" />
      <view class="quick-row">
        <text class="quick-btn" @tap="appendQuick('✅ 今日完成\n- ')">今日完成</text>
        <text class="quick-btn" @tap="appendQuick('❌ 阻塞\n- ')">阻塞</text>
        <text class="quick-btn" @tap="appendQuick('📚 学到\n- ')">学到</text>
      </view>
      <text class="save-tip">{{ saveTip }}</text>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">当天番茄记录</text>
        <text class="section-meta">{{ dailyFocusRecords.length }} 条</text>
      </view>
      <view v-if="dailyFocusRecords.length === 0" class="empty">这一天还没有专注记录。</view>
      <view v-for="record in dailyFocusRecords" :key="record.id" class="record-item">
        <text class="record-time">{{ formatTime(record.startAt) }} - {{ formatTime(record.endAt) }}</text>
        <text class="record-task">{{ record.taskTitle || "独立模式" }}</text>
        <text class="record-duration">{{ Math.round((record.durationSeconds || 0) / 60) }} 分钟</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { onShow, onUnload } from "@dcloudio/uni-app";
import { getUserStorage, setUserStorage } from "../../utils/user-storage";
import { ensureLogin } from "../../utils/guard";
import { getAppSettings, getThemeVars } from "../../utils/theme";

const STORAGE_KEYS = {
  focusRecordsCamel: "focusRecords",
  focusRecordsSnake: "focus_records",
  dailyLogs: "daily_logs",
  todos: "todos",
};

const selectedDate = ref(getDateKey(Date.now()));
const logContent = ref("");
const saveTip = ref("已自动保存");
const focusRecords = ref([]);
const todos = ref([]);
const dailyLogsTable = ref([]);
const saveTimer = ref(null);
const themeVars = ref(getThemeVars(getAppSettings()));

const selectedDateLabel = computed(() => selectedDate.value.replaceAll("-", "."));
const dailyFocusRecords = computed(() =>
  focusRecords.value
    .filter((item) => item.dateKey === selectedDate.value && item.mode === "focus")
    .sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0))
    .map((item) => ({
      ...item,
      taskTitle: item.taskTitle || findTaskTitle(item.taskId) || "独立模式",
    }))
);

function onDateChange(event) {
  selectedDate.value = event?.detail?.value || getDateKey(Date.now());
}

function appendQuick(snippet) {
  const base = logContent.value || "";
  logContent.value = !base.trim() ? snippet : `${base}${base.endsWith("\n") ? "" : "\n\n"}${snippet}`;
}

function getDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "--:--";
  const date = new Date(timestamp);
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function normalizeFocusRecord(raw) {
  return {
    id: raw.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    mode: raw.mode || "focus",
    durationSeconds: Number(raw.durationSeconds || 0),
    startAt: Number(raw.startAt || 0),
    endAt: Number(raw.endAt || 0),
    dateKey: raw.dateKey || getDateKey(raw.endAt || Date.now()),
    taskId: raw.taskId || null,
    taskTitle: raw.taskTitle || "",
  };
}

function normalizeDailyLog(raw) {
  return {
    dateKey: raw.dateKey || getDateKey(Date.now()),
    content: raw.content || "",
    updatedAt: Number(raw.updatedAt || Date.now()),
  };
}

function loadRecords() {
  const snake = getUserStorage(STORAGE_KEYS.focusRecordsSnake, []);
  const camel = getUserStorage(STORAGE_KEYS.focusRecordsCamel, []);
  const source = Array.isArray(snake) && snake.length > 0 ? snake : Array.isArray(camel) ? camel : [];
  focusRecords.value = source.map((item) => normalizeFocusRecord(item));
}

function loadTodos() {
  const stored = getUserStorage(STORAGE_KEYS.todos, []);
  todos.value = Array.isArray(stored) ? stored : [];
}

function loadDailyLogs() {
  const stored = getUserStorage(STORAGE_KEYS.dailyLogs, []);
  dailyLogsTable.value = (Array.isArray(stored) ? stored : []).map((item) => normalizeDailyLog(item));
}

function findTaskTitle(taskId) {
  if (!taskId) return "";
  return todos.value.find((item) => item.id === taskId)?.title || "";
}

function syncEditorByDate() {
  logContent.value = dailyLogsTable.value.find((item) => item.dateKey === selectedDate.value)?.content || "";
}

function saveCurrentLog() {
  const now = Date.now();
  const payload = normalizeDailyLog({
    dateKey: selectedDate.value,
    content: logContent.value,
    updatedAt: now,
  });
  const index = dailyLogsTable.value.findIndex((item) => item.dateKey === selectedDate.value);
  dailyLogsTable.value = index === -1 ? [payload, ...dailyLogsTable.value] : dailyLogsTable.value.map((item, idx) => (idx === index ? payload : item));
  setUserStorage(STORAGE_KEYS.dailyLogs, dailyLogsTable.value);
  saveTip.value = `已保存 ${formatTime(now)}`;
}

function scheduleSave() {
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveTip.value = "保存中...";
  saveTimer.value = setTimeout(() => {
    saveCurrentLog();
    saveTimer.value = null;
  }, 400);
}

watch(selectedDate, syncEditorByDate);
watch(logContent, scheduleSave);

onShow(() => {
  if (!ensureLogin()) return;
  themeVars.value = getThemeVars(getAppSettings());
  loadTodos();
  loadRecords();
  loadDailyLogs();
  syncEditorByDate();
});

onUnload(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveCurrentLog();
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

.date-trigger {
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(22rpx * var(--font-scale));
  font-weight: 700;
}

.card {
  margin-top: 18rpx;
  border-radius: 28rpx;
  padding: 22rpx;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
  color: var(--text-main);
}

.section-meta,
.save-tip,
.record-duration {
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.editor {
  width: 100%;
  min-height: 320rpx;
  margin-top: 16rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 24rpx;
  background: var(--panel-soft);
  color: var(--text-main);
  font-size: calc(28rpx * var(--font-scale));
  line-height: 1.7;
}

.quick-row {
  margin-top: 18rpx;
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.quick-btn {
  padding: 14rpx 18rpx;
  border-radius: 18rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(22rpx * var(--font-scale));
  font-weight: 700;
}

.save-tip {
  display: block;
  margin-top: 14rpx;
}

.empty {
  padding: 28rpx 0 8rpx;
  color: var(--text-sub);
  font-size: calc(24rpx * var(--font-scale));
}

.record-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid var(--border-soft);
}

.record-item:last-child {
  border-bottom: none;
}

.record-time {
  display: block;
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.record-task {
  display: block;
  margin-top: 8rpx;
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
  color: var(--text-main);
}

.record-duration {
  display: block;
  margin-top: 6rpx;
}
</style>
