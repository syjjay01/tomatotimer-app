const USERS_KEY = "__fgb_users__";
const SESSION_KEY = "__fgb_session__";

function readUsers() {
  const raw = uni.getStorageSync(USERS_KEY);
  return Array.isArray(raw) ? raw : [];
}

function writeUsers(users) {
  uni.setStorageSync(USERS_KEY, users);
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

export function userExists(username) {
  const name = normalizeUsername(username).toLowerCase();
  if (!name) return false;
  return readUsers().some((user) => user.username.toLowerCase() === name);
}

export function registerUser(username, password) {
  const name = normalizeUsername(username);
  const pwd = String(password || "");

  if (!name) {
    return { ok: false, message: "用户名不能为空" };
  }
  if (name.length < 3) {
    return { ok: false, message: "用户名至少 3 位" };
  }
  if (!pwd || pwd.length < 6) {
    return { ok: false, message: "密码至少 6 位" };
  }
  if (userExists(name)) {
    return { ok: false, message: "用户名已存在" };
  }

  const user = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    username: name,
    password: pwd,
    createdAt: Date.now(),
  };

  writeUsers([user, ...readUsers()]);
  return { ok: true, user };
}

export function loginUser(username, password) {
  const name = normalizeUsername(username).toLowerCase();
  const pwd = String(password || "");
  const user = readUsers().find((item) => item.username.toLowerCase() === name);

  if (!user || user.password !== pwd) {
    return { ok: false, message: "用户名或密码错误" };
  }

  uni.setStorageSync(SESSION_KEY, {
    userId: user.id,
    loginAt: Date.now(),
  });

  return { ok: true, user };
}

export function getCurrentUser() {
  const session = uni.getStorageSync(SESSION_KEY) || {};
  if (!session.userId) return null;
  return readUsers().find((item) => item.id === session.userId) || null;
}

export function getCurrentUserId() {
  return getCurrentUser()?.id || "";
}

export function logoutUser() {
  uni.removeStorageSync(SESSION_KEY);
}

export function deleteCurrentUser() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return { ok: false, message: "当前未登录" };
  }

  writeUsers(readUsers().filter((user) => user.id !== currentUser.id));
  uni.removeStorageSync(SESSION_KEY);
  return { ok: true };
}
