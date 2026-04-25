<template>
  <view class="page" :style="themeVars">
    <view class="ambient ambient-a"></view>
    <view class="ambient ambient-b"></view>

    <view class="hero">
      <view class="brand-row">
        <text class="brand">番工宝</text>
        <image class="brand-logo" src="/static/tabbar/timer-active-v2.png" mode="aspectFit" />
      </view>
      <text class="headline">把专注、待办和工作痕迹放进同一节奏里</text>
      <text class="subline">先登录，再开始今天的番茄钟。</text>
    </view>

    <view class="panel">
      <view class="tabs">
        <view class="tab" :class="{ active: tab === 'login' }" @tap="switchTab('login')">登录</view>
        <view class="tab" :class="{ active: tab === 'register' }" @tap="switchTab('register')">注册</view>
      </view>

      <view class="field">
        <text class="field-label">账号</text>
        <input v-model.trim="username" class="input" placeholder="输入你的账号名" />
      </view>

      <view class="field">
        <text class="field-label">密码</text>
        <input v-model="password" class="input" password placeholder="至少 6 位密码" />
      </view>

      <view v-if="tab === 'register'" class="field">
        <text class="field-label">确认密码</text>
        <input v-model="confirmPassword" class="input" password placeholder="再次输入密码" />
      </view>

      <button class="primary-btn" @tap="submit">
        {{ tab === "login" ? "进入番工宝" : "创建账号并进入" }}
      </button>

      <text class="hint">
        {{ tab === "login" ? "如果账号不存在，会自动切到注册。" : "注册成功后会直接登录，并进入主应用。" }}
      </text>
    </view>
  </view>
</template>

<script setup>
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getCurrentUser, loginUser, registerUser, userExists } from "../../utils/auth";
import { getAppSettings, getThemeVars } from "../../utils/theme";

const tab = ref("login");
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const themeVars = ref(getThemeVars(getAppSettings()));

function switchTab(nextTab) {
  tab.value = nextTab;
}

function submit() {
  const name = String(username.value || "").trim();
  const pwd = String(password.value || "");

  if (!name) {
    uni.showToast({ title: "请输入账号", icon: "none" });
    return;
  }
  if (!pwd) {
    uni.showToast({ title: "请输入密码", icon: "none" });
    return;
  }

  if (tab.value === "login" && !userExists(name)) {
    tab.value = "register";
    confirmPassword.value = pwd;
    uni.showToast({ title: "账号不存在，已切到注册", icon: "none" });
    return;
  }

  if (tab.value === "register") {
    if (pwd !== confirmPassword.value) {
      uni.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }
    const registered = registerUser(name, pwd);
    if (!registered.ok) {
      uni.showToast({ title: registered.message, icon: "none" });
      return;
    }
  }

  const logged = loginUser(name, pwd);
  if (!logged.ok) {
    uni.showToast({ title: logged.message, icon: "none" });
    return;
  }

  uni.showToast({ title: "登录成功", icon: "none" });
  setTimeout(() => {
    uni.switchTab({ url: "/pages/timer/timer" });
  }, 240);
}

onShow(() => {
  if (getCurrentUser()) {
    uni.switchTab({ url: "/pages/timer/timer" });
    return;
  }
  themeVars.value = getThemeVars(getAppSettings());
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(40rpx + env(safe-area-inset-top)) 28rpx 36rpx;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, var(--accent-soft) 0, transparent 34%),
    linear-gradient(160deg, var(--bg-start) 0%, var(--bg-end) 100%);
  position: relative;
  overflow: hidden;
}

.ambient {
  position: absolute;
  border-radius: 999rpx;
  filter: blur(24rpx);
  opacity: 0.45;
}

.ambient-a {
  width: 240rpx;
  height: 240rpx;
  right: -40rpx;
  top: 120rpx;
  background: var(--accent-soft);
}

.ambient-b {
  width: 180rpx;
  height: 180rpx;
  left: -30rpx;
  bottom: 180rpx;
  background: rgba(255, 255, 255, 0.8);
}

.hero {
  position: relative;
  z-index: 1;
  padding-top: 36rpx;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.brand {
  display: inline-block;
  font-size: calc(72rpx * var(--font-scale));
  line-height: 1.08;
  font-weight: 600;
  letter-spacing: 1rpx;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: var(--text-main);
  text-shadow: 0 3rpx 10rpx rgba(18, 49, 77, 0.06);
}

.brand-logo {
  width: 74rpx;
  height: 74rpx;
  opacity: 0.86;
}

.headline {
  display: block;
  margin-top: 24rpx;
  font-size: calc(34rpx * var(--font-scale));
  line-height: 1.45;
  font-weight: 700;
  color: var(--text-main);
}

.subline {
  display: block;
  margin-top: 14rpx;
  font-size: calc(26rpx * var(--font-scale));
  line-height: 1.6;
  color: var(--text-sub);
}

.panel {
  position: relative;
  z-index: 1;
  margin-top: 42rpx;
  background: var(--panel);
  backdrop-filter: blur(18rpx);
  border-radius: 32rpx;
  padding: 24rpx;
  box-shadow: 0 20rpx 70rpx rgba(29, 49, 38, 0.12);
}

.tabs {
  display: flex;
  padding: 8rpx;
  background: var(--panel-soft);
  border-radius: 999rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 999rpx;
  color: var(--text-sub);
  font-size: calc(28rpx * var(--font-scale));
  font-weight: 600;
}

.tab.active {
  background: var(--panel);
  color: var(--accent-deep);
  box-shadow: 0 8rpx 20rpx rgba(23, 58, 90, 0.14);
}

.field {
  margin-top: 18rpx;
}

.field-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: calc(24rpx * var(--font-scale));
  color: var(--text-sub);
}

.input {
  width: 100%;
  height: 96rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 22rpx;
  background: var(--panel-soft);
  border: 1rpx solid var(--border-soft);
  color: var(--text-main);
  font-size: calc(28rpx * var(--font-scale));
}

.primary-btn {
  margin-top: 28rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-deep) 100%);
  color: #ffffff;
  height: 92rpx;
  line-height: 92rpx;
  font-size: calc(30rpx * var(--font-scale));
  font-weight: 700;
}

.primary-btn::after {
  border: none;
}

.hint {
  display: block;
  margin-top: 16rpx;
  font-size: calc(24rpx * var(--font-scale));
  line-height: 1.6;
  color: var(--text-sub);
}
</style>
