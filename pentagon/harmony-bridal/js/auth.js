// auth.js - Authentication utilities

const Auth = (() => {
  const MEMBER_KEY  = 'harmony_session_member';
  const ADMIN_KEY   = 'harmony_session_admin';

  function loginMember(email, password) {
    const members = Store.get('members') ?? [];
    const member  = members.find(m => m.email === email && m.password === password);
    if (!member) return { ok: false, error: 'メールアドレスまたはパスワードが正しくありません。' };
    if (member.status === 'suspended') return { ok: false, error: 'アカウントが休止中です。' };
    const session = { id: member.id, name: member.name, email: member.email, gender: member.gender, loginAt: Date.now() };
    sessionStorage.setItem(MEMBER_KEY, JSON.stringify(session));
    return { ok: true, member };
  }

  function loginAdmin(email, password) {
    const admins = Store.get('admins') ?? [];
    const admin  = admins.find(a => a.email === email && a.password === password);
    if (!admin) return { ok: false, error: 'メールアドレスまたはパスワードが正しくありません。' };
    const session = { id: admin.id, name: admin.name, email: admin.email, role: admin.role, loginAt: Date.now() };
    sessionStorage.setItem(ADMIN_KEY, JSON.stringify(session));
    return { ok: true, admin };
  }

  function logoutMember() {
    sessionStorage.removeItem(MEMBER_KEY);
    window.location.href = '../member/login.html';
  }

  function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_KEY);
    window.location.href = '../admin/login.html';
  }

  function getMemberSession() {
    const raw = sessionStorage.getItem(MEMBER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function getAdminSession() {
    const raw = sessionStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function requireMember() {
    const session = getMemberSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    return session;
  }

  function requireAdmin() {
    const session = getAdminSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    return session;
  }

  function getCurrentMember() {
    const session = getMemberSession();
    if (!session) return null;
    return Store.getById('members', session.id);
  }

  function getCurrentAdmin() {
    const session = getAdminSession();
    if (!session) return null;
    return Store.getById('admins', session.id);
  }

  return { loginMember, loginAdmin, logoutMember, logoutAdmin, getMemberSession, getAdminSession, requireMember, requireAdmin, getCurrentMember, getCurrentAdmin };
})();
