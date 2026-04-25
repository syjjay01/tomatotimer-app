import { getCurrentUser } from "./auth";

export function ensureLogin() {
  if (getCurrentUser()) return true;
  uni.showToast({
    title: "请先登录",
    icon: "none",
  });
  setTimeout(() => {
    uni.reLaunch({ url: "/pages/auth/auth" });
  }, 220);
  return false;
}
