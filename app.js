'use strict';
/* ===== پایه: ذخیره‌سازی، نقش‌ها، دسترسی‌ها ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DB = {
  get(k, d) { try { const v = localStorage.getItem('sms_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sms_' + k, JSON.stringify(v)); return true; } catch { alert('حافظه مرورگر پر است. حجم تصاویر را کمتر کنید.'); return false; } }
};
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sms|' + s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const ROLES = { superadmin: 'مدیر کل', dev: 'برنامه‌نویس', admin: 'مدیر', teacher: 'معلم', student: 'دانش‌آموز', parent: 'ولی' };
const RANK = { superadmin: 5, dev: 4, admin: 3, teacher: 2, student: 1, parent: 1 };
// بخش‌های ستاره‌دار در مراحل بعد ساخته می‌شوند؛ ماتریس دسترسی از همین حالا برای همه آماده است
const SEC = { home: 'ویرایش صفحه اصلی', users: 'کاربران', perms: 'سطوح دسترسی', logs: 'فعالیت و امنیت', backup: 'پشتیبان‌گیری',
  students: 'دانش‌آموزان و اولیا *', attendance: 'حضور و غیاب *', requests: 'درخواست‌ها *', messages: 'پیام‌رسان *', reports: 'گزارش روزانه و تکلیف *',
  grades: 'دفتر نمره و امتیاز *', schedule: 'برنامه هفتگی *', notices: 'اطلاع‌رسانی *', exams: 'آزمون *', online: 'کلاس آنلاین *' };
const READY = ['home', 'users', 'perms', 'logs', 'backup'];
const DEFP = { dev: ['logs', 'backup', 'users'], admin: ['home', 'users', 'students', 'attendance', 'requests', 'messages', 'notices', 'schedule', 'online'],
  teacher: ['attendance', 'messages', 'reports', 'grades', 'exams', 'schedule', 'notices', 'online'], student: ['messages', 'reports', 'grades', 'exams', 'schedule', 'notices', 'online', 'requests'], parent: ['messages', 'notices', 'requests', 'schedule'] };
const P = () => DB.get('perms', DEFP);
const can = (role, sec) => role === 'superadmin' || (P()[role] || []).includes(sec);
const me = () => DB.get('users', []).find(u => u.id == sessionStorage.getItem('uid') && u.active !== false);
const log = (a, l = 'info', u) => { const L = DB.get('logs', []); L.unshift({ t: new Date().toLocaleString('fa-IR'), u: u || me()?.username || '-', a, l }); DB.set('logs', L.slice(0, 500)); };

const DEF = { name: 'مدرسه نمونه', banner: 'ثبت‌نام سال تحصیلی جدید آغاز شد', ticker: 'به سامانه مدرسه خوش آمدید  ✦  اطلاعیه‌ها را از بخش پنل دنبال کنید',
  slides: [{ img: '', title: 'به مدرسه ما خوش آمدید', text: 'محیطی امن برای یادگیری و رشد' }, { img: '', title: 'کلاس‌ها و برنامه‌ها', text: 'همه چیز در یک سامانه' }],
  gallery: [], about: 'متن درباره ما را از پنل مدیریت > ویرایش صفحه اصلی تغییر دهید.', phone: '', email: '', address: '', footer: 'کلیه حقوق برای مدرسه محفوظ است' };
const S = () => ({ ...DEF, ...DB.get('site', {}) });

async function seed() {
  if (DB.get('users', null)) return;
  DB.set('users', [
    { id: 1, username: 'superadmin', pass: await sha('Admin@123'), role: 'superadmin', name: 'مدیر کل', phone: '', active: true, must: true },
    { id: 2, username: 'dev', pass: await sha('Dev@12345'), role: 'dev', name: 'برنامه‌نویس', phone: '', active: true, must: true }]);
  DB.set('perms', DEFP);
}

/* ===== آپلود امن: فقط jpg / png / pdf / صوتی ===== */
const OKTYPE = ['image/jpeg', 'image/png', 'application/pdf'];
function readFile(f, maxMB = 3) {
  return new Promise((res, rej) => {
    if (!f) return rej('فایلی انتخاب نشده');
    const okExt = /\.(jpe?g|png|pdf|mp3|wav|ogg|m4a)$/i.test(f.name);
    if (!okExt || !(OKTYPE.includes(f.type) || f.type.startsWith('audio/'))) return rej('فقط فرمت‌های JPG، PNG، PDF یا فایل صوتی مجاز است');
    if (f.size > maxMB * 1048576) return rej('حجم فایل بیشتر از ' + maxMB + ' مگابایت است');
    const r = new FileReader();
    r.onerror = () => rej('خطا در خواندن فایل');
    r.onload = () => {
      if (!f.type.startsWith('image/')) return res(r.result);
      const im = new Image();
      im.onload = () => { const k = Math.min(1, 1200 / im.width), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); };
      im.onerror = () => rej('تصویر معتبر نیست'); im.src = r.result;
    };
    r.readAsDataURL(f);
  });
}
const safeUrl = u => /^https:\/\/[^\s"'<>]+$/.test(u);
function vidHtml(u) {
  const y = u.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return y ? `<iframe src="https://www.youtube-nocookie.com/embed/${y[1]}" allowfullscreen loading="lazy" title="ویدیو"></iframe>` : `<video src="${esc(u)}" controls preload="none"></video>`;
}

/* ===== پوسته مشترک ===== */
let timer;
function shell(inner) {
  const s = S(), u = me();
  $('#top').innerHTML = `<div class="fixbar">${esc(s.banner)}</div><div class="ticker"><span>${esc(s.ticker)}</span></div>
  <header><a class="logo" href="#/">${esc(s.name)}</a><button id="mb" aria-label="منو" onclick="document.body.classList.toggle('nav')">☰</button>
  <nav><a href="#/">خانه</a><a href="#/about">درباره ما</a><a href="#/contact">تماس با ما</a>
  ${u ? `<a href="#/panel">پنل من</a><a href="#/" onclick="A.out()">خروج</a>` : `<a class="btn" href="#/login">ورود</a>`}</nav></header>`;
  $('#app').innerHTML = inner;
  $('#foot').innerHTML = esc(s.footer);
  document.body.classList.remove('nav');
}
function slider(s) {
  const sl = s.slides.length ? s.slides : DEF.slides;
  return `<section class="slider" aria-label="اسلایدر">${sl.map((x, i) => `<div class="slide${i ? '' : ' on'}" style="background-image:${x.img ? `url('${esc(x.img)}')` : 'linear-gradient(135deg,#17352f,#2c5a50)'}">
  <div class="cap"><h2>${esc(x.title)}</h2><p>${esc(x.text)}</p></div></div>`).join('')}
  <div class="dots">${sl.map((_, i) => `<i class="${i ? '' : 'on'}" onclick="A.go(${i})"></i>`).join('')}</div></section>`;
}
let cur = 0;
function startSlider() {
  clearInterval(timer); cur = 0;
  const n = document.querySelectorAll('.slide').length;
  if (n > 1 && !matchMedia('(prefers-reduced-motion:reduce)').matches) timer = setInterval(() => A.go((cur + 1) % n), 5000);
}

/* ===== صفحه‌ها ===== */
const vHome = () => { const s = S(); return slider(s) + `<div class="wrap"><h2>${esc(s.name)}</h2><p class="prose">${esc(s.about).slice(0, 300)}</p>
  ${s.gallery.length ? `<h3>تصاویر و ویدیوها</h3><div class="grid">${s.gallery.map(g => g.t === 'v' ? vidHtml(g.src) : `<img src="${esc(g.src)}" alt="" loading="lazy">`).join('')}</div>` : ''}</div>`; };
const vAbout = () => `<div class="wrap"><h1>درباره ما</h1><p class="prose">${esc(S().about)}</p></div>`;
const vContact = () => { const s = S(); return `<div class="wrap"><h1>تماس با ما</h1><div class="card">
  <p>📞 ${esc(s.phone) || '—'}</p><p>✉️ ${esc(s.email) || '—'}</p><p>📍 ${esc(s.address) || '—'}</p></div></div>`; };
const vLogin = () => `<div class="login card"><h2>ورود به سامانه</h2><div id="lm"></div>
  <label for="lu">نام کاربری</label><input id="lu" autocomplete="username">
  <label for="lp">رمز عبور</label><input id="lp" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')A.login()">
  <p><button class="btn" onclick="A.login()">ورود</button></p></div>`;

/* ===== پنل ===== */
let editing = null, logF = 'all';
function vPanel(sec) {
  const u = me(); if (!u) return location.hash = '#/login';
  const allowed = Object.keys(SEC).filter(k => can(u.role, k) && (k !== 'perms' || u.role === 'superadmin'));
  if (!sec || !allowed.includes(sec) || !READY.includes(sec)) sec = allowed.find(k => READY.includes(k)) || '';
  const side = allowed.map(k => READY.includes(k) ? `<a href="#/panel/${k}" class="${k === sec ? 'on' : ''}">${SEC[k]}</a>` : `<span class="soon">${SEC[k]} (به‌زودی)</span>`).join('');
  const body = { home: pHome, users: pUsers, perms: pPerms, logs: pLogs, backup: pBackup }[sec];
  return `<div class="panel"><aside class="side"><p style="padding:0 12px"><b>${esc(u.name)}</b><br><span class="tag">${ROLES[u.role]}</span></p>${side}
  <a href="#/panel" onclick="A.pw();return false">تغییر رمز من</a></aside><section id="pc">
  ${u.must ? '<div class="msg">رمز پیش‌فرض هنوز تغییر نکرده است. از «تغییر رمز من» آن را عوض کنید.</div>' : ''}${body ? body() : '<p>بخشی برای نمایش وجود ندارد.</p>'}</section></div>`;
}
function pHome() {
  const s = S();
  return `<h2>ویرایش صفحه اصلی و محتوای سایت</h2><div class="card"><div class="row"><div><label>نام مدرسه</label><input id="h_name" value="${esc(s.name)}"></div>
  <div><label>بنر ثابت (بالای سایت)</label><input id="h_banner" value="${esc(s.banner)}"></div></div>
  <label>بنر متحرک (متن در حال حرکت)</label><input id="h_ticker" value="${esc(s.ticker)}">
  <label>متن درباره ما</label><textarea id="h_about">${esc(s.about)}</textarea>
  <div class="row"><div><label>تلفن</label><input id="h_phone" value="${esc(s.phone)}"></div><div><label>ایمیل</label><input id="h_email" value="${esc(s.email)}"></div></div>
  <label>آدرس</label><input id="h_addr" value="${esc(s.address)}"><label>متن فوتر</label><input id="h_footer" value="${esc(s.footer)}">
  <p><button class="btn" onclick="A.saveSite()">ذخیره تغییرات</button></p></div>
  <div class="card"><h3>اسلایدر</h3>${s.slides.map((x, i) => `<p>${i + 1}. ${esc(x.title)} <button class="btn sm bad" onclick="A.delSlide(${i})">حذف</button></p>`).join('') || '<p>اسلایدی ثبت نشده (نمونه نمایش داده می‌شود).</p>'}
  <div class="row"><div><label>عنوان</label><input id="s_t"></div><div><label>توضیح</label><input id="s_x"></div><div><label>تصویر (JPG/PNG)</label><input id="s_f" type="file" accept=".jpg,.jpeg,.png"></div></div>
  <p><button class="btn alt" onclick="A.addSlide()">افزودن اسلاید</button></p></div>
  <div class="card"><h3>گالری تصویر و ویدیو</h3><div class="grid">${s.gallery.map((g, i) => `<div>${g.t === 'v' ? vidHtml(g.src) : `<img src="${esc(g.src)}" alt="">`}<button class="btn sm bad" onclick="A.delG(${i})">حذف</button></div>`).join('')}</div>
  <div class="row"><div><label>افزودن تصویر</label><input id="g_f" type="file" accept=".jpg,.jpeg,.png"></div><div><label>یا لینک ویدیو (https، یوتیوب یا mp4)</label><input id="g_v" placeholder="https://"></div></div>
  <p><button class="btn alt" onclick="A.addG()">افزودن به گالری</button></p></div>`;
}
function pUsers() {
  const u = me(), us = DB.get('users', []), e = us.find(x => x.id === editing);
  const mine = us.filter(x => RANK[x.role] < RANK[u.role] || u.role === 'superadmin');
  const opts = Object.keys(ROLES).filter(r => RANK[r] < RANK[u.role] || (u.role === 'superadmin' && r !== 'superadmin'));
  return `<h2>مدیریت کاربران</h2><div class="card"><h3>${e ? 'ویرایش: ' + esc(e.username) : 'کاربر جدید'}</h3><div id="um"></div>
  <div class="row"><div><label>نام کاربری ${e ? '(غیرقابل تغییر)' : ''}</label><input id="u_n" ${e ? 'disabled' : ''} value="${esc(e?.username)}" autocomplete="off"></div>
  ${e ? '' : '<div><label>رمز عبور (حداقل ۸ کاراکتر)</label><input id="u_p" type="password" autocomplete="new-password"></div>'}</div>
  <div class="row"><div><label>نام و نام خانوادگی</label><input id="u_f" value="${esc(e?.name)}"></div><div><label>تلفن</label><input id="u_ph" value="${esc(e?.phone)}"></div>
  <div><label>نقش</label><select id="u_r">${opts.map(r => `<option value="${r}" ${e?.role === r ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select></div></div>
  <p><button class="btn" onclick="A.saveUser()">${e ? 'ذخیره' : 'افزودن'}</button> ${e ? '<button class="btn alt" onclick="A.edit(null)">انصراف</button>' : ''}</p></div>
  <div class="tw"><table><tr><th>نام کاربری</th><th>نام</th><th>نقش</th><th>تلفن</th><th>وضعیت</th><th></th></tr>
  ${mine.map(x => `<tr><td>${esc(x.username)}</td><td>${esc(x.name)}</td><td>${ROLES[x.role]}</td><td>${esc(x.phone)}</td><td>${x.active === false ? 'غیرفعال' : 'فعال'}</td>
  <td>${x.id === u.id ? '' : `<button class="btn sm alt" onclick="A.edit(${x.id})">ویرایش</button> <button class="btn sm alt" onclick="A.reset(${x.id})">رمز جدید</button> <button class="btn sm alt" onclick="A.tog(${x.id})">فعال/غیرفعال</button> <button class="btn sm bad" onclick="A.del(${x.id})">حذف</button>`}</td></tr>`).join('')}</table></div>`;
}
function pPerms() {
  if (me().role !== 'superadmin') return '';
  const p = P(), roles = Object.keys(ROLES);
  return `<h2>سطوح دسترسی</h2><p>برای هر نقش مشخص کنید به کدام بخش دسترسی دارد. (* بخش‌هایی که در مراحل بعد اضافه می‌شوند)</p>
  <div class="tw"><table><tr><th>بخش</th>${roles.map(r => `<th>${ROLES[r]}</th>`).join('')}</tr>
  ${Object.keys(SEC).map(k => `<tr><td>${SEC[k]}</td>${roles.map(r => `<td><input type="checkbox" style="width:auto" ${r === 'superadmin' || (k === 'perms') ? 'disabled' : ''} ${can(r, k) ? 'checked' : ''} onchange="A.perm('${r}','${k}',this.checked)" aria-label="${ROLES[r]} - ${SEC[k]}"></td>`).join('')}</tr>`).join('')}</table></div>`;
}
function pLogs() {
  const L = DB.get('logs', []).filter(x => logF === 'all' || x.l === logF);
  return `<h2>فعالیت کاربران و رویدادهای امنیتی</h2><p><button class="btn sm ${logF === 'all' ? '' : 'alt'}" onclick="A.lf('all')">همه</button> <button class="btn sm ${logF === 'sec' ? '' : 'alt'}" onclick="A.lf('sec')">فقط امنیتی</button></p>
  <div class="tw"><table><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>نوع</th></tr>${L.map(x => `<tr><td>${esc(x.t)}</td><td>${esc(x.u)}</td><td>${esc(x.a)}</td><td>${x.l === 'sec' ? '<span class="tag sec">امنیتی</span>' : '<span class="tag">عادی</span>'}</td></tr>`).join('') || '<tr><td colspan=4>موردی ثبت نشده</td></tr>'}</table></div>`;
}
const pBackup = () => `<h2>پشتیبان‌گیری</h2><div class="card"><p>تمام اطلاعات سامانه (کاربران، تنظیمات، محتوا) را در یک فایل ذخیره کنید.</p>
  <button class="btn" onclick="A.export()">دانلود فایل پشتیبان</button></div>
  <div class="card"><h3>بازیابی</h3><p>با بازیابی، اطلاعات فعلی جایگزین می‌شود.</p><input id="b_f" type="file" accept=".json"><p><button class="btn alt" onclick="A.import()">بازیابی از فایل</button></p></div>`;

/* ===== عملیات ===== */
const A = {
  go(i) { document.querySelectorAll('.slide').forEach((e, k) => e.classList.toggle('on', k === i)); document.querySelectorAll('.dots i').forEach((e, k) => e.classList.toggle('on', k === i)); cur = i; },
  async login() {
    const k = $('#lu').value.trim().toLowerCase(), p = $('#lp').value, L = DB.get('lock', {}), l = L[k] || { n: 0, t: 0 };
    const fail = m => $('#lm').innerHTML = `<div class="msg">${m}</div>`;
    if (!k || !p) return fail('نام کاربری و رمز را وارد کنید');
    if (l.t > Date.now()) return fail('به دلیل تلاش‌های ناموفق، ورود تا ' + Math.ceil((l.t - Date.now()) / 60000) + ' دقیقه دیگر قفل است');
    const u = DB.get('users', []).find(x => x.username.toLowerCase() === k && x.active !== false);
    if (u && u.pass === await sha(p)) { delete L[k]; DB.set('lock', L); sessionStorage.setItem('uid', u.id); log('ورود موفق', 'info', u.username); return location.hash = '#/panel'; }
    l.n++; if (l.n >= 5) { l.t = Date.now() + 300000; l.n = 0; log('قفل موقت حساب: ' + k, 'sec', k); }
    L[k] = l; DB.set('lock', L); log('ورود ناموفق: ' + k, 'sec', k); fail('نام کاربری یا رمز عبور اشتباه است');
  },
  out() { log('خروج'); sessionStorage.removeItem('uid'); },
  async pw() {
    const p = prompt('رمز جدید (حداقل ۸ کاراکتر):'); if (!p) return;
    if (p.length < 8) return alert('رمز کوتاه است');
    const us = DB.get('users', []), u = us.find(x => x.id === me().id); u.pass = await sha(p); u.must = false; DB.set('users', us); log('تغییر رمز'); route();
  },
  guard(sec) { const u = me(); if (!u || !can(u.role, sec) || (sec === 'perms' && u.role !== 'superadmin')) { log('تلاش دسترسی غیرمجاز: ' + sec, 'sec'); return false; } return true; },
  saveSite() {
    if (!A.guard('home')) return;
    const s = S(), v = i => $(i).value.trim();
    Object.assign(s, { name: v('#h_name'), banner: v('#h_banner'), ticker: v('#h_ticker'), about: v('#h_about'), phone: v('#h_phone'), email: v('#h_email'), address: v('#h_addr'), footer: v('#h_footer') });
    DB.set('site', s); log('ویرایش محتوای سایت'); route();
  },
  async addSlide() {
    if (!A.guard('home')) return;
    const s = S(), t = $('#s_t').value.trim(); if (!t) return alert('عنوان لازم است');
    let img = ''; try { if ($('#s_f').files[0]) img = await readFile($('#s_f').files[0]); } catch (e) { return alert(e); }
    s.slides = [...DB.get('site', {}).slides || [], { img, title: t, text: $('#s_x').value.trim() }]; DB.set('site', { ...DB.get('site', {}), ...s, slides: s.slides }); log('افزودن اسلاید'); route();
  },
  delSlide(i) { if (!A.guard('home')) return; const s = S(); s.slides.splice(i, 1); DB.set('site', s); route(); },
  async addG() {
    if (!A.guard('home')) return;
    const s = S(), f = $('#g_f').files[0], v = $('#g_v').value.trim();
    try { if (f) s.gallery.push({ t: 'i', src: await readFile(f) }); else if (v && safeUrl(v)) s.gallery.push({ t: 'v', src: v }); else return alert('یک تصویر JPG/PNG یا لینک https معتبر وارد کنید'); } catch (e) { return alert(e); }
    DB.set('site', s); log('افزودن به گالری'); route();
  },
  delG(i) { if (!A.guard('home')) return; const s = S(); s.gallery.splice(i, 1); DB.set('site', s); route(); },
  edit(id) { editing = id; route(); },
  async saveUser() {
    if (!A.guard('users')) return;
    const us = DB.get('users', []), cu = me(), m = t => $('#um').innerHTML = `<div class="msg">${t}</div>`, role = $('#u_r').value;
    if (!(RANK[role] < RANK[cu.role] || cu.role === 'superadmin') || role === 'superadmin') return m('اجازه ساخت این نقش را ندارید');
    const f = { name: $('#u_f').value.trim(), phone: $('#u_ph').value.trim(), role };
    if (!f.name) return m('نام را وارد کنید');
    if (editing) { const u = us.find(x => x.id === editing); if (!u || (RANK[u.role] >= RANK[cu.role] && cu.role !== 'superadmin')) return m('اجازه ویرایش ندارید'); Object.assign(u, f); log('ویرایش کاربر ' + u.username); }
    else {
      const n = $('#u_n').value.trim(), p = $('#u_p').value;
      if (!/^[A-Za-z0-9_.]{3,30}$/.test(n)) return m('نام کاربری فقط حروف انگلیسی، عدد و _ . (حداقل ۳ حرف)');
      if (p.length < 8) return m('رمز حداقل ۸ کاراکتر باشد');
      if (us.some(x => x.username.toLowerCase() === n.toLowerCase())) return m('این نام کاربری قبلاً ثبت شده');
      us.push({ id: Date.now(), username: n, pass: await sha(p), active: true, ...f }); log('ساخت کاربر ' + n);
    }
    DB.set('users', us); editing = null; route();
  },
  async reset(id) { if (!A.guard('users')) return; const p = prompt('رمز جدید (حداقل ۸ کاراکتر):'); if (!p || p.length < 8) return; const us = DB.get('users', []), u = us.find(x => x.id === id); if (RANK[u.role] >= RANK[me().role] && me().role !== 'superadmin') return; u.pass = await sha(p); DB.set('users', us); log('تغییر رمز ' + u.username, 'sec'); alert('انجام شد'); },
  tog(id) { if (!A.guard('users')) return; const us = DB.get('users', []), u = us.find(x => x.id === id); if (RANK[u.role] >= RANK[me().role] && me().role !== 'superadmin') return; u.active = u.active === false; DB.set('users', us); log('تغییر وضعیت ' + u.username); route(); },
  del(id) { if (!A.guard('users')) return; const us = DB.get('users', []), u = us.find(x => x.id === id); if (!u || !confirm('حذف ' + u.username + '؟')) return; if (RANK[u.role] >= RANK[me().role] && me().role !== 'superadmin') return; DB.set('users', us.filter(x => x.id !== id)); log('حذف کاربر ' + u.username, 'sec'); route(); },
  perm(r, k, on) { if (!A.guard('perms')) return; const p = P(); p[r] = (p[r] || []).filter(x => x !== k); if (on) p[r].push(k); DB.set('perms', p); log(`دسترسی ${ROLES[r]} به ${SEC[k]}: ${on ? 'بله' : 'خیر'}`, 'sec'); },
  lf(f) { logF = f; route(); },
  export() {
    if (!A.guard('backup')) return;
    const o = {}; Object.keys(localStorage).filter(k => k.startsWith('sms_') && k !== 'sms_lock').forEach(k => o[k] = localStorage.getItem(k));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' })); a.download = 'backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); log('دریافت پشتیبان');
  },
  import() {
    if (!A.guard('backup')) return;
    const f = $('#b_f').files[0]; if (!f || !confirm('اطلاعات فعلی جایگزین می‌شود. ادامه می‌دهید؟')) return;
    const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o.sms_users) throw 0; Object.keys(o).filter(k => k.startsWith('sms_')).forEach(k => localStorage.setItem(k, o[k])); log('بازیابی پشتیبان', 'sec'); alert('بازیابی شد'); route(); } catch { alert('فایل پشتیبان معتبر نیست'); } }; r.readAsText(f);
  }
};

/* ===== مسیریابی ===== */
function route() {
  const [, pg, sec] = (location.hash || '#/').split('/');
  clearInterval(timer);
  if (pg === 'about') shell(vAbout()); else if (pg === 'contact') shell(vContact());
  else if (pg === 'login') shell(me() ? (location.hash = '#/panel', '') : vLogin());
  else if (pg === 'panel') shell(vPanel(sec)); else { shell(vHome()); startSlider(); }
}
addEventListener('hashchange', route);
seed().then(route);
