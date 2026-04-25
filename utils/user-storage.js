import { getCurrentUserId } from "./auth";

function getScopedKey(baseKey, userId) {
  return `fgb:${userId}:${baseKey}`;
}

export function userStorageKey(baseKey) {
  const uid = getCurrentUserId();
  if (!uid) return "";
  return getScopedKey(baseKey, uid);
}

export function getUserStorage(baseKey, defaultValue = null) {
  const uid = getCurrentUserId();
  if (!uid) return defaultValue;
  const scopedKey = getScopedKey(baseKey, uid);
  const scopedVal = uni.getStorageSync(scopedKey);
  if (scopedVal !== "" && scopedVal !== undefined && scopedVal !== null) {
    return scopedVal;
  }

  // Legacy migration: if old global key exists, copy once into current user scope.
  const legacyVal = uni.getStorageSync(baseKey);
  if (legacyVal !== "" && legacyVal !== undefined && legacyVal !== null) {
    uni.setStorageSync(scopedKey, legacyVal);
    return legacyVal;
  }
  return defaultValue;
}

export function setUserStorage(baseKey, value) {
  const uid = getCurrentUserId();
  if (!uid) return false;
  const scopedKey = getScopedKey(baseKey, uid);
  uni.setStorageSync(scopedKey, value);
  return true;
}

export function removeUserStorage(baseKey) {
  const uid = getCurrentUserId();
  if (!uid) return;
  uni.removeStorageSync(getScopedKey(baseKey, uid));
}

export function clearCurrentUserScopedData() {
  const uid = getCurrentUserId();
  if (!uid) return;
  const all = uni.getStorageInfoSync();
  const keys = Array.isArray(all?.keys) ? all.keys : [];
  const prefix = `fgb:${uid}:`;
  keys.forEach((k) => {
    if (String(k).startsWith(prefix)) {
      uni.removeStorageSync(k);
    }
  });
}
