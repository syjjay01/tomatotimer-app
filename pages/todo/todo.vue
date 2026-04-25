<template>
  <view class="page" :style="themeVars">
    <view class="hero">
      <view>
        <text class="eyebrow">工作待办</text>
        <text class="headline">把今天最重要的事情排在最前面。</text>
      </view>
      <button class="add-btn" @tap="openCreateEditor">新增任务</button>
    </view>

    <view class="section-card">
      <view class="section-head">
        <text class="section-title">未完成</text>
        <text class="section-meta">{{ unfinishedTodos.length }} 项</text>
      </view>
      <view v-if="unfinishedTodos.length === 0" class="empty">今天还没有任务，先加一条开始吧。</view>
      <view v-for="todo in unfinishedTodos" :key="todo.id" class="task-row">
        <view class="check" :class="{ checked: todo.completed }" @tap="toggleCompleted(todo.id)"></view>
        <view class="task-body" @tap="openEditEditor(todo)">
          <view class="title-row">
            <text class="task-title">{{ todo.title }}</text>
            <text class="priority" :class="`priority-${todo.priority}`">{{ priorityLabel(todo.priority) }}</text>
          </view>
          <text v-if="todo.description" class="task-desc">{{ todo.description }}</text>
          <view class="meta-row">
            <text class="focus-count">已专注 {{ readTaskPomodoroCount(todo) }} 个番茄</text>
            <text class="delete-link" @tap.stop="confirmDelete(todo.id)">删除</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section-card muted">
      <view class="section-head" @tap="completedCollapsed = !completedCollapsed">
        <text class="section-title">已完成</text>
        <text class="section-meta">{{ completedCollapsed ? "展开" : "收起" }}</text>
      </view>
      <view v-if="!completedCollapsed">
        <view v-if="completedTodos.length === 0" class="empty">还没有已完成任务。</view>
        <view v-for="todo in completedTodos" :key="todo.id" class="task-row done">
          <view class="check checked" @tap="toggleCompleted(todo.id)"></view>
          <view class="task-body" @tap="openEditEditor(todo)">
            <view class="title-row">
              <text class="task-title done-text">{{ todo.title }}</text>
              <text class="priority" :class="`priority-${todo.priority}`">{{ priorityLabel(todo.priority) }}</text>
            </view>
            <text v-if="todo.description" class="task-desc done-text">{{ todo.description }}</text>
            <view class="meta-row">
              <text class="focus-count">已专注 {{ readTaskPomodoroCount(todo) }} 个番茄</text>
              <text class="delete-link" @tap.stop="confirmDelete(todo.id)">删除</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="showEditor" class="sheet-mask" @tap="closeEditor">
      <view class="sheet-panel" @tap.stop>
        <text class="sheet-title">{{ editingId ? "编辑任务" : "新增任务" }}</text>
        <input v-model.trim="form.title" class="sheet-input" placeholder="任务标题" maxlength="40" />
        <textarea v-model.trim="form.description" class="sheet-textarea" placeholder="补充一点背景信息（可选）" maxlength="200" />
        <view class="priority-row">
          <text v-for="item in PRIORITY_OPTIONS" :key="item.value" class="priority-pill" :class="{ active: form.priority === item.value }" @tap="form.priority = item.value">{{ item.label }}</text>
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
import { computed, ref } from "vue";
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
const form = ref({ title: "", description: "", priority: "medium" });
const themeVars = ref(getThemeVars(getAppSettings()));

const unfinishedTodos = computed(() => [...todos.value].filter((item) => !item.completed).sort(sortTodos));
const completedTodos = computed(() => [...todos.value].filter((item) => item.completed).sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0)));

function sortTodos(a, b) {
  const rank = { high: 3, medium: 2, low: 1 };
  const diff = (rank[b.priority] || 0) - (rank[a.priority] || 0);
  if (diff !== 0) return diff;
  return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
}

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
}

function saveTodos() {
  setUserStorage(STORAGE_KEY, todos.value);
}

function openCreateEditor() {
  editingId.value = "";
  form.value = { title: "", description: "", priority: "medium" };
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
}

function closeEditor() {
  showEditor.value = false;
}

function submitEditor() {
  if (!form.value.title) {
    uni.showToast({ title: "标题不能为空", icon: "none" });
    return;
  }
  const now = Date.now();
  if (!editingId.value) {
    todos.value = [
      normalizeTodo({
        title: form.value.title,
        description: form.value.description,
        priority: form.value.priority,
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
            title: form.value.title,
            description: form.value.description,
            priority: form.value.priority,
            updatedAt: now,
          })
        : item
    );
  }
  saveTodos();
  showEditor.value = false;
}

function toggleCompleted(id) {
  const now = Date.now();
  todos.value = todos.value.map((item) =>
    item.id === id
      ? normalizeTodo({
          ...item,
          completed: !item.completed,
          updatedAt: now,
          completedAt: !item.completed ? now : 0,
        })
      : item
  );
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
      saveTodos();
    },
  });
}

onShow(() => {
  if (!ensureLogin()) return;
  themeVars.value = getThemeVars(getAppSettings());
  loadTodos();
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
.section-card,
.sheet-panel {
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
  font-size: calc(22rpx * var(--font-scale));
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
  padding: 0 24rpx;
  height: 74rpx;
  line-height: 74rpx;
  border-radius: 999rpx;
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: calc(24rpx * var(--font-scale));
  font-weight: 700;
}

.add-btn::after {
  border: none;
}

.section-card {
  margin-top: 18rpx;
  border-radius: 28rpx;
  padding: 20rpx;
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

.delete-link {
  color: #c75140;
  font-size: calc(22rpx * var(--font-scale));
  font-weight: 700;
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
  padding: 18rpx 20rpx;
  box-sizing: border-box;
  font-size: calc(26rpx * var(--font-scale));
  color: var(--text-main);
}

.sheet-textarea {
  min-height: 180rpx;
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
