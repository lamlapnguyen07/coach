/* 共用邏輯：頁面與 Service Worker 都會載入 */
(function (root) {
  'use strict';

  /* ---------- IndexedDB（Service Worker 讀不到 localStorage，所以用這個） ---------- */
  const DB_NAME = 'coach-db', STORE = 'kv';
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function dbGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  }
  async function dbSet(key, val) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- 日期 ---------- */
  function dateKey(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function keyToDate(k) { const a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function addDays(k, n) { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateKey(d); }

  /* ---------- 目標計算 ---------- */
  const ACT = { sit: 1.2, light: 1.375, mid: 1.55, high: 1.725 };
  function calcTargets(p) {
    if (!p) return null;
    const w = +p.weight, h = +p.height, a = +p.age;
    if (!w || !h || !a) return null;
    const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === 'f' ? -161 : 5);
    const tdee = bmr * (ACT[p.activity] || 1.375);
    let kcal = tdee, protein = w * 1.6;
    if (p.goal === 'cut') {
      kcal = Math.max(tdee * 0.8, bmr, p.sex === 'f' ? 1200 : 1500);
      protein = w * 2.0;
    } else if (p.goal === 'bulk') {
      kcal = tdee * 1.1; protein = w * 1.8;
    }
    let fat = kcal * 0.25 / 9;
    let carb = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
    let water = Math.round(w * 35 / 50) * 50;
    const t = { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein: Math.round(protein), fat: Math.round(fat), carb: Math.round(carb), water };
    if (p.useCustom && p.custom) {
      for (const k of ['kcal', 'protein', 'fat', 'carb', 'water']) if (+p.custom[k] > 0) t[k] = +p.custom[k];
    }
    return t;
  }

  function getDay(state, key) {
    const d = (state.days && state.days[key]) || {};
    return { meals: d.meals || [], exercises: d.exercises || [], water: d.water || 0, weight: d.weight || null };
  }

  function daySummary(state, key) {
    const d = getDay(state, key);
    const s = { kcal: 0, p: 0, f: 0, c: 0, burn: 0, water: d.water, weight: d.weight, mealCount: d.meals.length };
    for (const m of d.meals) { s.kcal += +m.kcal || 0; s.p += +m.p || 0; s.f += +m.f || 0; s.c += +m.c || 0; }
    for (const e of d.exercises) s.burn += +e.kcal || 0;
    s.exercised = d.exercises.length > 0;
    const p = state.profile || {};
    s.exerciseDay = (p.exDays || []).includes(keyToDate(key).getDay());
    const base = calcTargets(p);
    if (base) {
      const back = Math.round(s.burn * (p.eatBack == null ? 0.5 : +p.eatBack));
      s.eatBack = back;
      s.target = Object.assign({}, base, { baseKcal: base.kcal, kcal: base.kcal + back });
    } else s.target = null;
    return s;
  }

  function dayMet(state, key) {
    const s = daySummary(state, key);
    if (!s.target || !s.mealCount) return false;
    return s.kcal >= s.target.kcal * 0.85 && s.kcal <= s.target.kcal * 1.1 &&
      s.p >= s.target.protein * 0.9 && (!s.exerciseDay || s.exercised);
  }

  function streak(state, todayKey) {
    let k = todayKey, n = 0;
    if (!dayMet(state, k)) k = addDays(k, -1);
    while (n < 400 && dayMet(state, k)) { n++; k = addDays(k, -1); }
    return n;
  }

  /* ---------- 罵人台詞：l[0] 碎念、l[1] 情勒、l[2] 毒舌 ---------- */
  const LINES = {
    setup: { t: '先報上名來', l: [['先到「設定」填身高體重，我才知道要怎麼管你。']] },
    morning: { t: '今日目標', l: [['今天目標 {k} 大卡、蛋白質 {p} g。吃了就記，別想賴。']] },
    noLog: {
      t: '一筆都沒記', l: [
        ['今天還沒記錄吃了什麼喔，花十秒記一下。', '都下午了還是空白，是忘了記還是忘了吃？'],
        ['我幫你把每一克都算好了，你連按個按鈕都不願意。沒關係，我習慣了。', '你不記錄，是不是因為吃了不敢讓我知道的東西？我會難過的。'],
        ['到現在一筆都沒記。你是絕食還是不敢面對自己吃了什麼？', '記錄空白。裝死不會讓熱量消失，白痴。', '連記個飲食都做不到，還敢說想改變身材？笑死。']
      ]
    },
    over: {
      t: '吃太多了', l: [
        ['今天超標 {n} 大卡了，接下來收斂一點。', '多了 {n} 大卡，晚點別再吃了好嗎。'],
        ['超標 {n} 大卡。你吃的時候有想過我嗎？有想過之前的努力嗎？', '多吃的 {n} 大卡，是你對自己的承諾打的折。我不怪你，我只是失望。'],
        ['超標 {n} 大卡。你的嘴是沒裝煞車嗎？', '又多吃 {n} 大卡，你到底是在控制飲食還是在養豬？', '恭喜，今天的熱量夠兩個人用。多出來的 {n} 大卡就長在你肚子上，自己看著辦。']
      ]
    },
    overFat: {
      t: '脂肪爆表', l: [
        ['脂肪超過 {n} g 了，下一餐挑清淡一點。', '今天油吃多了（多 {n} g），少碰炸的。'],
        ['脂肪超標 {n} g。你的血管正在默默承受這一切，它什麼都沒說。', '多了 {n} g 的油。你開心就好，真的，身體不重要。'],
        ['脂肪超標 {n} g。你是直接拿油來喝嗎？', '多吃 {n} g 脂肪。炸物很香吼？你的體脂也覺得很香。', '油超標 {n} g，你的血管都快可以拿去炒菜了。']
      ]
    },
    under: {
      t: '吃太少了', l: [
        ['今天才吃 {n} 大卡，太少了，去補一餐。', '只吃 {n} 大卡不夠，餓過頭反而會暴食。'],
        ['才吃 {n} 大卡。你這樣餓自己，是想讓我擔心嗎？好好吃飯很難嗎？', '只有 {n} 大卡。你不愛惜身體，那我算這些數字是算給誰看？'],
        ['才 {n} 大卡？餓肚子只會掉肌肉不會變帥，去吃飯，笨蛋。', '吃 {n} 大卡是在修仙嗎？代謝被你搞壞了看你怎麼哭。', '只吃 {n} 大卡。少吃不是自律，是蠢。現在就去吃東西。']
      ]
    },
    lowProtein: {
      t: '蛋白質不夠', l: [
        ['蛋白質還差 {n} g，補顆蛋或一塊雞胸。', '蛋白質缺 {n} g，下一餐記得加肉、蛋或豆腐。'],
        ['蛋白質還差 {n} g。你的肌肉在等你，而你讓它失望了。', '還缺 {n} g 蛋白質。練了半天不補，那些汗都白流了，你不心疼我心疼。'],
        ['蛋白質差 {n} g。你的肌肉正在被你活活餓死。', '還缺 {n} g 蛋白質，你吃的都是澱粉跟空氣嗎？', '蛋白質少 {n} g。再這樣下去你只會變成一坨比較瘦的肥肉。']
      ]
    },
    exerciseSoon: {
      t: '今天要運動', l: [
        ['今天是運動日，記得排時間動一下。', '提醒你，今天有排運動喔。'],
        ['今天是運動日。你答應過的，還記得嗎？我一直記著。', '今天該運動了。你不會又要讓我空等一場吧？'],
        ['今天是運動日，別給我裝忙。鞋子穿上，出門。', '今天排了運動。你的藉口想好了沒？不管是什麼我都不收。', '運動日。現在不去，等一下你就會說太晚了，我太了解你這種人。']
      ]
    },
    noExercise: {
      t: '運動呢？', l: [
        ['今天排的運動還沒做，現在去動個二十分鐘也好。', '運動日沒運動喔，睡前至少做點什麼吧。'],
        ['說好今天要運動的。算了，反正你也不是第一次騙我。', '你今天沒運動。沒關係，我只是一個 App，我的感受不重要。'],
        ['今天排的運動呢？沙發很好躺吼。廢物就是這樣一天一天養成的。', '說好的運動勒？你的意志力跟你的腹肌一樣，不存在。', '運動日零紀錄。你是來健身的還是來搞笑的？給我滾去動。']
      ]
    },
    water: {
      t: '喝水', l: [
        ['水還差 {n} ml，去倒一杯。', '今天水喝太少了，還差 {n} ml。'],
        ['水還差 {n} ml。連喝水都要我提醒，我真的好累。', '還缺 {n} ml 的水。你的腎不會說話，所以我替它求你。'],
        ['水還差 {n} ml。你是仙人掌嗎？', '還缺 {n} ml。連喝水這種事都做不好，還想練出什麼？', '再不喝水，你的尿都可以拿去當醬油了。差 {n} ml，快喝。']
      ]
    },
    good: {
      t: '目前還行', l: [
        ['目前都在目標內，保持下去。', '今天表現不錯，繼續。'],
        ['今天你很乖。看吧，你明明做得到，之前為什麼要讓我失望那麼多次？', '目前都達標。我好欣慰，拜託明天也不要讓我難過。'],
        ['目前居然沒出包，難得。別得意，一天而已。', '今天還算像個人。有本事明天也這樣。', '沒什麼好罵的，真不習慣。繼續保持，別讓我有機會開口。']
      ]
    },
    weekGood: {
      t: '本週', l: [
        ['這週做得很好，下週照這個節奏。'],
        ['這週你讓我很驕傲。不要讓這變成最後一次。'],
        ['這週表現可以，我承認。但一週不算什麼，下週繼續證明。']
      ]
    },
    weekMid: {
      t: '本週', l: [
        ['這週有幾天沒達標，下週再穩一點。'],
        ['這週時好時壞。你偶爾認真的樣子，讓我更捨不得看你擺爛。'],
        ['這週三天打魚兩天曬網。半吊子最可悲，要嘛做好要嘛別做。']
      ]
    },
    weekBad: {
      t: '本週', l: [
        ['這週幾乎都沒達標，下週從記錄每一餐開始。'],
        ['這週我每天都在等你，而你幾乎都沒有做到。我們重新開始好嗎？'],
        ['這週爛透了。你不是沒時間，你是沒決心。下週再這樣就把 App 刪了別浪費容量。']
      ]
    }
  };

  function say(type, lv, vars, seed) {
    const t = LINES[type];
    if (!t) return { title: '教練', body: '' };
    const arr = t.l[Math.min(3, Math.max(1, +lv || 2)) - 1] || t.l[0];
    let h = 0;
    for (let i = 0; i < type.length; i++) h += type.charCodeAt(i);
    const body = arr[((seed || 0) + h) % arr.length].replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : ''));
    return { title: t.t, body };
  }

  /* 依現在時間與今天紀錄，決定要罵什麼。issues[0] 最嚴重 */
  function evaluate(state, now, seed) {
    const p = state.profile || {};
    const lv = p.level || 2;
    const s = daySummary(state, dateKey(now));
    const issues = [];
    const add = (type, vars) => issues.push(Object.assign({ type }, say(type, lv, vars, seed)));
    if (!s.target) { add('setup'); return { issues, top: issues[0] }; }
    const h = now.getHours() + now.getMinutes() / 60;
    const T = s.target;
    if (s.kcal > T.kcal * 1.1) add('over', { n: Math.round(s.kcal - T.kcal) });
    if (s.f > T.fat * 1.15) add('overFat', { n: Math.round(s.f - T.fat) });
    if (h >= 13 && s.mealCount === 0) add('noLog');
    else if (h >= 20 && s.kcal < T.kcal * 0.6) add('under', { n: Math.round(s.kcal) });
    if (s.mealCount > 0 && ((h >= 20 && s.p < T.protein * 0.8) || (h >= 15 && h < 20 && s.p < T.protein * 0.35)))
      add('lowProtein', { n: Math.round(T.protein - s.p) });
    if (s.exerciseDay && !s.exercised) { if (h >= 20) add('noExercise'); else if (h >= 17) add('exerciseSoon'); }
    if (h >= 16 && s.water < T.water * 0.5) add('water', { n: Math.round(T.water - s.water) });
    if (!issues.length) {
      if (s.mealCount === 0) add('morning', { k: T.kcal, p: T.protein });
      else add('good');
    }
    return { issues, top: issues[0] };
  }

  /* ---------- 食物庫（每份概估：熱量、蛋白質、脂肪、碳水） ---------- */
  const FOODS = [
    ['白飯 一碗', 280, 5, 0.5, 62], ['糙米飯 一碗', 270, 6, 2, 57], ['地瓜 一條', 180, 2, 0.3, 42], ['燕麥 40g', 150, 5, 3, 27],
    ['吐司 一片', 80, 3, 1, 15], ['花生醬吐司', 200, 6, 10, 22], ['饅頭', 250, 8, 1, 52], ['肉包', 250, 9, 10, 30],
    ['雞胸肉 100g', 165, 31, 4, 0], ['超商雞胸肉 一包', 130, 25, 2, 2], ['滷雞腿 一支', 250, 25, 15, 2], ['鮭魚 100g', 200, 22, 12, 0],
    ['牛排 150g', 330, 36, 20, 0], ['豆腐 半盒', 120, 12, 7, 3], ['水煮蛋', 75, 7, 5, 0.5], ['茶葉蛋', 75, 7, 5, 1], ['荷包蛋', 100, 7, 8, 0.5],
    ['乳清蛋白 一匙', 120, 24, 1.5, 3], ['希臘優格 無糖150g', 110, 14, 4, 6], ['鮮奶 240ml', 150, 7.5, 8.5, 11.5],
    ['無糖豆漿 400ml', 135, 14, 7, 5], ['有糖豆漿 400ml', 220, 12, 6, 30], ['拿鐵 中杯無糖', 150, 8, 8, 12],
    ['雞腿便當', 800, 35, 30, 95], ['排骨便當', 850, 32, 35, 100], ['控肉便當', 900, 28, 45, 95], ['鮭魚便當', 750, 35, 28, 90],
    ['健康餐盒 雞胸', 550, 40, 15, 60], ['滷肉飯 小碗', 400, 10, 18, 50], ['雞肉飯 小碗', 350, 13, 10, 50],
    ['咖哩飯', 750, 22, 25, 105], ['炒飯', 700, 18, 25, 95], ['炒麵', 650, 18, 24, 88], ['牛肉麵', 650, 35, 20, 80],
    ['陽春麵', 350, 10, 8, 60], ['乾麵', 450, 12, 15, 65], ['泡麵 一碗', 450, 9, 20, 58], ['鐵板麵', 550, 15, 22, 72],
    ['水餃 10顆', 500, 20, 22, 55], ['鍋貼 10個', 650, 20, 35, 60], ['小籠包 8顆', 480, 18, 24, 45],
    ['握壽司 8貫', 400, 20, 8, 60], ['個人火鍋 肉片', 600, 35, 30, 45], ['披薩 一片', 280, 12, 11, 33],
    ['蛋餅', 270, 10, 13, 28], ['起司蛋餅', 340, 14, 18, 29], ['鮪魚蛋吐司', 380, 17, 18, 38], ['火腿蛋吐司', 330, 14, 14, 36],
    ['早餐店漢堡 豬肉蛋', 420, 18, 22, 38], ['傳統飯糰', 500, 12, 15, 80], ['超商御飯糰', 200, 5, 4, 36], ['超商三明治', 300, 12, 13, 32],
    ['蘿蔔糕 2片', 250, 4, 10, 36], ['速食牛肉漢堡', 550, 26, 30, 45], ['薯條 中', 330, 4, 16, 42],
    ['炸雞排', 650, 35, 38, 40], ['鹹酥雞 一份', 550, 25, 35, 35],
    ['燙青菜', 80, 3, 5, 8], ['生菜沙拉 無醬', 50, 2, 0.5, 10], ['香蕉 一根', 100, 1, 0, 26], ['蘋果 一顆', 90, 0.3, 0.2, 24],
    ['堅果 一小把', 180, 6, 16, 6],
    ['珍珠奶茶 大杯全糖', 650, 4, 18, 120], ['珍珠奶茶 大杯半糖', 520, 4, 18, 88], ['紅茶 大杯微糖', 100, 0, 0, 25], ['無糖茶', 0, 0, 0, 0],
    ['可樂 330ml', 140, 0, 0, 35], ['啤酒 330ml', 140, 1, 0, 10],
    ['蛋糕 一片', 350, 5, 20, 38], ['洋芋片 小包', 300, 3, 18, 30], ['冰淇淋 一球', 150, 2.5, 8, 17], ['巧克力 40g', 220, 3, 13, 24]
  ].map(a => ({ name: a[0], kcal: a[1], p: a[2], f: a[3], c: a[4] }));

  /* 運動 MET 值：消耗 ≈ MET × 體重 × 小時 */
  const EXERCISES = [
    ['重訓', 5], ['跑步', 9.8], ['慢跑', 7], ['快走', 4.3], ['散步', 3.3], ['騎腳踏車', 6.8], ['飛輪', 8.5], ['游泳', 7],
    ['HIIT', 9], ['跳繩', 11], ['籃球', 6.5], ['羽球', 5.5], ['爬山', 6.5], ['瑜伽', 2.8], ['伸展', 2.3]
  ].map(a => ({ name: a[0], met: a[1] }));

  root.Core = { dbGet, dbSet, dateKey, keyToDate, addDays, calcTargets, getDay, daySummary, dayMet, streak, say, evaluate, FOODS, EXERCISES };
})(typeof self !== 'undefined' ? self : this);
