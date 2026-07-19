/* ピアノれんしゅうアプリ — 落下ノーツ + 鍵盤 + 指番号表示 */
(() => {
  'use strict';

  const song = window.SONGS[0];
  const notes = song.notes;                 // t 昇順ソート済み
  const TOTAL = song.totalBeats;            // 110
  const BPB = song.beatsPerBar;             // 2 (2/4拍子)
  const COUNT_BEATS = 4;                    // カウントイン拍数

  // ---- 色 ----
  const COL = {
    R: '#ff8a3d', RDark: '#c95f16', RDim: 'rgba(255,138,61,0.22)',
    L: '#38bdf8', LDark: '#1284c2', LDim: 'rgba(56,189,248,0.22)',
    bg1: '#0f1526', bg2: '#141c33',
    barLine: 'rgba(147,160,194,0.28)', beatLine: 'rgba(147,160,194,0.10)',
    hitLine: '#ffd166',
    whiteKey: '#f4f1ea', whiteKeyEdge: '#c9c4b8', blackKey: '#1d2233',
  };

  // ---- 鍵盤レイアウト (A2..C7) ----
  const LOW = 45, HIGH = 96;
  const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
  const keys = [];        // {m, black, wi(白鍵index) or 左隣白鍵index}
  let whiteCount = 0;
  for (let m = LOW; m <= HIGH; m++) {
    if (isBlack(m)) keys.push({ m, black: true, wi: whiteCount - 1 });
    else keys.push({ m, black: false, wi: whiteCount++ });
  }
  const NUM_WHITE = whiteCount;
  const keyByMidi = new Map(keys.map(k => [k.m, k]));
  const DOREMI = { 0: 'ド', 2: 'レ', 4: 'ミ', 5: 'ファ', 7: 'ソ', 9: 'ラ', 11: 'シ' };
  // 黒鍵の中心ずらし（見た目調整）
  const BLACK_SHIFT = { 1: -0.13, 3: 0.13, 6: -0.16, 8: 0, 10: 0.16 };

  // ---- DOM ----
  const cv = document.getElementById('cv');
  const ctx2d = cv.getContext('2d');
  const btnPlay = document.getElementById('btnPlay');
  const btnRew = document.getElementById('btnRew');
  const selSection = document.getElementById('selSection');
  const btnLoop = document.getElementById('btnLoop');
  const segHand = document.getElementById('segHand');
  const rngTempo = document.getElementById('rngTempo');
  const tempoVal = document.getElementById('tempoVal');
  const btnMetro = document.getElementById('btnMetro');
  const btnCount = document.getElementById('btnCount');
  const btnDoremi = document.getElementById('btnDoremi');
  const barNow = document.getElementById('barNow');
  const progress = document.getElementById('progress');
  const progFill = document.getElementById('progFill');
  const progMarks = document.getElementById('progMarks');

  // ---- 状態 ----
  const store = key => 'piano-lesson:' + key;
  let tempo = +(localStorage.getItem(store('tempo')) || song.defaultTempo);
  let handMode = 'both';                    // 'both' | 'R' | 'L'
  let loopOn = false;
  let metroOn = localStorage.getItem(store('metro')) === '1';
  let countOn = localStorage.getItem(store('count')) !== '0';
  let doremiOn = localStorage.getItem(store('doremi')) !== '0';
  let playing = false;
  let curBeat = 0;                          // アンカー拍（再生中: anchorTime時点の拍）
  let anchorTime = 0;
  let scheduleFloor = 0;                    // これ未満の拍の音は鳴らさない（カウントイン用）
  let notePtr = 0;                          // 次にスケジュールする notes のindex
  let nextClick = 0;                        // 次のメトロノーム拍
  let schedTimer = null;
  const bps = () => tempo / 60;

  // ---- オーディオ ----
  let ac = null, master = null;
  const voices = new Set();
  function ensureAudio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6;
      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ac.destination);
      // 音声が中断されたら（着信・Siri等）再生を止めて位置を保つ
      ac.addEventListener('statechange', () => {
        if (ac.state !== 'running' && playing) pause();
      });
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function playTone(midi, when, durSec, vel, stacc) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const gate = stacc ? Math.min(durSec * 0.5, 0.22) : Math.max(durSec * 0.92, 0.08);
    const g = ac.createGain();
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = Math.min(9500, f * 6.5);
    flt.Q.value = 0.4;
    const o1 = ac.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = ac.createGain(); g2.gain.value = 0.22;
    o1.connect(flt); o2.connect(g2).connect(flt); flt.connect(g).connect(master);
    const peak = 0.10 + vel * 0.26;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.35, 0.001), when + Math.min(0.30, gate));
    g.gain.exponentialRampToValueAtTime(0.001, when + gate + 0.10);
    const stopAt = when + gate + 0.15;
    o1.start(when); o2.start(when);
    o1.stop(stopAt); o2.stop(stopAt);
    const v = { g, o1, o2 };
    voices.add(v);
    o1.onended = () => voices.delete(v);
  }
  function clickTone(when, accent) {
    const o = ac.createOscillator(); o.type = 'square';
    o.frequency.value = accent ? 1900 : 1300;
    const g = ac.createGain();
    g.gain.setValueAtTime(accent ? 0.12 : 0.08, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    o.connect(g).connect(master);
    o.start(when); o.stop(when + 0.06);
  }
  function stopVoices() {
    if (!ac) return;
    const now = ac.currentTime;
    for (const v of voices) {
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setValueAtTime(v.g.gain.value || 0.0001, now);
        v.g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        v.o1.stop(now + 0.08); v.o2.stop(now + 0.08);
      } catch (e) { /* 停止済みは無視 */ }
    }
    voices.clear();
  }

  // ---- 再生位置 ----
  const beatNow = () => playing ? curBeat + (ac.currentTime - anchorTime) * bps() : curBeat;
  const audible = n => (handMode === 'both' || n.h === handMode);
  function lowerBound(beat) {
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].t < beat) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // ---- セクション ----
  const secStart = i => song.sections[i].bar * BPB;
  const secEnd = i => i + 1 < song.sections.length ? song.sections[i + 1].bar * BPB : TOTAL;
  function sectionAt(beat) {
    let s = 0;
    for (let i = 0; i < song.sections.length; i++) if (beat >= secStart(i)) s = i;
    return s;
  }
  // ループ範囲: selSection が「全体」ならば曲全体
  function loopRange() {
    const v = selSection.value;
    if (v === 'all') return [0, TOTAL];
    const i = +v;
    return [secStart(i), secEnd(i)];
  }

  // ---- スケジューラ ----
  const LOOKAHEAD = 0.18;                   // 秒
  function schedulerTick() {
    if (!playing) return;
    const horizon = beatNow() + LOOKAHEAD * bps();
    const [ls, le] = loopRange();
    const limit = loopOn ? le : TOTAL + 2;

    // 音符
    while (notePtr < notes.length && notes[notePtr].t < Math.min(horizon, limit)) {
      const n = notes[notePtr++];
      if (n.t < scheduleFloor) continue;
      if (!audible(n)) continue;
      const when = anchorTime + (n.t - curBeat) / bps();
      playTone(n.m, when, n.d / bps(), n.v, !!n.s);
    }
    // メトロノーム（カウントイン中は常に鳴らす）
    while (nextClick < Math.min(horizon, limit)) {
      if (metroOn || nextClick < scheduleFloor) {
        const when = anchorTime + (nextClick - curBeat) / bps();
        if (when >= ac.currentTime - 0.01) clickTone(when, ((nextClick % BPB) + BPB) % BPB === 0);
      }
      nextClick++;
    }
    // ループ / 終了
    const b = beatNow();
    if (loopOn && b >= le) {
      seek(ls, { keepPlaying: true, countIn: false });
    } else if (!loopOn && b >= TOTAL + 1.5) {
      pause();
      seek(0, {});
    }
  }

  function seek(beat, { keepPlaying = false, countIn = false } = {}) {
    stopVoices();
    scheduleFloor = beat;
    const pre = countIn ? COUNT_BEATS : 0;
    curBeat = beat - pre;
    nextClick = Math.ceil(curBeat);
    notePtr = lowerBound(beat);
    if (ac) anchorTime = ac.currentTime + 0.05;
    if (!playing && !keepPlaying) curBeat = beat; // 停止中はプリロールなし
  }

  function play() {
    ensureAudio();
    if (playing) return;
    let b = curBeat;
    const [ls, le] = loopRange();
    if (loopOn && (b < ls || b >= le)) b = ls;
    if (b >= TOTAL) b = loopOn ? ls : 0;
    playing = true;
    seek(b, { keepPlaying: true, countIn: countOn });
    schedTimer = setInterval(schedulerTick, 25);
    btnPlay.textContent = '⏸ 停止';
    btnPlay.classList.remove('primary');
    btnPlay.classList.add('toggled');
  }
  function pause() {
    if (!playing) return;
    curBeat = Math.min(Math.max(beatNow(), 0), TOTAL);
    playing = false;
    clearInterval(schedTimer);
    stopVoices();
    btnPlay.textContent = '▶ 再生';
    btnPlay.classList.add('primary');
    btnPlay.classList.remove('toggled');
  }

  // ---- UI イベント ----
  // ボタンにフォーカスが残ると Space/Enter で誤作動するため、クリック後に外す
  document.querySelectorAll('button, select, input').forEach(el =>
    el.addEventListener('click', () => el.blur()));
  // タブ/アプリが隠れたら自動で一時停止（iPadでのアプリ切替・ロック対策）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause();
  });
  btnPlay.addEventListener('click', () => playing ? pause() : play());
  btnRew.addEventListener('click', () => {
    const [ls] = loopRange();
    const target = loopOn ? ls : (selSection.value === 'all' ? 0 : secStart(+selSection.value));
    if (playing) { seek(target, { keepPlaying: true, countIn: countOn }); }
    else seek(target, {});
  });

  // セクションselect
  {
    const optAll = document.createElement('option');
    optAll.value = 'all'; optAll.textContent = '🎼 全体をとおして';
    selSection.appendChild(optAll);
    song.sections.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${s.name}（${s.bar + 1}小節目〜）`;
      selSection.appendChild(o);
    });
  }
  selSection.addEventListener('change', () => {
    const v = selSection.value;
    const target = v === 'all' ? 0 : secStart(+v);
    if (playing) seek(target, { keepPlaying: true, countIn: countOn });
    else seek(target, {});
  });

  const setToggle = (btn, on) => btn.classList.toggle('toggled', on);
  btnLoop.addEventListener('click', () => { loopOn = !loopOn; setToggle(btnLoop, loopOn); });
  btnMetro.addEventListener('click', () => {
    metroOn = !metroOn; setToggle(btnMetro, metroOn);
    localStorage.setItem(store('metro'), metroOn ? '1' : '0');
  });
  btnCount.addEventListener('click', () => {
    countOn = !countOn; setToggle(btnCount, countOn);
    localStorage.setItem(store('count'), countOn ? '1' : '0');
  });
  btnDoremi.addEventListener('click', () => {
    doremiOn = !doremiOn; setToggle(btnDoremi, doremiOn);
    localStorage.setItem(store('doremi'), doremiOn ? '1' : '0');
  });
  setToggle(btnMetro, metroOn); setToggle(btnCount, countOn); setToggle(btnDoremi, doremiOn);

  segHand.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    handMode = b.dataset.hand;
    segHand.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });

  rngTempo.value = tempo;
  tempoVal.textContent = tempo;
  rngTempo.addEventListener('input', () => {
    const b = beatNow();
    tempo = +rngTempo.value;
    tempoVal.textContent = tempo;
    localStorage.setItem(store('tempo'), tempo);
    if (playing) { curBeat = b; anchorTime = ac.currentTime; }
  });

  // 進行バー
  {
    // セクション境界の目盛り
    song.sections.forEach(s => {
      const i = document.createElement('i');
      i.className = 'sec';
      i.style.left = (s.bar * BPB / TOTAL * 100) + '%';
      progMarks.appendChild(i);
    });
    for (let b = 0; b < TOTAL / BPB; b += 4) { // 4小節ごとの薄い目盛り
      const i = document.createElement('i');
      i.style.left = (b * BPB / TOTAL * 100) + '%';
      progMarks.appendChild(i);
    }
  }
  function progSeek(e) {
    const r = progress.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const bar = Math.floor(frac * TOTAL / BPB);
    const beat = Math.min(bar * BPB, TOTAL - BPB);
    if (playing) seek(beat, { keepPlaying: true, countIn: countOn });
    else seek(beat, {});
  }
  progress.addEventListener('pointerdown', e => {
    progSeek(e);
    try { progress.setPointerCapture(e.pointerId); } catch (err) { /* 非対応環境は無視 */ }
  });
  progress.addEventListener('pointermove', e => { if (e.buttons) progSeek(e); });

  // ---- 鍵盤ジオメトリ & 自由演奏 ----
  let W = 0, H = 0, kbH = 0, hitY = 0, whiteW = 0;
  const BEATS_VISIBLE = 4;
  function keyRect(k) {
    if (!k.black) return { x: k.wi * whiteW, w: whiteW, h: kbH };
    const bw = whiteW * 0.62;
    const shift = (BLACK_SHIFT[k.m % 12] || 0) * bw;
    return { x: (k.wi + 1) * whiteW - bw / 2 + shift, w: bw, h: kbH * 0.63 };
  }
  const manualKeys = new Map();   // pointerId -> midi
  function keyFromPoint(x, y) {
    // 黒鍵優先
    for (const k of keys) {
      if (!k.black) continue;
      const r = keyRect(k);
      if (x >= r.x && x <= r.x + r.w && y >= hitY && y <= hitY + r.h) return k;
    }
    const wi = Math.floor(x / whiteW);
    return keys.find(k => !k.black && k.wi === wi) || null;
  }
  cv.addEventListener('pointerdown', e => {
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (y < hitY) return;
    ensureAudio();
    const k = keyFromPoint(x, y);
    if (!k) return;
    manualKeys.set(e.pointerId, k.m);
    playTone(k.m, ac.currentTime, 0.6, 0.8, false);
    cv.setPointerCapture(e.pointerId);
  });
  const releaseManual = e => manualKeys.delete(e.pointerId);
  cv.addEventListener('pointerup', releaseManual);
  cv.addEventListener('pointercancel', releaseManual);

  // ---- 描画 ----
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    kbH = Math.min(Math.max(H * 0.30, 110), 190);
    hitY = H - kbH;
    whiteW = W / NUM_WHITE;
    document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth && window.innerWidth < 920);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });
  resize();

  function roundRect(x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.closePath();
  }

  function draw() {
    const now = Math.min(beatNow(), TOTAL + 2);
    const pxPerBeat = (hitY - 8) / BEATS_VISIBLE;
    const yOf = beat => hitY - (beat - now) * pxPerBeat;

    // 背景
    const grad = ctx2d.createLinearGradient(0, 0, 0, hitY);
    grad.addColorStop(0, COL.bg1); grad.addColorStop(1, COL.bg2);
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, W, H);

    // 拍・小節線
    ctx2d.textBaseline = 'middle';
    for (let b = Math.floor(now); b <= now + BEATS_VISIBLE + 1; b++) {
      if (b < 0) continue;
      const y = yOf(b);
      if (y < -20 || y > hitY) continue;
      const isBar = b % BPB === 0;
      ctx2d.strokeStyle = isBar ? COL.barLine : COL.beatLine;
      ctx2d.lineWidth = isBar ? 1.5 : 1;
      ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke();
      if (isBar && b < TOTAL) {
        const barIdx = b / BPB;
        ctx2d.fillStyle = 'rgba(147,160,194,0.75)';
        ctx2d.font = '11px sans-serif';
        ctx2d.textAlign = 'left';
        ctx2d.fillText(`${barIdx + 1}`, 6, y - 8);
        // セクションラベル
        const sec = song.sections.find(s => s.bar === barIdx);
        if (sec) {
          ctx2d.font = 'bold 12px sans-serif';
          const tw = ctx2d.measureText(sec.name).width;
          ctx2d.fillStyle = '#26315a';
          roundRect(24, y - 18, tw + 16, 20, 9); ctx2d.fill();
          ctx2d.fillStyle = '#c3cdec';
          ctx2d.fillText(sec.name, 32, y - 8);
        }
      }
    }

    // 落下ノーツ
    const from = now - 3, to = now + BEATS_VISIBLE + 1;
    const iStart = lowerBound(from);
    ctx2d.textAlign = 'center';
    for (let i = iStart; i < notes.length && notes[i].t < to; i++) {
      const n = notes[i];
      const yBot = yOf(n.t), yTop = yOf(n.t + n.d);
      if (yBot < 0 || yTop > hitY) continue;
      const k = keyByMidi.get(n.m);
      if (!k) continue;
      const r = keyRect(k);
      const dim = !audible(n);
      const active = playing && now >= n.t && now < n.t + n.d;
      const clipBot = Math.min(yBot, hitY);
      const h = clipBot - yTop;
      if (h < 2) continue;
      ctx2d.fillStyle = dim ? (n.h === 'R' ? COL.RDim : COL.LDim) : (n.h === 'R' ? COL.R : COL.L);
      roundRect(r.x + 1, yTop, r.w - 2, h, Math.min(5, h / 2));
      ctx2d.fill();
      if (active && !dim) {
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth = 2;
        ctx2d.stroke();
      }
      // 指番号（音符の下端 = 弾く瞬間側に表示）
      if (h > 13 && r.w > 16) {
        ctx2d.fillStyle = dim ? 'rgba(255,255,255,0.35)' : '#fff';
        ctx2d.font = `bold ${Math.min(17, h - 2)}px sans-serif`;
        ctx2d.fillText(n.f, r.x + r.w / 2, clipBot - Math.min(11, h / 2));
      }
    }

    // カウントイン表示
    if (playing && now < scheduleFloor) {
      const remain = Math.ceil(scheduleFloor - now);
      ctx2d.fillStyle = 'rgba(255,209,102,0.95)';
      ctx2d.font = 'bold 84px sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(remain, W / 2, hitY * 0.42);
      ctx2d.font = '16px sans-serif';
      ctx2d.fillText('カウント…', W / 2, hitY * 0.42 + 58);
    }

    // ヒットライン
    ctx2d.fillStyle = COL.hitLine;
    ctx2d.fillRect(0, hitY - 3, W, 3);

    // ---- 鍵盤 ----
    // 白鍵
    for (const k of keys) {
      if (k.black) continue;
      const r = keyRect(k);
      ctx2d.fillStyle = COL.whiteKey;
      ctx2d.fillRect(r.x, hitY, r.w - 1, kbH);
      ctx2d.strokeStyle = COL.whiteKeyEdge;
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(r.x + 0.5, hitY + 0.5, r.w - 1.5, kbH - 1);
    }
    // 発音中の白鍵ハイライト（自動再生 + 手動）
    const lit = new Map(); // midi -> {h, f}
    if (playing) {
      for (let i = lowerBound(now - 3); i < notes.length && notes[i].t <= now; i++) {
        const n = notes[i];
        if (now >= n.t && now < n.t + Math.max(n.d, 0.3) && audible(n)) lit.set(n.m, n);
      }
    }
    for (const m of manualKeys.values()) if (!lit.has(m)) lit.set(m, { h: 'M', f: null });
    const keyFill = n => n.h === 'R' ? COL.R : n.h === 'L' ? COL.L : '#a78bfa';
    for (const [m, n] of lit) {
      const k = keyByMidi.get(m);
      if (!k || k.black) continue;
      const r = keyRect(k);
      ctx2d.fillStyle = keyFill(n);
      ctx2d.globalAlpha = 0.85;
      ctx2d.fillRect(r.x, hitY, r.w - 1, kbH);
      ctx2d.globalAlpha = 1;
    }
    // ドレミ表示 & 中央ド
    if (doremiOn) {
      ctx2d.textAlign = 'center';
      ctx2d.font = '10px sans-serif';
      for (const k of keys) {
        if (k.black) continue;
        const r = keyRect(k);
        const name = DOREMI[k.m % 12];
        ctx2d.fillStyle = k.m === 60 ? '#e0492f' : 'rgba(60,60,70,0.55)';
        if (k.m === 60) ctx2d.font = 'bold 11px sans-serif'; else ctx2d.font = '10px sans-serif';
        ctx2d.fillText(name, r.x + r.w / 2, hitY + kbH - 10);
      }
    }
    // 黒鍵
    for (const k of keys) {
      if (!k.black) continue;
      const r = keyRect(k);
      const n = lit.get(k.m);
      ctx2d.fillStyle = n ? keyFill(n) : COL.blackKey;
      roundRect(r.x, hitY, r.w, r.h, 3);
      ctx2d.fill();
    }
    // 指番号バッジ（発音中の鍵に表示）
    for (const [m, n] of lit) {
      if (n.f == null) continue;
      const k = keyByMidi.get(m);
      if (!k) continue;
      const r = keyRect(k);
      const cx = r.x + r.w / 2;
      const cy = k.black ? hitY + r.h - 16 : hitY + kbH * 0.72 - (doremiOn ? 12 : 0);
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx2d.fillStyle = n.h === 'R' ? COL.RDark : COL.LDark;
      ctx2d.fill();
      ctx2d.fillStyle = '#fff';
      ctx2d.font = 'bold 15px sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(n.f, cx, cy + 1);
    }

    // 進行バー・小節表示
    const shown = Math.min(Math.max(now, 0), TOTAL);
    progFill.style.width = (shown / TOTAL * 100) + '%';
    barNow.textContent = `小節 ${Math.min(Math.floor(shown / BPB) + 1, TOTAL / BPB)} / ${TOTAL / BPB}`;

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // デバッグ用（コンソールから状態確認）
  window.__piano = {
    beatNow, voiceCount: () => voices.size,
    acState: () => ac ? ac.state : 'none',
    isPlaying: () => playing,
  };
})();
