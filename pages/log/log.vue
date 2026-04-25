<template>
  <view class="page" :style="themeVars">
    <view class="hero">
      <view>
        <text class="eyebrow">工作日志</text>
        <text class="headline">{{ selectedDateLabel }}</text>
      </view>
      <view class="date-actions">
        <picker mode="date" :value="selectedDate" @change="onDateChange">
          <view class="date-trigger">切换日期</view>
        </picker>
        <view v-if="!isTodaySelected" class="today-trigger" @tap="goToday">回到当日</view>
      </view>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">今日记录</text>
        <text class="voice-trigger" :class="{ listening: voiceListening }" @tap="startVoiceInput">
          {{ voiceListening ? "识别中..." : "语音识别" }}
        </text>
      </view>
      <textarea
        v-model="logContent"
        class="editor"
        :focus="editorFocus"
        :cursor="editorCursor"
        :auto-height="false"
        show-confirm-bar="false"
        placeholder="记录进展、阻塞和今天的收获..."
        maxlength="5000"
      />
      <view class="quick-row">
        <text class="quick-btn" @tap="appendQuick('todayDone')">今日完成</text>
        <text class="quick-btn" @tap="appendQuick('blocked')">阻塞</text>
        <text class="quick-btn" @tap="appendQuick('done')">完成</text>
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
import { computed, nextTick, ref, watch } from "vue";
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

const QUICK_SECTIONS = [
  { key: "todayDone", heading: "✅ 今日完成" },
  { key: "blocked", heading: "❌ 阻塞" },
  { key: "done", heading: "📌 完成" },
];

const selectedDate = ref(getDateKey(Date.now()));
const logContent = ref("");
const saveTip = ref("已自动保存");
const focusRecords = ref([]);
const todos = ref([]);
const dailyLogsTable = ref([]);
const saveTimer = ref(null);
const themeVars = ref(getThemeVars(getAppSettings()));
const voiceListening = ref(false);
const editorCursor = ref(-1);
const editorFocus = ref(false);

const selectedDateLabel = computed(() => normalizeDateKey(selectedDate.value).replace(/-/g, "."));
const isTodaySelected = computed(() => selectedDate.value === getDateKey(Date.now()));
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
  selectedDate.value = normalizeDateKey(event?.detail?.value);
}

function goToday() {
  selectedDate.value = getDateKey(Date.now());
}

function appendQuick(sectionKey) {
  const section = QUICK_SECTIONS.find((item) => item.key === sectionKey);
  if (!section) return;
  const result = appendQuickSection(logContent.value, section.heading);
  logContent.value = result.text;
  focusEditorAt(result.cursor);
}

function appendQuickSection(content, heading) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    const text = `${heading}\n- `;
    return { text, cursor: text.length };
  }

  const lines = normalized.split("\n");
  const headingSet = new Set(QUICK_SECTIONS.map((item) => item.heading));
  const headingIndex = lines.findIndex((line) => line.trim() === heading);

  if (headingIndex === -1) {
    const separator = normalized.endsWith("\n\n") ? "" : normalized.endsWith("\n") ? "\n" : "\n\n";
    const text = `${normalized}${separator}${heading}\n- `;
    return { text, cursor: text.length };
  }

  let nextHeadingIndex = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (headingSet.has(lines[i].trim())) {
      nextHeadingIndex = i;
      break;
    }
  }

  let insertIndex = nextHeadingIndex;
  while (insertIndex > headingIndex + 1 && !lines[insertIndex - 1].trim()) {
    insertIndex -= 1;
  }
  lines.splice(insertIndex, 0, "- ");
  const text = lines.join("\n");
  const cursor = getCursorByLineIndex(lines, insertIndex);
  return { text, cursor };
}

function getCursorByLineIndex(lines, lineIndex) {
  let cursor = 0;
  for (let i = 0; i <= lineIndex && i < lines.length; i += 1) {
    cursor += lines[i].length;
    if (i < lines.length - 1) cursor += 1;
  }
  return cursor;
}

function focusEditorAt(cursorPosition) {
  editorFocus.value = false;
  nextTick(() => {
    editorCursor.value = Number(cursorPosition);
    editorFocus.value = true;
  });
}

function startVoiceInput() {
  if (voiceListening.value) return;
  // #ifdef APP-PLUS
  if (typeof plus === "undefined" || !plus.speech || typeof plus.speech.startRecognize !== "function") {
    uni.showToast({ title: "当前设备不支持语音识别", icon: "none" });
    return;
  }
  voiceListening.value = true;
  plus.speech.startRecognize(
    {
      engine: "baidu",
      timeout: 60000,
      punctuation: true,
    },
    (result) => {
      voiceListening.value = false;
      appendVoiceText(result);
    },
    () => {
      voiceListening.value = false;
      uni.showToast({ title: "语音识别失败", icon: "none" });
    }
  );
  // #endif
  // #ifndef APP-PLUS
  uni.showToast({ title: "当前环境不支持语音识别", icon: "none" });
  // #endif
}

function appendVoiceText(text) {
  const phrase = String(text || "").trim();
  if (!phrase) return;
  const base = String(logContent.value || "");
  const separator = !base ? "" : base.endsWith("\n") ? "" : "\n";
  const nextText = `${base}${separator}${phrase}`;
  logContent.value = nextText;
  focusEditorAt(nextText.length);
}

function stopVoiceInput() {
  if (!voiceListening.value) return;
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== "undefined" && plus && plus.speech && typeof plus.speech.stopRecognize === "function") {
      plus.speech.stopRecognize();
    }
  } catch (error) {}
  // #endif
  voiceListening.value = false;
}

function getDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function normalizeDateKey(rawValue) {
  if (typeof rawValue === "string") {
    const safe = rawValue.trim();
    if (safe) return safe;
  }
  if (rawValue instanceof Date) {
    return getDateKey(rawValue.getTime());
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return getDateKey(rawValue);
  }
  return getDateKey(Date.now());
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
  stopVoiceInput();
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
  gap: 18rpx;
}

.date-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10rpx;
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

.date-trigger,
.today-trigger {
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(22rpx * var(--font-scale));
  font-weight: 700;
}

.today-trigger {
  background: rgba(255, 255, 255, 0.62);
  border: 1rpx solid var(--border-soft);
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

.voice-trigger {
  padding: 10rpx 16rpx;
  border-radius: 14rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(21rpx * var(--font-scale));
  font-weight: 700;
}

.voice-trigger.listening {
  animation: pulse 1.1s ease-in-out infinite;
}

.section-meta,
.save-tip,
.record-duration {
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.editor {
  width: 100%;
  height: 38vh;
  margin-top: 16rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 24rpx;
  background: var(--panel-soft);
  color: var(--text-main);
  font-size: calc(28rpx * var(--font-scale));
  line-height: 1.7;
  overflow-y: scroll;
  white-space: pre-wrap;
  word-break: break-all;
}

.editor::-webkit-scrollbar {
  width: 8rpx;
}

.editor::-webkit-scrollbar-thumb {
  border-radius: 999rpx;
  background: rgba(92, 120, 145, 0.45);
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

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.68;
    transform: scale(0.97);
  }
}
</style>
