<template>
  <view class="page" :style="themeVars">
    <view class="safe-top" :style="{ height: `${statusBarHeight}px` }"></view>
    <view class="top-fixed">
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
    </view>

    <scroll-view class="content-scroll" scroll-y>
      <view class="content-inner">
        <view class="card">
          <view class="section-head">
            <text class="section-title">今日记录</text>
            <text class="voice-trigger" :class="{ listening: voiceListening }" @tap="startVoiceInput">
              {{ voiceListening ? "识别中..." : "语音识别" }}
            </text>
          </view>
          <scroll-view class="editor-scroll" scroll-y :scroll-top="editorScrollTop" scroll-with-animation>
            <textarea
              :key="editorRenderKey"
              v-model="logContent"
              class="editor"
              :style="{ height: `${editorComputedHeight}px` }"
              :focus="editorFocus"
              :cursor="editorCursor"
              :selection-start="editorSelectionStart"
              :selection-end="editorSelectionEnd"
              :auto-height="false"
              :disable-default-padding="true"
              show-confirm-bar="false"
              placeholder="记录进展、阻塞和今天的收获..."
              maxlength="5000"
            />
          </scroll-view>
          <view class="quick-row">
            <text class="quick-btn" @tap="appendQuick('todayDone')">今日完成</text>
            <text class="quick-btn" @tap="appendQuick('blocked')">阻塞</text>
            <text class="quick-btn" @tap="appendQuick('learned')">学到</text>
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
    </scroll-view>
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
  { key: "learned", heading: "📚 学到" },
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
const editorSelectionStart = ref(-1);
const editorSelectionEnd = ref(-1);
const editorFocus = ref(false);
const editorRenderKey = ref(0);
const statusBarHeight = ref(0);
const editorScrollTop = ref(0);
const editorLineHeightPx = ref(26);
const editorVisibleLineCount = ref(8);
const editorWrapCharCount = ref(22);
const editorViewportHeightPx = ref(300);
const windowWidthPx = ref(375);

const selectedDateLabel = computed(() => normalizeDateKey(selectedDate.value).replace(/-/g, "."));
const isTodaySelected = computed(() => selectedDate.value === getDateKey(Date.now()));
const editorComputedHeight = computed(() => {
  const linePx = Math.max(18, Number(editorLineHeightPx.value || 26));
  const paddingPx = rpxToPx(40);
  const totalLineCount = estimateVisualLineIndex(logContent.value, String(logContent.value || "").length);
  const rawHeight = Math.ceil(totalLineCount * linePx + paddingPx);
  return Math.max(Number(editorViewportHeightPx.value || 300), rawHeight);
});
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
  for (let i = 0; i < lineIndex && i < lines.length; i += 1) {
    cursor += lines[i].length + 1;
  }
  if (lineIndex >= 0 && lineIndex < lines.length) cursor += lines[lineIndex].length;
  return cursor;
}

function rpxToPx(rpx) {
  return (Number(rpx || 0) * Math.max(1, Number(windowWidthPx.value || 375))) / 750;
}

function measureEditorViewport() {
  const query = uni.createSelectorQuery();
  query.select(".editor-scroll").boundingClientRect();
  query.exec((res) => {
    const rect = res?.[0];
    if (!rect) return;
    const height = Number(rect.height || 0);
    const width = Number(rect.width || 0);
    if (height <= 0 || width <= 0) return;
    editorViewportHeightPx.value = height;
    const fontScale = Number(getAppSettings().fontScale || 110) / 100;
    const fontPx = rpxToPx(28 * fontScale);
    const linePx = Math.max(18, fontPx * 1.7);
    const contentHeight = Math.max(10, height - rpxToPx(40));
    const contentWidth = Math.max(10, width - rpxToPx(40));
    const approxChars = Math.max(12, Math.floor(contentWidth / Math.max(10, fontPx * 0.95)));
    editorLineHeightPx.value = linePx;
    editorVisibleLineCount.value = Math.max(1, Math.floor(contentHeight / linePx));
    editorWrapCharCount.value = approxChars;
  });
}

function estimateVisualLineIndex(content, cursorPosition) {
  const text = String(content || "");
  const safeCursor = Math.max(0, Math.min(text.length, Number(cursorPosition || 0)));
  const before = text.slice(0, safeCursor);
  const lines = before.split("\n");
  const wrapChars = Math.max(12, Number(editorWrapCharCount.value || 22));
  let visualLine = 0;
  lines.forEach((line) => {
    visualLine += Math.max(1, Math.ceil(line.length / wrapChars));
  });
  return Math.max(1, visualLine);
}

function syncEditorScrollToCursor(cursorPosition) {
  const visualLine = estimateVisualLineIndex(logContent.value, cursorPosition);
  const visibleLines = Math.max(1, Number(editorVisibleLineCount.value || 8));
  const targetTopLine = Math.max(0, visualLine - visibleLines + 1);
  const targetTop = Math.max(0, Math.round(targetTopLine * Math.max(18, Number(editorLineHeightPx.value || 26))));
  if (Math.abs(Number(editorScrollTop.value || 0) - targetTop) < 2) {
    editorScrollTop.value = Math.max(0, targetTop - 1);
    nextTick(() => {
      editorScrollTop.value = targetTop;
    });
    return;
  }
  editorScrollTop.value = targetTop;
}

function focusEditorAt(cursorPosition) {
  const safeCursor = Math.max(0, Number(cursorPosition || 0));
  syncEditorScrollToCursor(safeCursor);
  editorRenderKey.value += 1;
  editorFocus.value = false;
  editorCursor.value = -1;
  editorSelectionStart.value = -1;
  editorSelectionEnd.value = -1;
  nextTick(() => {
    editorCursor.value = safeCursor;
    editorSelectionStart.value = safeCursor;
    editorSelectionEnd.value = safeCursor;
    editorFocus.value = true;
    syncEditorScrollToCursor(safeCursor);
    nextTick(() => {
      editorCursor.value = safeCursor;
      editorSelectionStart.value = safeCursor;
      editorSelectionEnd.value = safeCursor;
      editorFocus.value = true;
      syncEditorScrollToCursor(safeCursor);
      setTimeout(() => {
        editorCursor.value = safeCursor;
        editorSelectionStart.value = safeCursor;
        editorSelectionEnd.value = safeCursor;
        editorFocus.value = true;
        syncEditorScrollToCursor(safeCursor);
      }, 32);
      setTimeout(() => {
        editorCursor.value = safeCursor;
        editorSelectionStart.value = safeCursor;
        editorSelectionEnd.value = safeCursor;
        syncEditorScrollToCursor(safeCursor);
      }, 120);
    });
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
  editorScrollTop.value = 0;
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
  const sysInfo = uni.getSystemInfoSync ? uni.getSystemInfoSync() : {};
  statusBarHeight.value = Math.max(0, Number(sysInfo?.statusBarHeight || 0));
  windowWidthPx.value = Math.max(1, Number(sysInfo?.windowWidth || 375));
  themeVars.value = getThemeVars(getAppSettings());
  loadTodos();
  loadRecords();
  loadDailyLogs();
  syncEditorByDate();
  nextTick(() => {
    measureEditorViewport();
    setTimeout(() => measureEditorViewport(), 80);
  });
});

onUnload(() => {
  stopVoiceInput();
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveCurrentLog();
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

.content-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 12rpx;
}

.content-inner {
  padding-bottom: 12rpx;
}

.card {
  margin-top: 14rpx;
  border-radius: 28rpx;
  padding: 22rpx;
}

.card:first-child {
  margin-top: 0;
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

.editor-scroll {
  height: 38vh;
  margin-top: 16rpx;
  border-radius: 24rpx;
  background: var(--panel-soft);
}

.editor {
  width: 100%;
  padding: 20rpx;
  box-sizing: border-box;
  background: transparent;
  color: var(--text-main);
  font-size: calc(28rpx * var(--font-scale));
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.editor-scroll::-webkit-scrollbar {
  width: 8rpx;
}

.editor-scroll::-webkit-scrollbar-thumb {
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
