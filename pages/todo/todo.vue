<template>
  <view class="page" :style="themeVars">
    <view class="safe-top" :style="{ height: `${statusBarHeight}px` }"></view>
    <view class="top-fixed">
      <view class="hero">
        <view>
          <text class="eyebrow">工作待办</text>
          <text class="headline">把最重要的事情排在最前面</text>
        </view>
        <button class="add-btn" @tap="openCreateEditor">新增任务</button>
      </view>

      <view class="completed-banner" @tap="jumpToCompleted">
        <text class="completed-label">已完成 {{ completedCount }} 项</text>
        <text class="completed-link">{{ completedCount > 0 ? "查看区域" : "暂无完成" }}</text>
      </view>
    </view>

    <scroll-view class="content-scroll" scroll-y :scroll-into-view="todoScrollIntoView" scroll-with-animation>
      <view class="content-inner">
        <view class="section-card">
          <view class="section-head">
            <text class="section-title">未完成</text>
            <text class="section-meta">{{ unfinishedTodos.length }} 项</text>
          </view>
          <text v-if="unfinishedTodos.length > 0" class="sort-tip">长按任务可拖拽排序</text>

          <view
            v-if="unfinishedTodos.length > 0"
            class="unfinished-list"
            @touchmove="onDragMove"
            @touchend="endDrag"
            @touchcancel="endDrag"
          >
            <view
              v-for="(todo, index) in unfinishedTodos"
              :key="todo.id"
              class="task-row unfinished-item"
              :class="{ dragging: dragActive && draggingTodoId === todo.id }"
              @longpress="startDrag(todo.id, index)"
            >
              <view class="check" :class="{ checked: todo.completed }" @tap="toggleCompleted(todo.id)"></view>
              <view class="task-body">
                <view class="title-row">
                  <text class="task-title">{{ todo.title }}</text>
                  <text class="priority" :class="`priority-${todo.priority}`">{{ priorityLabel(todo.priority) }}</text>
                </view>
                <text v-if="todo.description" class="task-desc">{{ todo.description }}</text>
                <view class="meta-row">
                  <text class="focus-count">已专注 {{ readTaskPomodoroCount(todo) }} 个番茄</text>
                  <view class="row-actions">
                    <button class="icon-btn" @tap.stop="openEditEditor(todo)">✏️</button>
                    <button class="icon-btn danger" @tap.stop="confirmDelete(todo.id)">🗑</button>
                  </view>
                </view>
              </view>
            </view>
          </view>
          <view v-else class="empty">还没有任务，先加一条开始吧。</view>
        </view>

        <view id="completed-anchor" class="section-card muted">
          <view class="section-head" @tap="completedCollapsed = !completedCollapsed">
            <text class="section-title">已完成</text>
            <text class="section-meta">{{ completedCollapsed ? "展开" : "收起" }}</text>
          </view>
          <view v-if="!completedCollapsed">
            <view v-if="completedTodos.length === 0" class="empty">还没有已完成任务。</view>
            <view v-for="todo in completedTodos" :key="todo.id" class="task-row done">
              <view class="check checked" @tap="toggleCompleted(todo.id)"></view>
              <view class="task-body">
                <view class="title-row">
                  <text class="task-title done-text">{{ todo.title }}</text>
                  <text class="priority" :class="`priority-${todo.priority}`">{{ priorityLabel(todo.priority) }}</text>
                </view>
                <text v-if="todo.description" class="task-desc done-text">{{ todo.description }}</text>
                <view class="meta-row">
                  <text class="focus-count">已专注 {{ readTaskPomodoroCount(todo) }} 个番茄</text>
                  <view class="row-actions">
                    <button class="icon-btn" @tap.stop="openEditEditor(todo)">✏️</button>
                    <button class="icon-btn danger" @tap.stop="confirmDelete(todo.id)">🗑</button>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view v-if="showEditor" class="sheet-mask" @tap="closeEditor">
      <view class="sheet-panel" @tap.stop>
        <text class="sheet-title">{{ editingId ? "编辑任务" : "新增任务" }}</text>
        <input v-model="form.title" class="sheet-input" :focus="titleInputFocus" placeholder="任务标题" maxlength="40" />
        <textarea v-model="form.description" class="sheet-textarea" placeholder="补充一点背景信息（可选）" maxlength="200" />
        <view class="priority-row">
          <text
            v-for="item in PRIORITY_OPTIONS"
            :key="item.value"
            class="priority-pill"
            :class="{ active: form.priority === item.value }"
            @tap="form.priority = item.value"
          >
            {{ item.label }}
          </text>
        </view>
        <view class="sheet-actions">
          <button class="sheet-ghost" @tap="closeEditor">取消</button>
          <button class="sheet-main" @tap="submitEditor">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getUserStorage, setUserStorage } from "../../utils/user-storage";
import { ensureLogin } from "../../utils/guard";
import { getAppSettings, getThemeVars } from "../../utils/theme";

const STORAGE_KEY = "todos";
const PRIORITY_OPTIONS = [
  { label: "高优先", value: "high" },
  { label: "中优先", value: "medium" },
  { label: "低优先", value: "low" },
];

const todos = ref([]);
const completedCollapsed = ref(true);
const showEditor = ref(false);
const editingId = ref("");
const titleInputFocus = ref(false);
const form = ref({ title: "", description: "", priority: "medium" });
const themeVars = ref(getThemeVars(getAppSettings()));
const todoScrollIntoView = ref("");
const statusBarHeight = ref(0);

const dragActive = ref(false);
const draggingTodoId = ref("");
const dragFromIndex = ref(-1);
const dragToIndex = ref(-1);
const dragListTop = ref(0);
const dragItemHeights = ref([]);

const unfinishedTodos = computed(() => {
  const base = getUnfinishedTodosSorted();
  if (!dragActive.value) return base;
  if (dragFromIndex.value < 0 || dragToIndex.value < 0 || dragFromIndex.value === dragToIndex.value) return base;
  return moveByIndex(base, dragFromIndex.value, dragToIndex.value);
});
const completedTodos = computed(() => [...todos.value].filter((item) => item.completed).sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0)));
const completedCount = computed(() => completedTodos.value.length);

function priorityLabel(priority) {
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "中";
}

function readTaskPomodoroCount(todo) {
  return Number(todo.pomodoroCount ?? todo.tomatoCount ?? todo.focusCount ?? 0);
}

function normalizeTodo(raw) {
  const now = Date.now();
  return {
    id: raw.id || `${now}-${Math.random().toString(16).slice(2, 8)}`,
    title: raw.title || "",
    description: raw.description || "",
    priority: raw.priority || "medium",
    order: Number(raw.order || 0),
    completed: Boolean(raw.completed),
    pomodoroCount: Number(raw.pomodoroCount ?? raw.tomatoCount ?? raw.focusCount ?? 0),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now),
    completedAt: Number(raw.completedAt || 0),
  };
}

function loadTodos() {
  const list = getUserStorage(STORAGE_KEY, []);
  todos.value = (Array.isArray(list) ? list : []).map((item) => normalizeTodo(item));
  normalizeUnfinishedOrders();
}

function saveTodos() {
  setUserStorage(STORAGE_KEY, todos.value);
}

function sortTodosFallback(a, b) {
  const rank = { high: 3, medium: 2, low: 1 };
  const diff = (rank[b.priority] || 0) - (rank[a.priority] || 0);
  if (diff !== 0) return diff;
  return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
}

function getUnfinishedTodosSorted() {
  return [...todos.value]
    .filter((item) => !item.completed)
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) && Number(a.order) > 0 ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.order)) && Number(b.order) > 0 ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return sortTodosFallback(a, b);
    });
}

function normalizeUnfinishedOrders() {
  const unfinished = getUnfinishedTodosSorted();
  const orderMap = new Map(unfinished.map((item, index) => [item.id, index + 1]));
  let changed = false;
  todos.value = todos.value.map((item) => {
    if (item.completed) return item;
    const nextOrder = orderMap.get(item.id) || 1;
    if (item.order === nextOrder) return item;
    changed = true;
    return { ...item, order: nextOrder };
  });
  if (changed) saveTodos();
}

function getNextUnfinishedOrder() {
  const orders = todos.value.filter((item) => !item.completed).map((item) => Number(item.order || 0));
  const maxOrder = orders.length ? Math.max(...orders) : 0;
  return maxOrder + 1;
}

function jumpToCompleted() {
  if (completedCount.value <= 0) return;
  completedCollapsed.value = false;
  todoScrollIntoView.value = "completed-anchor";
  setTimeout(() => {
    todoScrollIntoView.value = "";
  }, 120);
}

function openCreateEditor() {
  editingId.value = "";
  form.value = { title: "", description: "", priority: "medium" };
  titleInputFocus.value = false;
  showEditor.value = true;
}

function openEditEditor(todo) {
  editingId.value = todo.id;
  form.value = {
    title: todo.title || "",
    description: todo.description || "",
    priority: todo.priority || "medium",
  };
  showEditor.value = true;
  focusTitleInput();
}

function closeEditor() {
  showEditor.value = false;
  titleInputFocus.value = false;
}

function submitEditor() {
  const title = String(form.value.title || "").trim();
  const description = String(form.value.description || "").trim();
  if (!title) {
    uni.showToast({ title: "标题不能为空", icon: "none" });
    return;
  }
  const now = Date.now();
  if (!editingId.value) {
    todos.value = [
      normalizeTodo({
        title,
        description,
        priority: form.value.priority,
        order: getNextUnfinishedOrder(),
        completed: false,
        pomodoroCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
      ...todos.value,
    ];
  } else {
    todos.value = todos.value.map((item) =>
      item.id === editingId.value
        ? normalizeTodo({
            ...item,
            title,
            description,
            priority: form.value.priority,
            updatedAt: now,
          })
        : item
    );
  }
  normalizeUnfinishedOrders();
  saveTodos();
  showEditor.value = false;
  titleInputFocus.value = false;
}

function focusTitleInput() {
  titleInputFocus.value = false;
  nextTick(() => {
    titleInputFocus.value = true;
  });
}

function toggleCompleted(id) {
  const now = Date.now();
  const nextOrder = getNextUnfinishedOrder();
  todos.value = todos.value.map((item) => {
    if (item.id !== id) return item;
    const becomingCompleted = !item.completed;
    return normalizeTodo({
      ...item,
      completed: becomingCompleted,
      updatedAt: now,
      completedAt: becomingCompleted ? now : 0,
      order: becomingCompleted ? item.order : nextOrder,
    });
  });
  normalizeUnfinishedOrders();
  saveTodos();
}

function confirmDelete(id) {
  uni.showModal({
    title: "删除任务",
    content: "确定删除这条任务吗？",
    confirmColor: "#d04a38",
    success: (res) => {
      if (!res.confirm) return;
      todos.value = todos.value.filter((item) => item.id !== id);
      normalizeUnfinishedOrders();
      saveTodos();
    },
  });
}

function startDrag(id, index) {
  if (showEditor.value) return;
  dragActive.value = true;
  draggingTodoId.value = id;
  dragFromIndex.value = index;
  dragToIndex.value = index;
  measureDragLayout();
}

function measureDragLayout() {
  const query = uni.createSelectorQuery();
  query.select(".unfinished-list").boundingClientRect();
  query.selectAll(".unfinished-item").boundingClientRect();
  query.exec((res) => {
    const listRect = res?.[0] || {};
    const itemRects = Array.isArray(res?.[1]) ? res[1] : [];
    dragListTop.value = Number(listRect.top || 0);
    dragItemHeights.value = itemRects.map((item) => Number(item.height || 0));
  });
}

function onDragMove(event) {
  if (!dragActive.value) return;
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  if (!touch) return;
  const heights = dragItemHeights.value;
  if (!heights.length) return;
  const relativeY = Number(touch.clientY || touch.pageY || 0) - dragListTop.value;
  const total = heights.reduce((sum, h) => sum + h, 0);
  if (relativeY <= 0) {
    dragToIndex.value = 0;
    return;
  }
  if (relativeY >= total) {
    dragToIndex.value = heights.length - 1;
    return;
  }
  let target = heights.length - 1;
  let cursor = 0;
  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i];
    if (relativeY < cursor + h / 2) {
      target = i;
      break;
    }
    cursor += h;
  }
  dragToIndex.value = target;
}

function endDrag() {
  if (!dragActive.value) return;
  const base = getUnfinishedTodosSorted();
  const from = dragFromIndex.value;
  const to = dragToIndex.value;
  if (from >= 0 && to >= 0 && from !== to && from < base.length && to < base.length) {
    const moved = moveByIndex(base, from, to);
    const orderMap = new Map(moved.map((item, index) => [item.id, index + 1]));
    todos.value = todos.value.map((item) => {
      if (item.completed) return item;
      const nextOrder = orderMap.get(item.id) || item.order;
      return item.order === nextOrder ? item : { ...item, order: nextOrder };
    });
    saveTodos();
  }
  clearDragState();
}

function clearDragState() {
  dragActive.value = false;
  draggingTodoId.value = "";
  dragFromIndex.value = -1;
  dragToIndex.value = -1;
  dragListTop.value = 0;
  dragItemHeights.value = [];
}

function moveByIndex(list, from, to) {
  const copy = [...list];
  const [picked] = copy.splice(from, 1);
  copy.splice(to, 0, picked);
  return copy;
}

onShow(() => {
  if (!ensureLogin()) return;
  const sysInfo = uni.getSystemInfoSync ? uni.getSystemInfoSync() : {};
  statusBarHeight.value = Math.max(0, Number(sysInfo?.statusBarHeight || 0));
  themeVars.value = getThemeVars(getAppSettings());
  loadTodos();
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
.section-card,
.sheet-panel,
.completed-banner {
  background: var(--panel);
  box-shadow: 0 18rpx 44rpx rgba(22, 41, 31, 0.08);
}

.hero {
  border-radius: 34rpx;
  padding: 24rpx;
  display: flex;
  justify-content: space-between;
  gap: 18rpx;
}

.eyebrow {
  display: block;
  font-size: calc(24rpx * var(--font-scale));
  color: var(--text-sub);
}

.headline {
  display: block;
  margin-top: 10rpx;
  font-size: calc(40rpx * var(--font-scale));
  line-height: 1.35;
  font-weight: 800;
  color: var(--text-main);
}

.add-btn {
  align-self: flex-start;
  min-width: 178rpx;
  padding: 0 28rpx;
  height: 74rpx;
  line-height: 74rpx;
  border-radius: 999rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
  white-space: nowrap;
}

.add-btn::after {
  border: none;
}

.completed-banner {
  margin-top: 12rpx;
  border-radius: 20rpx;
  padding: 14rpx 18rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.completed-label {
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-main);
  font-weight: 700;
}

.completed-link {
  font-size: calc(20rpx * var(--font-scale));
  color: var(--accent-deep);
}

.content-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 12rpx;
}

.content-inner {
  padding-bottom: 12rpx;
}

.section-card {
  margin-top: 14rpx;
  border-radius: 28rpx;
  padding: 20rpx;
}

.section-card:first-child {
  margin-top: 0;
}

.section-card.muted {
  background: rgba(255, 255, 255, 0.84);
}

.section-head,
.title-row,
.meta-row,
.priority-row,
.sheet-actions {
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
.focus-count {
  font-size: calc(22rpx * var(--font-scale));
  color: var(--text-sub);
}

.sort-tip {
  display: block;
  margin-top: 8rpx;
  color: var(--text-sub);
  font-size: calc(21rpx * var(--font-scale));
}

.empty {
  padding: 24rpx 0 8rpx;
  color: var(--text-sub);
  font-size: calc(24rpx * var(--font-scale));
}

.task-row {
  margin-top: 18rpx;
  display: flex;
  gap: 16rpx;
}

.task-row.dragging {
  opacity: 0.62;
}

.check {
  width: 36rpx;
  height: 36rpx;
  margin-top: 8rpx;
  border-radius: 50%;
  border: 2rpx solid var(--border-soft);
  background: #ffffff;
  flex-shrink: 0;
}

.check.checked {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 8rpx #ffffff;
}

.task-body {
  flex: 1;
  padding-bottom: 18rpx;
  border-bottom: 1rpx solid var(--border-soft);
}

.task-row:last-child .task-body {
  border-bottom: none;
}

.task-title {
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
  color: var(--text-main);
}

.task-desc {
  display: block;
  margin-top: 8rpx;
  font-size: calc(24rpx * var(--font-scale));
  line-height: 1.6;
  color: var(--text-sub);
}

.done-text {
  text-decoration: line-through;
  opacity: 0.68;
}

.priority {
  min-width: 52rpx;
  text-align: center;
  border-radius: 999rpx;
  padding: 6rpx 16rpx;
  font-size: calc(20rpx * var(--font-scale));
  font-weight: 700;
}

.priority-high {
  background: #ffe1dc;
  color: #b63f2d;
}

.priority-medium {
  background: #fff0d9;
  color: #b26f11;
}

.priority-low {
  background: var(--accent-soft);
  color: var(--accent-deep);
}

.meta-row {
  margin-top: 14rpx;
}

.row-actions {
  display: flex;
  gap: 6rpx;
}

.icon-btn {
  width: 58rpx;
  height: 58rpx;
  line-height: 58rpx;
  border-radius: 14rpx;
  text-align: center;
  padding: 0;
  margin: 0;
  background: transparent;
  font-size: calc(24rpx * var(--font-scale));
}

.icon-btn.danger {
  color: #c75140;
}

.icon-btn::after {
  border: none;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 19, 16, 0.28);
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
  font-size: calc(32rpx * var(--font-scale));
  font-weight: 800;
  color: var(--text-main);
}

.sheet-input,
.sheet-textarea {
  width: 100%;
  margin-top: 18rpx;
  border-radius: 22rpx;
  background: var(--panel-soft);
  box-sizing: border-box;
  font-size: calc(26rpx * var(--font-scale));
  color: var(--text-main);
}

.sheet-input {
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 20rpx;
}

.sheet-textarea {
  min-height: 220rpx;
  padding: 18rpx 20rpx;
}

.priority-row {
  margin-top: 18rpx;
  gap: 12rpx;
}

.priority-pill {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 18rpx;
  background: #eef3ee;
  color: var(--text-sub);
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
}

.priority-pill.active {
  background: var(--accent-soft);
  color: var(--accent-deep);
}

.sheet-actions {
  margin-top: 20rpx;
  gap: 12rpx;
}

.sheet-main,
.sheet-ghost {
  flex: 1;
  height: 86rpx;
  line-height: 86rpx;
  border-radius: 22rpx;
  font-size: calc(28rpx * var(--font-scale));
  font-weight: 700;
}

.sheet-main {
  background: var(--accent);
  color: #ffffff;
}

.sheet-ghost {
  background: #eef2ef;
  color: var(--text-main);
}

.sheet-main::after,
.sheet-ghost::after {
  border: none;
}
</style>
