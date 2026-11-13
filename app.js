'use strict';
const C = window.Core;
let state = null;
let view = 'today';
let curDate = C.dateKey(new Date());
let sheet = null;
const seed = Math.floor(Math.random() * 1000);

const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(+n || 0);
const r1 = n => Math.round((+n || 0) * 10) / 10;
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const todayKey = () => C.dateKey(new Date());
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const MEALS = ['早餐', '午餐', '晚餐', '點心'];
const LEVELS = ['碎念', '情勒', '毒舌'];

function defaultState() {
  return {
    profile: { sex: 'm', age: '', height: '', weight: '', activity: 'light', goal: 'cut', level: 3, eatBack: 0.5, exDays: [1, 3, 5], useCustom: false, custom: {} },
    days: {}, favorites: [], push: null
  };
}
function save() { return C.dbSet('state', state).catch(e => toast('儲存失敗：' + e)); }
function dayRef(key) {
  const d = state.days[key] || (state.days[key] = {});
  d.meals = d.meals || []; d.exercises = d.exercises || []; d.water = d.water || 0;
  return d;
}
let toastTimer, undoFn = null;
function toast(msg, undo) {
  const t = $('#toast'); undoFn = undo || null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button data-act="undo">復原</button>' : '');
  t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 5000 : 2200);
}
/* 頁面內的錯誤訊息（取代系統彈窗） */
function notify(msg) {
  const el = $(/匯入/.test(msg) ? '#dataMsg' : '#pushMsg');
  if (!el) { toast(msg); return; }
  el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function markMissing(prefix, p) {
  const bad = ['age', 'height', 'weight'].filter(k => !p[k]);
  bad.forEach(k => {
    const el = $('#' + prefix + k); if (!el) return;
    el.classList.add('err'); el.setAttribute('aria-invalid', 'true');
    el.insertAdjacentHTML('afterend', '<div class="field-err" role="alert">請填寫這一欄</div>');
  });
  if (bad.length && $('#' + prefix + bad[0])) $('#' + prefix + bad[0]).focus();
  return bad.length;
}

/* ================= 畫面 ================= */
let enterTimer;
function render(animate) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
  const v = $('#view');
  if (animate) { v.classList.add('enter'); clearTimeout(enterTimer); enterTimer = setTimeout(() => v.classList.remove('enter'), 900); }
  document.body.classList.toggle('onboarding', view === 'onboard');
  v.innerHTML = view === 'onboard' ? renderOnboard() : view === 'today' ? renderToday() : view === 'trend' ? renderTrend() : renderSettings();
}

function bar(label, val, target, unit, mode) {
  const pct = target > 0 ? val / target * 100 : 0;
  let cls = '';
  if (mode === 'min') cls = pct >= 90 ? 'ok' : '';                 // 越多越好（蛋白質、水）
  else if (mode === 'info') cls = 'info';
  else cls = pct > 110 ? 'warn' : pct >= 85 ? 'ok' : '';             // 不能超過（熱量、脂肪、碳水）
  return `<div class="bar"><div class="lab"><span>${label}</span><span>${r0(val)} / ${r0(target)} ${unit}</span></div>
    <div class="track"><div class="fill ${cls}" style="width:${Math.min(100, pct)}%"></div></div></div>`;
}

/* ---------- 新手引導 ---------- */
let ob = null;
function renderOnboard() {
  const p = ob.p, n = ob.step;
  const choice = (key, val, title, desc) => `<button class="choice ${String(p[key]) === String(val) ? 'on' : ''}" data-act="obSet" data-k="${key}" data-v="${val}" aria-pressed="${String(p[key]) === String(val)}"><b>${title}</b><span>${esc(desc)}</span></button>`;
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  let title, lead, body;
  if (n === 0) {
    title = '你的目標是什麼？'; lead = '我會依目標算出你每天該吃多少。之後隨時可以改。';
    body = choice('goal', 'cut', '減脂', '每天少吃約兩成熱量，蛋白質拉高保住肌肉') + choice('goal', 'keep', '維持', '吃跟消耗一樣多，穩定體重') + choice('goal', 'bulk', '增肌', '每天多吃約一成熱量，配合重訓');
  } else if (n === 1) {
    title = '報上你的身體數據'; lead = '用來估算基礎代謝與每日消耗，資料只存在這支手機。';
    body = `<div class="card"><div class="grid2">
      <label class="f">性別<select id="o-sex">${opt('m', p.sex, '男')}${opt('f', p.sex, '女')}</select></label>
      <label class="f">年齡<input id="o-age" inputmode="numeric" value="${esc(p.age)}"></label>
      <label class="f">身高 cm<input id="o-height" inputmode="decimal" value="${esc(p.height)}"></label>
      <label class="f">體重 kg<input id="o-weight" inputmode="decimal" value="${esc(p.weight)}"></label></div>
      <label class="f" style="margin-top:12px">平常活動量（不含運動）<select id="o-activity">${opt('sit', p.activity, '久坐：辦公室、學生')}${opt('light', p.activity, '輕度：常走動')}${opt('mid', p.activity, '中度：整天站或走')}${opt('high', p.activity, '高度：體力勞動')}</select></label></div>`;
  } else if (n === 2) {
    title = '每週哪幾天要運動？'; lead = '排了卻沒動的那天，晚上我會找你算帳。';
    body = `<div class="card"><div class="chips" style="margin:0">${WD.map((w, i) => `<button data-act="obDay" data-v="${i}" class="${p.exDays.includes(i) ? 'on' : ''}" aria-pressed="${p.exDays.includes(i)}">週${w}</button>`).join('')}</div>
      <div class="muted" style="margin-top:12px">目前每週 ${p.exDays.length} 天。一天都不選也可以。</div></div>`;
  } else if (n === 3) {
    title = '教練要多兇？'; lead = '下面是「運動日沒運動」時你會聽到的話。';
    body = LEVELS.map((l, i) => choice('level', i + 1, l, C.say('noExercise', i + 1, null, 0).body)).join('');
  } else {
    const T = C.calcTargets(p);
    title = '這是你每天的目標'; lead = '吃了就記，我會盯著你。目標之後可以在設定裡調整。';
    body = `<div class="result"><div class="wide"><b>${T.kcal}</b><span>每日熱量（大卡）</span></div>
      <div><b>${T.protein}<small> g</small></b><span>蛋白質</span></div><div><b>${T.fat}<small> g</small></b><span>脂肪</span></div>
      <div><b>${T.carb}<small> g</small></b><span>碳水</span></div><div><b>${T.water}<small> ml</small></b><span>喝水</span></div></div>`;
  }
  return `<div class="ob"><div class="ob-top"><div class="ob-prog" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${n + 1}" aria-label="設定進度"><i style="width:${(n + 1) * 20}%"></i></div>
    ${n < 4 ? '<button class="link" data-act="obSkip">跳過</button>' : ''}</div>
    <h1>${title}</h1><p class="lead">${lead}</p>${body}
    <div class="ob-actions">${n > 0 ? '<button class="btn ghost" data-act="obBack">上一步</button>' : ''}<button class="btn grow" data-act="obNext">${n === 4 ? '開始使用' : '下一步'}</button></div></div>`;
}
function obRead() {
  if (!ob || ob.step !== 1) return;
  for (const k of ['sex', 'age', 'height', 'weight', 'activity']) {
    const el = $('#o-' + k); if (!el) continue;
    ob.p[k] = (k === 'sex' || k === 'activity') ? el.value : (num(el.value) || '');
  }
}

function macro(label, val, target, color, more) {
  const pct = target > 0 ? val / target * 100 : 0;
  const over = !more && pct > 115;
  const diff = r0(target - val);
  const hint = diff > 0 ? `還差 ${diff} g` : more ? '已達標' : diff === 0 ? '剛好' : `超過 ${-diff} g`;
  return `<div class="macro ${over ? 'over' : ''}" style="--c:var(--${color})"><div class="lab"><i></i>${label}</div>
    <b>${r0(val)}<small> / ${r0(target)} g</small></b>
    <div class="track"><div class="fill" style="width:${Math.min(100, pct)}%"></div></div><div class="hint">${hint}</div></div>`;
}

const ICON = {
  '早餐': '<path d="M12 4v2.5M5.6 8.1l1.8 1.8M18.4 8.1l-1.8 1.8M3 16h2.5M18.5 16H21M7.5 16a4.5 4.5 0 0 1 9 0M3 20h18"/>',
  '午餐': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  '晚餐': '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  '點心': '<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2M12 3.5v2"/>',
  ex: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  water: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/>',
  weight: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 10a5 5 0 0 1 7 0M12 10.5l1.6-2"/>',
  flame: '<path d="M12 3c1 3.5 5 5.500 5 10a5 5 0 0 1-10 0c0-2 1-3.200 2-4.200.3 1.600 1 2.400 1.800 2.700C10.500 9 11 6 12 3z"/>'
};
const ico = (k, cls) => `<span class="ico ${cls || ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span>`;

function weekStrip() {
  const tk = todayKey();
  const end = curDate >= C.addDays(tk, -6) ? tk : curDate;
  let h = '<div class="week">';
  for (let i = 6; i >= 0; i--) {
    const k = C.addDays(end, -i), d = C.keyToDate(k);
    const st = C.dayMet(state, k) ? 'met' : C.getDay(state, k).meals.length ? 'part' : '';
    h += `<button data-act="goDay" data-k="${k}" class="${k === curDate ? 'on' : ''} ${st}" aria-label="${d.getMonth() + 1} 月 ${d.getDate()} 日，${st === 'met' ? '達標' : st === 'part' ? '未達標' : '沒有紀錄'}"><span>${k === tk ? '今天' : WD[d.getDay()]}</span><b>${d.getDate()}</b><i></i></button>`;
  }
  return h + '</div>';
}

function renderToday() {
  const isToday = curDate === todayKey();
  const d = C.keyToDate(curDate);
  const s = C.daySummary(state, curDate);
  const day = C.getDay(state, curDate);
  const met = C.dayMet(state, curDate);
  let h = `<header class="top"><div><div class="eyebrow">${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日　星期${WD[d.getDay()]}</div>
    <h1>${isToday ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`}${!isToday && s.target ? `<span class="chip ${met ? 'ok' : 'bad'}">${met ? '達標' : '未達標'}</span>` : ''}</h1></div>
    <div class="nav"><button data-act="day" data-d="-1" aria-label="前一天">‹</button><button data-act="day" data-d="1" aria-label="後一天" ${isToday ? 'disabled' : ''}>›</button></div></header>`;

  if (!s.target) {
    return h + `<div class="card nag"><div class="avatar">嘴</div><div class="grow"><div class="who">教練</div><p>先報上身高、體重、年齡，我才知道一天該讓你吃多少。</p></div></div>
      <button class="btn block" data-act="tab" data-tab="settings">開始設定</button>`;
  }
  const T = s.target;
  h += weekStrip() + '<div class="layout"><div class="col a">';

  if (isToday) {
    const ev = C.evaluate(state, new Date(), seed);
    const calm = ev.top.type === 'good' || ev.top.type === 'morning';
    h += `<div class="card nag ${calm ? 'calm' : ''}"><div class="avatar">嘴</div><div class="grow"><div class="who">教練・${LEVELS[(state.profile.level || 2) - 1]}模式</div>
      ${ev.issues.map(i => `<p>${esc(i.body)}</p>`).join('')}</div></div>`;
  }

  const left = T.kcal - s.kcal, CIRC = 326.73;
  const pct = Math.min(1, s.kcal / T.kcal);
  h += `<div class="card hero">
    <div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="bg" cx="60" cy="60" r="52"/>
      <circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="${CIRC}" stroke-dashoffset="${r1(CIRC * (1 - pct))}" transform="rotate(-90 60 60)"/></svg>
      <div class="ring-in"><b>${Math.abs(r0(left))}</b><span>${left >= 0 ? '還可以吃（大卡）' : '已超標（大卡）'}</span></div></div>
    <div class="hero-side">
      <div><span>已攝取</span><b>${r0(s.kcal)}</b></div>
      <div><span>今日目標</span><b>${T.kcal}</b></div>
      <div><span>運動消耗</span><b>${r0(s.burn)}${s.eatBack ? `<small>加回 ${s.eatBack}</small>` : ''}</b></div>
    </div></div>
    <div class="macros">${macro('蛋白質', s.p, T.protein, 'protein', true)}${macro('脂肪', s.f, T.fat, 'fat')}${macro('碳水', s.c, T.carb, 'carb')}</div>`;

  /* 喝水、體重、連續天數（手機上排在飲食與運動之後） */
  h += `<div class="card late"><div class="sec-head" style="margin-bottom:14px"><div class="tile-head" style="margin:0">${ico('water', 'water')}喝水</div>
      <div class="bignum" style="font-size:24px">${r0(s.water)}<small>/ ${T.water} ml</small></div></div>
    <div class="track"><div class="fill info" style="width:${Math.min(100, s.water / T.water * 100)}%"></div></div>
    <div class="water-btns"><button class="btn sm ghost" data-act="water" data-ml="-250">−250</button>
      <button class="btn sm ghost" data-act="water" data-ml="250">＋250 ml</button>
      <button class="btn sm ghost" data-act="water" data-ml="500">＋500 ml</button></div></div>
    <div class="duo late">
      <div class="card"><div class="tile-head">${ico('weight', 'weight')}體重</div>
        <div class="row"><input id="wIn" inputmode="decimal" placeholder="${esc(state.profile.weight || '')} kg" value="${day.weight || ''}">
        <button class="btn sm ghost" data-act="saveWeight" style="flex:none">記錄</button></div></div>
      <div class="card"><div class="tile-head">${ico('flame', 'flame')}連續達標</div>
        <div class="bignum">${C.streak(state, todayKey())}<small>天</small></div></div>
    </div></div><div class="col b">`;

  /* 飲食 */
  h += `<div class="card"><div class="sec-head"><h2>飲食</h2><span class="total">${r0(s.kcal)} 大卡</span></div>`;
  MEALS.forEach((m, mi) => {
    const list = day.meals.filter(x => x.meal === m);
    h += `<div class="meal"><div class="meal-head">${ico(m, 'm' + mi)}<div class="grow"><b>${m}</b>
      <div class="muted">${list.length ? `${list.length} 項・${r0(list.reduce((a, x) => a + (+x.kcal || 0), 0))} 大卡` : '尚未記錄'}</div></div>
      <button class="add" data-act="openFood" data-meal="${m}" aria-label="新增${m}">＋</button></div>`;
    for (const x of list) h += `<div class="item" role="button" tabindex="0" data-act="editMeal" data-id="${x.id}" aria-label="編輯 ${esc(x.name)}"><div class="grow"><div class="name">${esc(x.name)}</div>
      <div class="muted name">蛋白 ${r1(x.p)}・脂肪 ${r1(x.f)}・碳水 ${r1(x.c)}</div></div>
      <div class="kc">${r0(x.kcal)}<small>大卡</small></div><button class="x" data-act="delMeal" data-id="${x.id}" aria-label="刪除">×</button></div>`;
    h += `</div>`;
  });
  h += `</div>`;

  /* 運動 */
  h += `<div class="card"><div class="meal-head">${ico('ex', 'ex')}<div class="grow"><b>運動${s.exerciseDay ? '<span class="chip brand">運動日</span>' : ''}</b>
      <div class="muted">${day.exercises.length ? `${day.exercises.length} 項・消耗 ${r0(s.burn)} 大卡` : s.exerciseDay ? '今天排了運動，還沒看到紀錄' : '尚未記錄'}</div></div>
      <button class="add" data-act="openEx" aria-label="新增運動">＋</button></div>`;
  for (const x of day.exercises) h += `<div class="item" role="button" tabindex="0" data-act="editEx" data-id="${x.id}" aria-label="編輯 ${esc(x.name)}"><div class="grow"><div class="name">${esc(x.name)}</div><div class="muted">${r0(x.min)} 分鐘</div></div>
    <div class="kc">−${r0(x.kcal)}<small>大卡</small></div><button class="x" data-act="delEx" data-id="${x.id}" aria-label="刪除">×</button></div>`;
  return h + `</div></div></div>`;
}

/* ---------- 趨勢 ---------- */
function weightChart(pts) {
  const W = 320, H = 150, px = 34, py = 18;
  const vals = pts.map(p => p.w);
  let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const x = i => px + (W - px - 10) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = v => py + (H - 2 * py) * (1 - (v - min) / (max - min));
  const line = pts.map((p, i) => `${r1(x(i))},${r1(y(p.w))}`).join(' ');
  const lab = k => { const d = C.keyToDate(k); return (d.getMonth() + 1) + '/' + d.getDate(); };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="體重趨勢">
    <line x1="${px}" x2="${W - 10}" y1="${y(max)}" y2="${y(max)}" stroke="var(--line)"/><line x1="${px}" x2="${W - 10}" y1="${y(min)}" y2="${y(min)}" stroke="var(--line)"/>
    <text x="${px - 4}" y="${y(max) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${r1(max)}</text>
    <text x="${px - 4}" y="${y(min) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${r1(min)}</text>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${r1(x(i))}" cy="${r1(y(p.w))}" r="3" fill="var(--accent)"/>`).join('')}
    <text x="${px}" y="${H - 3}" font-size="10" fill="var(--muted)">${lab(pts[0].k)}</text>
    <text x="${W - 10}" y="${H - 3}" text-anchor="end" font-size="10" fill="var(--muted)">${lab(pts[pts.length - 1].k)}</text></svg>`;
}

function renderTrend() {
  const tk = todayKey();
  const keys = []; for (let i = 6; i >= 0; i--) keys.push(C.addDays(tk, -i));
  const sums = keys.map(k => C.daySummary(state, k));
  const T = C.calcTargets(state.profile);
  let h = '<header class="top"><div><div class="eyebrow">最近 7 天的表現</div><h1>趨勢</h1></div></header><div class="cards">';

  /* 本週回顧 */
  const logged = sums.filter(s => s.mealCount > 0);
  const met = keys.filter(k => C.dayMet(state, k)).length;
  const exDone = sums.filter(s => s.exercised).length;
  const exPlan = sums.filter(s => s.exerciseDay).length;
  const avg = f => logged.length ? logged.reduce((a, s) => a + f(s), 0) / logged.length : 0;
  h += `<div class="card"><h2>最近 7 天</h2><div class="stats">
      <div><b>${met}/7</b><span>達標天數</span></div>
      <div><b>${exDone}/${exPlan}</b><span>運動／預定</span></div>
      <div><b>${C.streak(state, tk)}</b><span>連續達標</span></div>
      <div><b>${r0(avg(s => s.kcal))}</b><span>平均熱量</span></div>
      <div><b>${r0(avg(s => s.p))}</b><span>平均蛋白質 g</span></div>
      <div><b>${logged.length}/7</b><span>有記錄天數</span></div></div>`;
  if (T) {
    const type = met >= 5 ? 'weekGood' : met >= 3 ? 'weekMid' : 'weekBad';
    h += `<div class="verdict">${esc(C.say(type, state.profile.level, null, seed).body)}</div>`;
  }
  h += `</div>`;

  /* 熱量長條 */
  if (T) {
    const top = Math.max(T.kcal * 1.3, Math.max.apply(null, sums.map(s => s.kcal)));
    h += `<div class="card"><h2>每日熱量（虛線＝目標 ${T.kcal}）</h2><div class="bars">
      <div class="tline" style="bottom:${T.kcal / top * 100}%"></div>
      ${sums.map(s => { const t = s.target.kcal; const cls = !s.mealCount ? '' : s.kcal > t * 1.1 ? 'warn' : s.kcal >= t * 0.85 ? 'ok' : 'low'; return `<div class="col"><div class="b ${cls}" style="height:${s.kcal / top * 100}%"></div></div>`; }).join('')}
      </div><div class="barlabels">${keys.map((k, i) => { const s = sums[i], t = s.target.kcal; const mk = !s.mealCount ? '–' : s.kcal > t * 1.1 ? '↑' : s.kcal >= t * 0.85 ? '✓' : '↓'; return `<span>${WD[C.keyToDate(k).getDay()]}<b>${mk}</b></span>`; }).join('')}</div>
      <div class="legend"><span><i style="background:var(--ok)"></i>✓ 達標</span><span><i style="background:var(--warn)"></i>↑ 超標</span><span><i style="background:var(--info)"></i>↓ 吃太少</span></div></div>`;
  }

  /* 體重 */
  const pts = Object.keys(state.days).filter(k => state.days[k].weight).sort().slice(-30).map(k => ({ k, w: +state.days[k].weight }));
  h += `<div class="card"><h2>體重趨勢</h2>`;
  if (pts.length >= 2) {
    const diff = r1(pts[pts.length - 1].w - pts[0].w);
    h += weightChart(pts) + `<div class="muted" style="margin-top:6px">這段期間 ${diff > 0 ? '+' : ''}${diff} kg（${pts.length} 筆）</div>`;
  } else h += `<div class="empty">在「今天」記錄兩次以上體重後，這裡會畫出趨勢。</div>`;
  return h + `</div></div>`;
}

/* ---------- 設定 ---------- */
function renderSettings() {
  const p = state.profile, T = C.calcTargets(p), cu = p.custom || {};
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  let h = `<header class="top"><div><div class="eyebrow">個人資料與目標</div><h1>設定</h1></div></header><div class="cards"><div class="card"><h2>基本資料</h2><div class="grid2">
    <label class="f">性別<select id="s-sex">${opt('m', p.sex, '男')}${opt('f', p.sex, '女')}</select></label>
    <label class="f">年齡<input id="s-age" inputmode="numeric" value="${esc(p.age)}"></label>
    <label class="f">身高 cm<input id="s-height" inputmode="decimal" value="${esc(p.height)}"></label>
    <label class="f">體重 kg<input id="s-weight" inputmode="decimal" value="${esc(p.weight)}"></label>
    <label class="f">目標<select id="s-goal">${opt('cut', p.goal, '減脂')}${opt('keep', p.goal, '維持')}${opt('bulk', p.goal, '增肌')}</select></label>
    <label class="f">平常活動量（不含運動）<select id="s-activity">${opt('sit', p.activity, '久坐')}${opt('light', p.activity, '輕度')}${opt('mid', p.activity, '中度')}${opt('high', p.activity, '高度')}</select></label>
  </div>
  <div style="margin-top:12px"><label class="f">每週運動日</label><div class="chips" id="s-exdays">
    ${WD.map((w, i) => `<button type="button" data-act="toggleChip" data-v="${i}" class="${(p.exDays || []).includes(i) ? 'on' : ''}">${w}</button>`).join('')}</div></div>
  <div class="grid2">
    <label class="f">運動消耗加回可吃額度<select id="s-eatback">${opt(0, p.eatBack, '不加回')}${opt(0.5, p.eatBack, '加回一半')}${opt(1, p.eatBack, '全部加回')}</select></label>
    <label class="f">教練嘴砲強度<select id="s-level">${LEVELS.map((l, i) => opt(i + 1, p.level, l)).join('')}</select></label>
  </div>
  <label class="check"><input type="checkbox" id="s-custom" ${p.useCustom ? 'checked' : ''}>自己指定每日目標（留空的用自動計算）</label>
  <div class="grid2">
    <label class="f">熱量 大卡<input id="c-kcal" inputmode="numeric" value="${esc(cu.kcal || '')}"></label>
    <label class="f">蛋白質 g<input id="c-protein" inputmode="numeric" value="${esc(cu.protein || '')}"></label>
    <label class="f">脂肪 g<input id="c-fat" inputmode="numeric" value="${esc(cu.fat || '')}"></label>
    <label class="f">碳水 g<input id="c-carb" inputmode="numeric" value="${esc(cu.carb || '')}"></label>
    <label class="f">水 ml<input id="c-water" inputmode="numeric" value="${esc(cu.water || '')}"></label>
  </div>
  <button class="btn block" style="margin-top:14px" data-act="saveSettings">儲存</button>
  ${T ? `<div class="summary">基礎代謝 ${T.bmr} 大卡・每日總消耗約 ${T.tdee} 大卡
    <b>每日目標：${T.kcal} 大卡｜蛋白質 ${T.protein} g｜脂肪 ${T.fat} g｜碳水 ${T.carb} g｜水 ${T.water} ml</b></div>` : ''}
  </div>`;

  /* 推播 */
  const pu = state.push;
  h += `<div class="card"><h2>推播罵人</h2>`;
  if (!standalone) h += `<div class="note">iPhone 必須先用 Safari「分享 → 加入主畫面」，再從主畫面的圖示打開，才能開啟推播。</div>`;
  h += `<div class="row"><button class="btn sm" data-act="enablePush">${pu && pu.sub ? '重新產生推播設定' : '開啟推播'}</button>
    <button class="btn sm ghost" data-act="testPush">試罵一次</button></div><div class="msg" id="pushMsg" role="alert" hidden></div>`;
  if (pu && pu.sub) {
    h += `<ol class="steps"><li>按「複製」把下面整段設定複製起來。</li>
      <li>到你的 GitHub 專案 → Settings → Secrets and variables → Actions → New repository secret。</li>
      <li>Name 填 <b>PUSH_CONFIG</b>，Secret 貼上，儲存。</li>
      <li>到 Actions → nag → Run workflow 測試，手機應該會收到通知。</li></ol>
      <textarea class="cfg" id="pushCfg" readonly>${esc(JSON.stringify({ subscription: pu.sub, publicKey: pu.pub, privateKey: pu.priv }))}</textarea>
      <button class="btn sm ghost" style="margin-top:8px" data-act="copyCfg">複製</button>
      <div class="muted" style="margin-top:6px">這段含有私鑰，只貼到 GitHub 的 Secret，不要貼到別的地方。</div>`;
  }
  h += `</div>`;

  /* 資料 */
  h += `<div class="card"><h2>資料備份</h2><div class="muted" style="margin-bottom:8px">所有紀錄只存在這支手機。換手機前先匯出。</div>
    <div class="row"><button class="btn sm ghost" data-act="exportData">匯出備份</button>
    <button class="btn sm ghost" data-act="importData">匯入備份</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden></div><div class="msg" id="dataMsg" role="alert" hidden></div></div></div>`;
  return h;
}

/* ================= 記一餐 ================= */
function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? '早餐' : h < 15 ? '午餐' : h < 17 ? '點心' : h < 21 ? '晚餐' : '點心';
}
const HAND = [
  { k: 'palm', name: '肉／魚／蛋／豆腐', unit: '一個手掌大', kcal: 150, p: 25, f: 6, c: 0 },
  { k: 'fist', name: '飯／麵／澱粉', unit: '一個拳頭大', kcal: 210, p: 4, f: 0.5, c: 46 },
  { k: 'veg', name: '蔬菜', unit: '一個拳頭大', kcal: 25, p: 1.5, f: 0, c: 5 },
  { k: 'thumb', name: '油／醬／堅果', unit: '一個拇指大', kcal: 90, p: 0, f: 10, c: 0 }
];

function openFood(t) {
  sheet = { type: 'food', meal: (t && t.dataset && t.dataset.meal) || defaultMeal(), mode: state.favorites.length ? 'fav' : 'db', base: null, mult: 1, hand: { palm: 0, fist: 0, veg: 0, thumb: 0, fried: false } };
  const ed = t && t.dataset && t.dataset.id ? dayRef(curDate).meals.find(m => String(m.id) === t.dataset.id) : null;
  if (ed) { sheet.editId = ed.id; sheet.meal = ed.meal; sheet.base = { name: ed.name, kcal: ed.kcal, p: ed.p, f: ed.f, c: ed.c }; }
  $('#sheetBody').innerHTML = `<div class="sheet-title"><b>${ed ? '編輯這一餐' : '記一餐'}</b><button class="x" data-act="closeSheet" style="font-size:26px">×</button></div>
    <div class="chips" id="mealChips"></div>
    <label class="f">名稱<input id="f-name" placeholder="吃了什麼"></label>
    <div class="grid4">
      <label class="f">熱量<input id="f-kcal" inputmode="decimal"></label>
      <label class="f">蛋白質<input id="f-p" inputmode="decimal"></label>
      <label class="f">脂肪<input id="f-f" inputmode="decimal"></label>
      <label class="f">碳水<input id="f-c" inputmode="decimal"></label>
    </div>
    <div class="row" style="margin-top:8px"><span class="muted">份量</span><div class="chips grow" id="multChips" style="margin:0"></div></div>
    <div class="row" style="margin-top:10px"><button class="btn grow" data-act="addFood">${ed ? '儲存' : '加入'}</button><button class="btn ghost" data-act="favFood">☆ 存常吃</button></div>
    <div class="seg" id="modeChips"></div>
    <div id="foodArea"></div>`;
  $('#sheet').hidden = false;
  $('#sheetBody').querySelectorAll('.grid4 input').forEach(i => i.addEventListener('input', () => { sheet.base = null; sheet.mult = 1; renderFoodChips(); }));
  renderFoodChips(); renderFoodArea();
  if (ed) fillForm(sheet.base);
}
function renderFoodChips() {
  $('#mealChips').innerHTML = MEALS.map(m => `<button data-act="setMeal" data-v="${m}" class="${sheet.meal === m ? 'on' : ''}">${m}</button>`).join('');
  $('#multChips').innerHTML = [0.5, 1, 1.5, 2].map(m => `<button data-act="setMult" data-v="${m}" class="${sheet.mult === m ? 'on' : ''}">×${m}</button>`).join('');
  $('#modeChips').innerHTML = [['fav', '常吃'], ['db', '食物庫'], ['hand', '大概估']].map(m => `<button data-act="setMode" data-v="${m[0]}" class="${sheet.mode === m[0] ? 'on' : ''}">${m[1]}</button>`).join('');
}
function pickRow(it, src, i) {
  return `<div class="pick"><button class="grow" data-act="pickFood" data-src="${src}" data-i="${i}" style="text-align:left">
    <div>${esc(it.name)}</div><div class="muted">${r0(it.kcal)} 大卡・蛋白 ${r1(it.p)}・脂肪 ${r1(it.f)}・碳水 ${r1(it.c)}</div></button>
    ${src === 'fav' ? `<button class="x" data-act="delFav" data-i="${i}" aria-label="移除">×</button>` : ''}</div>`;
}
function recentFoods() {
  const seen = new Set(state.favorites.map(f => f.name)), out = [];
  let k = todayKey();
  for (let i = 0; i < 14 && out.length < 8; i++, k = C.addDays(k, -1)) {
    for (const m of C.getDay(state, k).meals.slice().reverse()) {
      if (seen.has(m.name) || out.length >= 8) continue;
      seen.add(m.name); out.push({ name: m.name, kcal: m.kcal, p: m.p, f: m.f, c: m.c });
    }
  }
  return out;
}
function renderFoodArea() {
  const a = $('#foodArea');
  if (sheet.mode === 'fav') {
    sheet.recent = recentFoods();
    a.innerHTML = `<div class="list">${state.favorites.map((f, i) => pickRow(f, 'fav', i)).join('')}
      ${sheet.recent.length ? `<div class="mealtag">最近吃過</div>` + sheet.recent.map((f, i) => pickRow(f, 'recent', i)).join('') : ''}
      ${!state.favorites.length && !sheet.recent.length ? '<div class="empty">還沒有常吃的東西。填好上面的欄位按「☆ 存常吃」，下次一鍵加入。</div>' : ''}</div>`;
  } else if (sheet.mode === 'db') {
    a.innerHTML = `<input id="foodQ" placeholder="搜尋：便當、蛋餅、珍奶…" style="margin-top:4px"><div class="list" id="dbList"></div>
      <div class="muted" style="margin-top:6px">數字是一般份量的概估，可以在上面直接改。</div>`;
    const draw = () => {
      const q = $('#foodQ').value.trim();
      $('#dbList').innerHTML = C.FOODS.map((f, i) => (!q || f.name.includes(q)) ? pickRow(f, 'db', i) : '').join('') || '<div class="empty">找不到，直接在上面手動填。</div>';
    };
    $('#foodQ').addEventListener('input', draw); draw();
  } else {
    a.innerHTML = `<div class="muted">不知道吃了多少？用手比一下大小。</div>` + HAND.map(x => `<div class="step"><div class="grow">${x.name}<small>${x.unit} ≈ ${x.kcal} 大卡</small></div>
      <button data-act="hand" data-k="${x.k}" data-d="-1">−</button><b>${sheet.hand[x.k]}</b><button data-act="hand" data-k="${x.k}" data-d="1">＋</button></div>`).join('') +
      `<label class="check"><input type="checkbox" id="fried" ${sheet.hand.fried ? 'checked' : ''}>油炸或很油（每份肉多算 10 g 油）</label>`;
    $('#fried').addEventListener('change', e => { sheet.hand.fried = e.target.checked; applyHand(); });
  }
}
function fillForm(it, keepName) {
  const m = sheet.mult;
  if (!keepName) $('#f-name').value = it.name;
  $('#f-kcal').value = r0(it.kcal * m); $('#f-p').value = r1(it.p * m); $('#f-f').value = r1(it.f * m); $('#f-c').value = r1(it.c * m);
}
function readForm() {
  let it = { name: $('#f-name').value.trim() || '未命名', kcal: num($('#f-kcal').value), p: num($('#f-p').value), f: num($('#f-f').value), c: num($('#f-c').value) };
  if (!$('#f-kcal').value.trim()) it.kcal = r0(it.p * 4 + it.f * 9 + it.c * 4);
  return it;
}
function applyHand() {
  const hd = sheet.hand, it = { name: '大概估的一餐', kcal: 0, p: 0, f: 0, c: 0 };
  for (const x of HAND) { it.kcal += x.kcal * hd[x.k]; it.p += x.p * hd[x.k]; it.f += x.f * hd[x.k]; it.c += x.c * hd[x.k]; }
  if (hd.fried) { it.kcal += 90 * hd.palm; it.f += 10 * hd.palm; }
  sheet.base = it; sheet.mult = 1;
  fillForm(it, !!$('#f-name').value.trim() && $('#f-name').value !== it.name);
  renderFoodChips();
}

/* ================= 記運動 ================= */
function openEx(t) {
  sheet = { type: 'ex', manual: false };
  const ed = t && t.dataset && t.dataset.id ? dayRef(curDate).exercises.find(m => String(m.id) === t.dataset.id) : null;
  $('#sheetBody').innerHTML = `<div class="sheet-title"><b>${ed ? '編輯運動' : '記運動'}</b><button class="x" data-act="closeSheet" style="font-size:26px">×</button></div>
    <label class="f">項目<select id="e-type">${C.EXERCISES.map((e, i) => `<option value="${i}">${e.name}</option>`).join('')}<option value="-1">其他（自己填）</option></select></label>
    <label class="f" id="e-nameWrap" hidden style="margin-top:8px">名稱<input id="e-name"></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">時間（分鐘）<input id="e-min" inputmode="numeric" value="30"></label>
      <label class="f">消耗（大卡，可改）<input id="e-kcal" inputmode="numeric"></label>
    </div>
    <div class="muted" style="margin-top:6px">消耗是用體重與運動強度估的，通常會偏高。</div>
    <button class="btn block" style="margin-top:12px" data-act="addEx">${ed ? '儲存' : '加入'}</button>`;
  $('#sheet').hidden = false;
  const calc = () => {
    const i = +$('#e-type').value;
    $('#e-nameWrap').hidden = i >= 0;
    if (sheet.manual || i < 0) return;
    $('#e-kcal').value = r0(C.EXERCISES[i].met * (num(state.profile.weight) || 65) * num($('#e-min').value) / 60);
  };
  $('#e-type').addEventListener('change', () => { sheet.manual = false; calc(); });
  $('#e-min').addEventListener('input', calc);
  $('#e-kcal').addEventListener('input', () => (sheet.manual = true));
  if (ed) {
    const i = C.EXERCISES.findIndex(e => e.name === ed.name);
    $('#e-type').value = String(i); $('#e-name').value = ed.name; $('#e-nameWrap').hidden = i >= 0;
    $('#e-min').value = ed.min; $('#e-kcal').value = ed.kcal; sheet.manual = true; sheet.editId = ed.id;
  } else calc();
}
function closeSheet() { $('#sheet').hidden = true; sheet = null; }

/* ================= 推播 ================= */
const b64u = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    notify('這個瀏覽器環境不支援推播。\niPhone 請先用 Safari「分享 → 加入主畫面」，再從主畫面圖示打開（需要 iOS 16.4 以上）。');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { notify('你沒有允許通知。請到 iPhone 設定 → 通知 → 嘴砲教練 打開。'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(pub) });
    state.push = { pub, priv, sub: sub.toJSON() };
    await save(); render(); toast('推播已開啟，照下面步驟貼到 GitHub');
  } catch (e) { notify('開啟推播失敗：' + e.message); }
}
async function testPush() {
  const top = C.evaluate(state, new Date(), Math.floor(Math.random() * 1000)).top;
  if (!('Notification' in window) || Notification.permission !== 'granted') { notify(top.title + '\n\n' + top.body + '\n\n（還沒開啟推播，所以先用視窗顯示）'); return; }
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(top.title, { body: top.body, icon: 'icon-192.png', tag: 'nag' });
}

/* ================= 動作 ================= */
async function removeWithUndo(arr, id) {
  const i = arr.findIndex(m => String(m.id) === id);
  if (i < 0) return;
  const item = arr.splice(i, 1)[0];
  await save(); render();
  toast('已刪除 ' + item.name, async () => { arr.splice(Math.min(i, arr.length), 0, item); await save(); render(); });
}

const acts = {
  async undo() { const f = undoFn; undoFn = null; clearTimeout(toastTimer); $('#toast').hidden = true; if (f) await f(); },
  editMeal(t) { openFood(t); },
  editEx(t) { openEx(t); },
  obSet(t) { const k = t.dataset.k; ob.p[k] = k === 'level' ? +t.dataset.v : t.dataset.v; render(); },
  obDay(t) { const v = +t.dataset.v, a = ob.p.exDays, i = a.indexOf(v); if (i < 0) a.push(v); else a.splice(i, 1); render(); },
  obBack() { obRead(); ob.step--; render(true); window.scrollTo(0, 0); },
  obSkip() { ob = null; view = 'settings'; render(true); },
  async obNext() {
    if (ob.step === 1) { obRead(); if (['age', 'height', 'weight'].some(k => !ob.p[k])) { render(); markMissing('o-', ob.p); return; } }
    if (ob.step === 4) {
      Object.assign(state.profile, ob.p); await save();
      ob = null; view = 'today'; curDate = todayKey(); render(true); window.scrollTo(0, 0); return;
    }
    ob.step++; render(true); window.scrollTo(0, 0);
  },
  tab(t) { view = t.dataset.tab; if (view === 'today') curDate = todayKey(); render(true); window.scrollTo(0, 0); },
  goDay(t) { if (t.dataset.k <= todayKey()) { curDate = t.dataset.k; render(); } },
  day(t) { const k = C.addDays(curDate, +t.dataset.d); if (k <= todayKey()) { curDate = k; render(); } },
  openFood, openEx, closeSheet, enablePush, testPush,
  setMeal(t) { sheet.meal = t.dataset.v; renderFoodChips(); },
  setMode(t) { sheet.mode = t.dataset.v; renderFoodChips(); renderFoodArea(); },
  setMult(t) {
    if (!sheet.base) { sheet.base = readForm(); }
    sheet.mult = +t.dataset.v; fillForm(sheet.base, true); renderFoodChips();
  },
  pickFood(t) {
    const src = t.dataset.src, i = +t.dataset.i;
    const it = src === 'fav' ? state.favorites[i] : src === 'recent' ? sheet.recent[i] : C.FOODS[i];
    sheet.base = Object.assign({}, it); sheet.mult = 1; fillForm(it); renderFoodChips();
    $('#sheetBody').scrollTop = 0;
  },
  hand(t) { const k = t.dataset.k; sheet.hand[k] = Math.max(0, sheet.hand[k] + +t.dataset.d); renderFoodArea(); applyHand(); },
  async addFood() {
    const it = readForm();
    if (!it.kcal && !it.p && !it.f && !it.c && it.name === '未命名') { toast('先填內容或從下面選一個'); return; }
    const cur = sheet.editId && dayRef(curDate).meals.find(m => m.id === sheet.editId);
    if (cur) Object.assign(cur, it, { meal: sheet.meal });
    else dayRef(curDate).meals.push(Object.assign({ id: Date.now(), meal: sheet.meal }, it));
    await save(); closeSheet(); render(); toast((cur ? '已更新 ' : '已記錄 ') + it.name);
  },
  async favFood() {
    const it = readForm();
    if (it.name === '未命名') { toast('先填名稱'); return; }
    state.favorites = state.favorites.filter(f => f.name !== it.name); state.favorites.unshift(it);
    await save(); toast('已存到常吃'); if (sheet.mode === 'fav') renderFoodArea();
  },
  async delFav(t) { state.favorites.splice(+t.dataset.i, 1); await save(); renderFoodArea(); },
  async delMeal(t) { await removeWithUndo(dayRef(curDate).meals, t.dataset.id); },
  async addEx() {
    const i = +$('#e-type').value;
    const name = i >= 0 ? C.EXERCISES[i].name : ($('#e-name').value.trim() || '運動');
    const rec = { name, min: num($('#e-min').value), kcal: num($('#e-kcal').value) };
    const cur = sheet.editId && dayRef(curDate).exercises.find(m => m.id === sheet.editId);
    if (cur) Object.assign(cur, rec); else dayRef(curDate).exercises.push(Object.assign({ id: Date.now() }, rec));
    await save(); closeSheet(); render(); toast((cur ? '已更新 ' : '已記錄 ') + name);
  },
  async delEx(t) { await removeWithUndo(dayRef(curDate).exercises, t.dataset.id); },
  async water(t) { const d = dayRef(curDate); d.water = Math.max(0, d.water + +t.dataset.ml); await save(); render(); },
  async saveWeight() {
    const w = num($('#wIn').value);
    if (w < 20 || w > 300) { toast('體重數字怪怪的'); return; }
    dayRef(curDate).weight = w;
    if (curDate === todayKey()) state.profile.weight = w;
    await save(); render(); toast('已記錄體重');
  },
  toggleChip(t) { t.classList.toggle('on'); },
  async saveSettings() {
    const p = state.profile, v = id => $('#' + id).value;
    p.sex = v('s-sex'); p.age = num(v('s-age')) || ''; p.height = num(v('s-height')) || ''; p.weight = num(v('s-weight')) || '';
    p.goal = v('s-goal'); p.activity = v('s-activity'); p.eatBack = +v('s-eatback'); p.level = +v('s-level');
    p.exDays = Array.from(document.querySelectorAll('#s-exdays .on')).map(b => +b.dataset.v);
    p.useCustom = $('#s-custom').checked;
    p.custom = { kcal: num(v('c-kcal')), protein: num(v('c-protein')), fat: num(v('c-fat')), carb: num(v('c-carb')), water: num(v('c-water')) };
    await save(); render();
    toast(markMissing('s-', p) ? '還有欄位沒填' : '已儲存');
  },
  async copyCfg() {
    const ta = $('#pushCfg');
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
    toast('已複製');
  },
  async exportData() {
    const data = Object.assign({}, state, { push: null });
    const name = 'coach-backup-' + todayKey() + '.json';
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  },
  importData() { $('#importFile').click(); }
};

document.addEventListener('click', e => {
  if (e.target.id === 'sheet') { closeSheet(); return; }
  const t = e.target.closest('[data-act]');
  if (t && acts[t.dataset.act]) acts[t.dataset.act](t, e);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && sheet) closeSheet();
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'importFile' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!data || typeof data.days !== 'object' || !data.profile) throw new Error('格式不對');
    if (!confirm('匯入會覆蓋這支手機上現有的所有紀錄，確定嗎？')) return;
    state = Object.assign(defaultState(), data, { push: state.push });
    await save(); render(); toast('已匯入');
  } catch (err) { notify('匯入失敗：' + err.message); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden || sheet || !state) return;
  if (view === 'today' && curDate !== todayKey() && Date.now() - lastSeen > 3600e3) curDate = todayKey();
  lastSeen = Date.now();
  if (view !== 'settings') render();
});
let lastSeen = Date.now();

(async function init() {
  try { state = Object.assign(defaultState(), (await C.dbGet('state')) || {}); }
  catch (e) { state = defaultState(); }
  state.profile = Object.assign(defaultState().profile, state.profile);
  if (!C.calcTargets(state.profile)) { view = 'onboard'; ob = { step: 0, p: JSON.parse(JSON.stringify(state.profile)) }; }
  render(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
