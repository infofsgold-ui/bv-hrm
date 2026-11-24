/* ===== Cầu nối Google Apps Script: đăng nhập · đồng bộ Google Sheets · Google Drive ===== */
(function () {
  const MODE = window.__MODE;                       // 'hr' | 'nv'
  const TOK_KEY = 'hrm-tok-' + MODE;
  const ID_KEYS = ['employees', 'candidates', 'companies', 'departments', 'freelancers', 'incomeTypes', 'jobs', 'leaves', 'levels', 'notifications', 'otherIncomes', 'projects', 'proposals', 'requestTypes', 'requests', 'transfers', 'users', 'workLocations', 'allowanceTypes', 'inbox', 'checkins'];
  const SY = { tok: '', ver: 0, base: {}, timer: null, busy: false, again: false, dirty: false, started: false, fails: 0 };
  window.__SY = SY;
  const ss = { get: k => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) { } } };
  const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { } } };
  const tok = {
    get: () => ls.get(TOK_KEY) || ss.get(TOK_KEY),
    set: (v, remember) => { ls.set(TOK_KEY, ''); ss.set(TOK_KEY, ''); if (v) (remember === false ? ss : ls).set(TOK_KEY, v); }
  };
  const LAST = 'hrm-last-' + MODE;   // tài khoản đăng nhập lần trước (không lưu mật khẩu – mật khẩu để trình duyệt/Keychain lưu)
  /* Bản sao dữ liệu trên máy (IndexedDB): mở lại app hiện ngay, sau đó chỉ tải phần thay đổi */
  const SNAP = 'snap-' + MODE;
  const idb = () => new Promise((res, rej) => { try { const r = indexedDB.open('bv-hrm', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  const idbGet = k => idb().then(d => new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null);
  const idbSet = (k, v) => idb().then(d => new Promise(res => { const t = d.transaction('kv', 'readwrite'); v === null ? t.objectStore('kv').delete(k) : t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; })).catch(() => { });
  let snapT = null;
  function saveSnap() {
    clearTimeout(snapT);
    snapT = setTimeout(() => { if (!SY.started || SY.dirty || SY.busy) return; idbSet(SNAP, { tok: SY.tok, ver: SY.ver, sess: window.__SESS, at: Date.now(), db: JSON.stringify(DB) }); }, 1500);
  }
  const dropSnap = () => idbSet(SNAP, null);
  // Gọi máy chủ: trang ngoài (GitHub Pages) dùng fetch tới Apps Script; trang trong Apps Script dùng google.script.run
  const API = (fn, ...a) => window.__API_URL
    ? fetch(window.__API_URL, { method: 'POST', body: JSON.stringify({ fn, args: a }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' })
        .then(r => { if (!r.ok) throw new Error('Máy chủ trả lỗi ' + r.status); return r.json(); })
        .then(r => { if (r.error) throw new Error(r.error); return r.result; })
    : new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...a));
  // Nạp mã phần mềm sau khi có dữ liệu (theo đúng thứ tự)
  function loadScripts() {
    if (window.__SRC) { window.__SRC.forEach(code => { const s = document.createElement('script'); s.textContent = code; document.body.appendChild(s); }); return Promise.resolve(); }
    return (window.__SCRIPTS || []).reduce((p, src) => p.then(() => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được ' + src)); document.body.appendChild(s); })), Promise.resolve());
  }
  const errMsg = e => String((e && e.message) || e || '').replace(/^Error:\s*/, '');
  const expired = e => /SESSION_EXPIRED/.test(errMsg(e));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- giao diện đăng nhập ---------- */
  const css = document.createElement('style');
  css.textContent = `#gasBox{position:fixed;inset:0;z-index:9999;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;overflow:auto;padding:20px;background:var(--bg,#f6f4f1)}
  #gasBox .gb{box-sizing:border-box;width:380px;max-width:100%;background:var(--card,#fff);border:1px solid var(--line,#e8e2da);border-radius:22px;padding:26px;box-shadow:0 18px 50px rgba(0,0,0,.08)}
  #gasBox .gl{display:flex;justify-content:center;margin-bottom:8px}#gasBox .gl img{height:54px}
  #gasBox h1{font-size:21px;text-align:center;margin:6px 0 4px}#gasBox p{text-align:center;color:var(--muted,#888);font-size:13px;margin:0 0 16px}
  #gasBox label{display:block;font-size:13px;font-weight:600;margin:10px 0 0}#gasBox input{width:100%;margin-top:6px;box-sizing:border-box}
  #gasBox .gbtn{width:100%;margin-top:16px;justify-content:center}#gasBox .gerr{color:#c0392b;font-size:13px;min-height:18px;margin-top:8px;text-align:center}
  #gasBox .gchk{display:flex;align-items:center;gap:8px;font-weight:500;margin-top:12px;cursor:pointer}#gasBox .gchk input{width:18px;height:18px;margin:0;accent-color:#1D1D1B}
  #gasBox .gpw{position:relative;display:block}#gasBox .gpw input{padding-right:64px}#gasBox .geye{position:absolute;right:8px;top:50%;transform:translateY(-50%);margin-top:3px;border:0;background:none;color:var(--muted,#888);font:inherit;font-size:13px;cursor:pointer;padding:6px}
  #gasBox .gspin{text-align:center;color:var(--muted,#888);font-size:14px}
  body.portal #gasBox{background:var(--m-bg)}body.portal #gasBox .gb{background:var(--m-card);border:0;border-radius:32px}
  #gasSync{position:fixed;left:14px;bottom:12px;z-index:50;font-size:11.5px;padding:5px 10px;border-radius:99px;background:var(--card,#fff);border:1px solid var(--line,#e8e2da);color:var(--muted,#777);box-shadow:0 2px 8px rgba(0,0,0,.06)}
  #gasSync.err{color:#c0392b;border-color:#f0b4ae}body.portal #gasSync{display:none}body.portal #gasSync.err{display:block;bottom:auto;top:10px;left:50%;transform:translateX(-50%)}
  .drv-list a{word-break:break-all}`;
  document.head.appendChild(css);
  function box(html) { let b = document.getElementById('gasBox'); if (!b) { b = document.createElement('div'); b.id = 'gasBox'; document.body.appendChild(b); } b.innerHTML = `<div class="gb"><div class="gl"><img src="${window.__LOGO}" alt="BV group"></div>${html}</div>`; return b; }
  const closeBox = () => { const b = document.getElementById('gasBox'); if (b) b.remove(); };
  function loginForm(again) {
    let last = {}; try { last = JSON.parse(ls.get(LAST) || '{}'); } catch (e) { }
    const nv = MODE === 'nv', inCls = nv ? 'm-in' : 'input', btnCls = nv ? 'm-btn lime big gbtn' : 'btn primary gbtn';
    box(`<h1>${nv ? 'Cổng nhân viên' : 'Quản lý nhân sự'}</h1><p>${again ? 'Phiên đăng nhập đã hết hạn – đăng nhập lại để tiếp tục (dữ liệu chưa lưu vẫn được giữ).' : nv ? 'Chấm công · lương · đơn từ' : 'BV Group · đăng nhập tài khoản HR'}</p>
      <form id="gForm" autocomplete="on" action="#" method="post">
      <label>${nv ? 'Mã nhân viên' : 'Tên đăng nhập'}<input class="${inCls}" id="gU" name="username" autocomplete="username" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="${nv ? 'VD: NV0001' : 'VD: admin'}" value="${h(last.u)}"></label>
      <label>Mật khẩu<span class="gpw"><input class="${inCls}" id="gP" name="password" type="password" autocomplete="current-password" placeholder="${nv ? 'Mặc định: ngày sinh ddmmyyyy' : ''}"><button type="button" class="geye" id="gEye" aria-label="Hiện mật khẩu">Hiện</button></span></label>
      <label class="gchk"><input type="checkbox" id="gRem" ${last.r === false ? '' : 'checked'}><span>Ghi nhớ đăng nhập trên thiết bị này</span></label>
      <button type="submit" class="${btnCls}" id="gGo">Đăng nhập</button></form><div class="gerr" id="gErr"></div>
      <p style="margin:6px 0 0;font-size:12px">Quên mật khẩu? Liên hệ ${nv ? 'Phòng HCNS' : 'Quản trị hệ thống'}.</p>`);
    const go = async () => {
      const u = document.getElementById('gU').value.trim(), p = document.getElementById('gP').value;
      if (!u || !p) return (document.getElementById('gErr').textContent = 'Nhập đủ tài khoản và mật khẩu');
      document.getElementById('gGo').disabled = true; document.getElementById('gErr').textContent = 'Đang đăng nhập…';
      try {
        const rem = document.getElementById('gRem').checked;
        const r = await API(nv ? 'apiPortalLogin' : 'apiLogin', u, p, rem); SY.lastPw = p;
        tok.set(r.token, rem); SY.tok = r.token;
        ls.set(LAST, rem ? JSON.stringify({ u, r: true }) : JSON.stringify({ r: false }));
        if (again) { closeBox(); pull().catch(() => { }).then(flush); return; }
        await start(r.token, r.needChange, r.load);
      } catch (e) { document.getElementById('gErr').textContent = errMsg(e); document.getElementById('gGo').disabled = false; }
    };
    document.getElementById('gForm').onsubmit = ev => { ev.preventDefault(); go(); };
    document.getElementById('gEye').onclick = () => { const i = document.getElementById('gP'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; document.getElementById('gEye').textContent = show ? 'Ẩn' : 'Hiện'; };
    setTimeout(() => { const f = document.getElementById(last.u ? 'gP' : 'gU'); if (f) f.focus(); }, 50);
  }
  function mustChangePw() {
    const nv = MODE === 'nv', inCls = nv ? 'm-in' : 'input';
    box(`<h1>Đặt mật khẩu mới</h1><p>Lần đăng nhập đầu tiên – hãy đổi mật khẩu mặc định (tối thiểu 6 ký tự).</p>
      <label>Mật khẩu mới<input class="${inCls}" id="gN1" type="password" autocomplete="new-password"></label><label>Nhập lại<input class="${inCls}" id="gN2" type="password" autocomplete="new-password"></label>
      <button class="${nv ? 'm-btn lime big gbtn' : 'btn primary gbtn'}" id="gGo">Lưu mật khẩu</button><div class="gerr" id="gErr"></div>`);
    document.getElementById('gGo').onclick = async () => {
      const a = document.getElementById('gN1').value, b = document.getElementById('gN2').value;
      if (a.length < 6) return (document.getElementById('gErr').textContent = 'Tối thiểu 6 ký tự'); if (a !== b) return (document.getElementById('gErr').textContent = 'Hai lần nhập không khớp');
      try { await API('apiChangePw', SY.tok, SY.lastPw || '', a); closeBox(); toast('Đã đổi mật khẩu'); } catch (e) { document.getElementById('gErr').textContent = errMsg(e); }
    };
  }

  /* ---------- ảnh chụp dữ liệu để tính phần thay đổi ---------- */
  function snapKey(k, v) {
    if (ID_KEYS.indexOf(k) >= 0 && Array.isArray(v)) {
      const m = {}, ord = [];
      v.forEach(x => {
        if (!x || typeof x !== 'object') return;
        if (x.id === undefined || x.id === null || x.id === '' || (String(x.id) in m)) x.id = k.slice(0, 2).toUpperCase() + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        m[String(x.id)] = JSON.stringify(x); ord.push(String(x.id));
      });
      return { t: 'a', m, ord: ord.join('\u0001') };
    }
    if (isObj(v)) { const m = {}; Object.keys(v).forEach(s => { if (v[s] !== undefined) m[s] = JSON.stringify(v[s]); }); return { t: 'o', m }; }
    return { t: 'v', j: JSON.stringify(v === undefined ? null : v) };
  }
  function diffKey(k, n, b) {
    if (!b || b.t !== n.t) {
      if (n.t === 'a') return { t: 'a', up: Object.values(n.m).map(s => JSON.parse(s)), del: b && b.t === 'a' ? Object.keys(b.m).filter(id => !(id in n.m)) : [], order: n.ord ? n.ord.split('\u0001') : [] };
      if (n.t === 'o') { const up = {}; Object.keys(n.m).forEach(s => up[s] = JSON.parse(n.m[s])); return { t: 'o', up, del: b && b.t === 'o' ? Object.keys(b.m).filter(s => !(s in n.m)) : [] }; }
      return { t: 'v', v: JSON.parse(n.j) };
    }
    if (n.t === 'a') {
      const up = [], del = [];
      Object.keys(n.m).forEach(id => { if (n.m[id] !== b.m[id]) up.push(JSON.parse(n.m[id])); });
      Object.keys(b.m).forEach(id => { if (!(id in n.m)) del.push(id); });
      if (!up.length && !del.length && n.ord === b.ord) return null;
      const c = { t: 'a', up, del }; if (n.ord !== b.ord) c.order = n.ord ? n.ord.split('\u0001') : []; return c;
    }
    if (n.t === 'o') {
      const up = {}, del = []; let any = false;
      Object.keys(n.m).forEach(s => { if (n.m[s] !== b.m[s]) { up[s] = JSON.parse(n.m[s]); any = true; } });
      Object.keys(b.m).forEach(s => { if (!(s in n.m)) { del.push(s); any = true; } });
      return any ? { t: 'o', up, del } : null;
    }
    return n.j !== b.j ? { t: 'v', v: JSON.parse(n.j) } : null;
  }
  function diffAll() {
    const ch = {}, next = {}, keys = new Set(Object.keys(DB).concat(Object.keys(SY.base)));
    keys.forEach(k => {
      if (DB[k] === undefined) { if (SY.base[k]) { ch[k] = { t: 'x' }; next[k] = null; } return; }
      const n = snapKey(k, DB[k]), d = diffKey(k, n, SY.base[k]); next[k] = n; if (d) ch[k] = d;
    });
    return { ch, next };
  }
  const keyDirty = k => { if (DB[k] === undefined) return !!SY.base[k]; return !!diffKey(k, snapKey(k, DB[k]), SY.base[k]); };

  /* ---------- lưu / tải ---------- */
  const pill = (txt, err) => { let p = document.getElementById('gasSync'); if (!p) { p = document.createElement('div'); p.id = 'gasSync'; document.body.appendChild(p); } p.textContent = txt; p.classList.toggle('err', !!err); };
  function schedule() { if (!SY.started) return; SY.dirty = true; pill('Đang lưu…'); clearTimeout(SY.timer); SY.timer = setTimeout(flush, 700); }
  async function flush() {
    if (!SY.started) return; if (SY.busy) { SY.again = true; return; }
    const { ch, next } = diffAll();
    if (!Object.keys(ch).length) { SY.dirty = false; pill('✓ Đã lưu lên Google Sheets'); return; }
    SY.busy = true; pill('Đang lưu…');
    const since = SY.ver;
    try {
      const r = await API('apiSave', SY.tok, ch, since);
      Object.keys(next).forEach(k => { if (next[k] === null) delete SY.base[k]; else SY.base[k] = next[k]; });
      SY.ver = r.ver; SY.fails = 0; SY.dirty = false;
      pill('✓ Đã lưu lên Google Sheets · ' + new Date().toTimeString().slice(0, 5));
      if (r.resync) await pull(since);
      saveSnap();
    } catch (e) {
      if (expired(e)) { tok.set(''); loginForm(true); pill('Chưa lưu – cần đăng nhập lại', true); }
      else { SY.fails++; pill('Chưa lưu được (' + errMsg(e).slice(0, 80) + ') – tự thử lại', true); clearTimeout(SY.timer); SY.timer = setTimeout(flush, Math.min(60000, 4000 * SY.fails)); }
    } finally { SY.busy = false; if (SY.again) { SY.again = false; setTimeout(flush, 50); } }
  }
  async function pull(since) {
    const r = await API('apiPull', SY.tok, since == null ? SY.ver : since);
    let changed = false;
    Object.keys(r.keys || {}).forEach(k => {
      if (keyDirty(k)) return;                         // đang có thay đổi chưa lưu → giữ của mình
      const v = r.keys[k];
      if (v === null) { if (DB[k] !== undefined) { delete DB[k]; changed = true; } delete SY.base[k]; return; }
      if (k === 'settings' && v.brackets) v.brackets = v.brackets.map(b => [b[0] === null ? Infinity : b[0], b[1]]);
      DB[k] = v; SY.base[k] = snapKey(k, v); changed = true;
    });
    SY.ver = Math.max(SY.ver, r.ver);
    if (changed) { rerender(); saveSnap(); }
  }
  function rerender() {
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    const modalOpen = document.getElementById('modalBg') && document.getElementById('modalBg').classList.contains('show');
    if (typing || modalOpen) return;
    try { if (MODE === 'nv') { if (typeof PS !== 'undefined' && PS.tab !== 'checkin') portalRender(); } else router(true); } catch (e) { }
  }
  setInterval(() => { if (SY.started && !SY.dirty && !SY.busy && document.visibilityState === 'visible') pull().catch(e => { if (expired(e)) { tok.set(''); loginForm(true); } }); }, 45000);
  window.addEventListener('beforeunload', ev => { if (SY.dirty || SY.busy) { ev.preventDefault(); ev.returnValue = ''; } });
  window.__gasSave = schedule;

  /* ---------- khởi động ---------- */
  async function start(token, needChange, pre, fromSnap) {
    if (!pre) box('<div class="gspin">Đang tải dữ liệu…</div>');
    const r = pre || await API('apiLoad', token);
    SY.tok = token; SY.ver = r.ver;
    if (r.db) Object.keys(r.db).forEach(k => SY.base[k] = snapKey(k, JSON.parse(JSON.stringify(r.db[k]))));
    window.__SERVER_DB_STR = r.db ? JSON.stringify(r.db) : '';
    if (MODE === 'hr') { try { localStorage.setItem('hrm-user', r.sess.uid); } catch (e) { } }
    else ss.set('hrm-portal', r.sess.eid);
    window.__SESS = r.sess;
    await loadScripts();
    afterLoad();
    SY.started = true; closeBox();
    if (needChange) mustChangePw();
    if (fromSnap) {   // đang hiện dữ liệu trên máy → lấy phần thay đổi từ máy chủ ở nền
      pill('Đang cập nhật…');
      pull().then(() => { pill('✓ Đã cập nhật'); flush(); }).catch(e => { if (expired(e)) { tok.set(''); dropSnap(); loginForm(true); } else pill('Chưa cập nhật được – đang dùng dữ liệu trên máy', true); });
    } else { flush(); saveSnap(); }   // lưu phần nâng cấp dữ liệu / dữ liệu mẫu lần đầu
  }
  async function boot() {
    const t0 = tok.get();
    if (t0) {
      const sn = await idbGet(SNAP);
      if (sn && sn.tok === t0 && sn.db) { try { await start(t0, false, { db: JSON.parse(sn.db), ver: sn.ver, sess: sn.sess }, true); return; } catch (e) { console.warn(e); } }
      try { await start(t0); return; } catch (e) { tok.set(''); if (!expired(e)) { box(`<div class="gerr">Không tải được dữ liệu: ${h(errMsg(e))}</div>`); return; } }
    }
    loginForm(false);
  }

  /* ---------- gắn vào phần mềm sau khi tải ---------- */
  function fileB64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); }); }
  async function upload(kind, sub, name, file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('File quá 20MB');
    toast('Đang tải lên Google Drive…');
    return API('apiUpload', SY.tok, kind, sub, name, await fileB64(file), file.type);
  }
  const fileList = L => (L || []).length ? `<div class="drv-list">${L.map(f => `<div class="list-item"><div class="grow"><a class="link" href="${h(f.url)}" target="_blank" rel="noopener">${h(f.name)}</a><br><small class="muted">${h(f.at || '')}${f.by ? ' · ' + h(f.by) : ''}</small></div></div>`).join('')}</div>` : '<p class="muted">Chưa có file.</p>';
  function afterLoad() {
    window.resetDB = (orig => () => { orig(); schedule(); })(window.resetDB);
    if (MODE === 'hr') afterHR(); else afterNV();
  }
  function afterHR() {
    const link = document.querySelector('.side-foot a[href="nhan-vien.html"]');
    if (link && window.__GAS_IFRAME) { link.href = window.__APP_URL + '?p=nv'; link.target = '_blank'; link.rel = 'noopener'; }
    const ver = document.querySelector('.side-foot .ver'); if (ver) ver.textContent = 'HRM · Google Sheets';
    // tài khoản đang đăng nhập: đổi mật khẩu, đăng xuất
    window.switchUser = () => {
      const u = curUser();
      modal(`<h3>${esc(u.name)}</h3><p class="muted" style="margin-top:-8px">${esc(u.username)} · ${esc(u.role)}</p><div class="form">
        <label class="full">Mật khẩu hiện tại<input class="input" type="password" id="cp0"></label><label>Mật khẩu mới (≥ 6 ký tự)<input class="input" type="password" id="cp1"></label><label>Nhập lại<input class="input" type="password" id="cp2"></label></div>
        <div class="modal-foot"><button class="btn" id="cpOut">Đăng xuất</button><span style="flex:1"></span><button class="btn" data-close>Đóng</button><button class="btn primary" id="cpGo">Đổi mật khẩu</button></div>`);
      $('#cpOut').onclick = () => { tok.set(''); dropSnap().then(() => location.reload()); };
      $('#cpGo').onclick = async () => { if ($('#cp1').value !== $('#cp2').value) return toast('Hai lần nhập không khớp'); try { await API('apiChangePw', SY.tok, $('#cp0').value, $('#cp1').value); closeModal(); toast('Đã đổi mật khẩu'); } catch (e) { toast(errMsg(e)); } };
    };
    window.useUser = () => toast('Mỗi người đăng nhập bằng tài khoản riêng');
    const pm = window.paintMe; window.paintMe = () => { pm(); const el = $('.me'); if (el) el.title = 'Tài khoản · đổi mật khẩu · đăng xuất'; };
    window.resetPortalPw = async id => { const e = emp(id); try { await API('apiResetPw', SY.tok, 'E', id); toast(`Đã đặt lại – mật khẩu Web App của ${e.name} là ngày sinh dạng ddmmyyyy`); } catch (err) { toast(errMsg(err)); } };
    window.gasResetUserPw = async id => { const u = DB.users.find(x => x.id === id); try { await API('apiResetPw', SY.tok, 'U', id); toast(`Đã đặt lại mật khẩu của ${u.username} về mặc định – đổi khi đăng nhập lần đầu`); } catch (err) { toast(errMsg(err)); } };
    // Người dùng: thay nút "Chuyển tài khoản" bằng đặt lại mật khẩu
    wrapFn(PAGES, 'he-thong/nguoi-dung', (orig, m) => {
      orig(m);
      $$("button[onclick='switchUser()']", m).forEach(b => b.remove());
      if (curUser().role !== 'Quản trị hệ thống') return;
      $$('tbody tr', m).forEach((tr, i) => { const u = DB.users[i]; const td = tr.lastElementChild; if (u && td && tr.closest('table:not(.perm)')) td.insertAdjacentHTML('beforeend', ` <button class="btn sm" onclick="gasResetUserPw('${u.id}')" title="Đặt lại mật khẩu về mặc định">Đặt lại MK</button>`); });
    });
    // Hợp đồng: lưu bản scan đã ký lên Drive (thư mục Hợp đồng / công ty)
    window.gasCtUpload = async (id, input) => {
      const e = emp(id), f = input.files[0]; if (!f) return;
      try {
        const r = await upload('ct', coShort(e.company), `${e.contractNo || 'HĐ'} - ${e.id} ${e.name} - ${f.name}`, f);
        (e.contractFiles = e.contractFiles || []).unshift(Object.assign(r, { no: e.contractNo || '', by: curUser().name })); saveDB(); toast('Đã lưu hợp đồng lên Google Drive'); router(true);
      } catch (err) { toast(errMsg(err)); }
    };
    const ed = window.empDetail;
    window.empDetail = (m, e) => {
      ed(m, e);
      if ((state.edTab || 'info') !== 'ct') return;
      m.insertAdjacentHTML('beforeend', `<div class="card mt"><div class="card-h"><h3>File hợp đồng trên Google Drive</h3><label class="btn sm primary">${I('upload')}Tải bản HĐ đã ký<input type="file" hidden accept=".pdf,image/*,.doc,.docx" onchange="gasCtUpload('${e.id}', this)"></label></div>${fileList(e.contractFiles)}</div>`);
    };
    // Tờ trình: lưu PDF + bản đã ký lên Drive (thư mục Tờ trình / công ty)
    window.gasTTPdf = async id => {
      const p = DB.proposals.find(x => x.id === id), d = $('#modal .doc'); if (!p || !d) return;
      const c = d.cloneNode(true); c.querySelectorAll('.modal-foot,button').forEach(x => x.remove());
      toast('Đang tạo PDF và lưu lên Google Drive…');
      try { const r = await API('apiSavePdf', SY.tok, 'tt', coShort(p.company), `${p.id} - ${p.title}`, c.innerHTML); (p.files = p.files || []).unshift(Object.assign(r, { by: curUser().name })); saveDB(); toast('Đã lưu tờ trình PDF lên Drive'); viewTT(id); } catch (err) { toast(errMsg(err)); }
    };
    window.gasTTUpload = async (id, input) => {
      const p = DB.proposals.find(x => x.id === id), f = input.files[0]; if (!p || !f) return;
      try { const r = await upload('tt', coShort(p.company), `${p.id} - đã ký - ${f.name}`, f); (p.files = p.files || []).unshift(Object.assign(r, { by: curUser().name })); saveDB(); toast('Đã lưu bản ký lên Drive'); viewTT(id); } catch (err) { toast(errMsg(err)); }
    };
    const vt = window.viewTT;
    window.viewTT = id => {
      vt(id); const p = DB.proposals.find(x => x.id === id), f = $('#modal .modal-foot'); if (!p || !f) return;
      f.insertAdjacentHTML('beforebegin', `<div class="card mt" style="box-shadow:none"><div class="card-h"><h3>File trên Google Drive</h3></div>${fileList(p.files)}</div>`);
      f.insertAdjacentHTML('afterbegin', `<button class="btn" onclick="gasTTPdf('${p.id}')">${I('upload')}Lưu PDF lên Drive</button><label class="btn">${I('upload')}Tải bản đã ký<input type="file" hidden accept=".pdf,image/*" onchange="gasTTUpload('${p.id}', this)"></label>`);
    };
  }
  function afterNV() {
    window.portalLogin = () => { tok.set(''); ss.set('hrm-portal', ''); dropSnap().then(() => location.reload()); };
    const pme = PV.me;
    PV.me = (m, e) => {
      pme(m, e); const b = document.getElementById('pwGo'); if (!b) return;
      b.onclick = async () => { const n = $('#pw1').value; if (n.length < 6) return toast('Mật khẩu mới tối thiểu 6 ký tự'); try { await API('apiChangePw', SY.tok, $('#pw0').value, n); toast('Đã đổi mật khẩu'); portalRender(); } catch (err) { toast(errMsg(err)); } };
    };
  }

  let booted = false; const go = () => { if (booted) return; booted = true; boot(); };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', go); window.addEventListener('load', go); } else setTimeout(go, 0);
})();
