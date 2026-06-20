// しまんちゅ競馬予想 UI:
// 利用者ごとに別JSONを読み込み、スマホ縦/PC両対応で表示する。

const APP_NAME = "しまんちゅ競馬予想";
const PROFILE_STORAGE_KEY = "shimanchu-keiba-profile";
const PROFILES = [
  { id: "yoshi", label: "ヨシ", dataUrl: "data/yoshi.json" },
  { id: "tsubo", label: "ツボ", dataUrl: "data/tsubo.json" },
  { id: "taka", label: "タカ", dataUrl: "data/taka.json" },
  { id: "kosu", label: "コス", dataUrl: "data/kosu.json" },
];
const RECOMMENDATION_BASE_DATES = ["2026-06-13", "2026-06-14"];
const PROFILE_STATE_STORAGE_KEY = "shimanchu-keiba-state-v1";
const SAVED_PREDICTIONS_STORAGE_KEY = "shimanchu-keiba-predictions-v1";
const WAKU = {1:"w1",2:"w2",3:"w3",4:"w4",5:"w5",6:"w6",7:"w7",8:"w8"};
const MARK = {1:"◎",2:"○",3:"▲",4:"△",5:"△"};

let DATA = null;
let scope = "all";
let weights = { place: 0.5, jockey: 0.2, time: 0.3, parent: 0 };
let curDay = 0;
let curRace = 0;
let selectedHorse = null;
let deferredInstallPrompt = null;
let profileId = getInitialProfileId();

const $ = (id) => document.getElementById(id);
const pct = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 100);
const f2 = (v) => (v || 0).toFixed(2);

async function main() {
  registerServiceWorker();
  bindInstallButton();
  bindProfileSelector();
  bindControls();
  $("overlay").addEventListener("click", (e) => {
    if (e.target.id === "overlay") closePop();
  });
  await loadProfile(profileId);
}

function bindProfileSelector() {
  $("profileSeg").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextId = button.dataset.user;
      if (!nextId || nextId === profileId) return;
      profileId = nextId;
      persistProfileId(profileId);
      syncProfileQuery(profileId);
      updateProfileButtons();
      closePop();
      await loadProfile(profileId);
    });
  });
  updateProfileButtons();
}

function bindControls() {
  $("scopeSeg").addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    scope = button.dataset.scope;
    syncScopeButtons();
    persistProfileState();
    if (DATA) render();
  });

  for (const [sliderId, valueId, key] of [["wPlace", "vPlace", "place"], ["wJockey", "vJockey", "jockey"], ["wTime", "vTime", "time"], ["wParent", "vParent", "parent"]]) {
    const input = $(sliderId);
    input.addEventListener("input", () => {
      weights[key] = parseFloat(input.value);
      $(valueId).textContent = f2(weights[key]);
      persistProfileState();
      if (DATA) render();
    });
  }

  syncWeightControls();
  $("resetW").addEventListener("click", () => {
    weights = DATA?.meta?.weights ? { parent: 0, ...DATA.meta.weights } : { place: 0.5, jockey: 0.2, time: 0.3, parent: 0 };
    syncWeightControls();
    persistProfileState();
    if (DATA) render();
  });
  $("recommendBtn").addEventListener("click", openRecommendationPop);
  syncScopeButtons();
}

function syncWeightControls() {
  for (const [sliderId, valueId, key] of [["wPlace", "vPlace", "place"], ["wJockey", "vJockey", "jockey"], ["wTime", "vTime", "time"], ["wParent", "vParent", "parent"]]) {
    const input = $(sliderId);
    input.value = String(weights[key] ?? 0);
    $(valueId).textContent = f2(weights[key] ?? 0);
  }
}

function syncScopeButtons() {
  $("scopeSeg").querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.scope === scope);
  });
}

async function loadProfile(id) {
  const profile = getProfileById(id);
  if (!profile) return;

  selectedHorse = null;
  DATA = null;
  $("modelStat").textContent = `${profile.label} のデータを読込中…`;
  document.title = `${APP_NAME} | ${profile.label}`;
  updateProfileButtons();

  try {
    DATA = await fetchProfileData(profile);
  } catch (error) {
    renderLoadError(profile, error);
    return;
  }

  const savedState = loadProfileState(profile.id);
  scope = savedState?.scope === "graded" ? "graded" : "all";
  weights = {
    parent: 0,
    ...(DATA.meta?.weights || { place: 0.5, jockey: 0.2, time: 0.3 }),
    ...(savedState?.weights || {}),
  };
  syncScopeButtons();
  syncWeightControls();
  $("modelStat").innerHTML = `${profile.label}用 / 学習 <b>${DATA.meta.trainedRaces.toLocaleString()}</b> レース`;
  $("footer").textContent = `出典: JRA-VAN DataLab (JV-Link)。${profile.label}用JSONを読込中。デモであり的中を保証するものではありません。`;
  buildRacePane();

  const firstDay = DATA.days.findIndex((day) => day.races.length > 0);
  if (firstDay === -1) {
    renderEmptyState(profile);
    return;
  }
  curDay = -1;
  curRace = -1;
  renderInitialSelectionState(profile);
}

async function fetchProfileData(profile) {
  const res = await fetch(profile.dataUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const payload = await res.json();
  if (payload?.days) return payload;

  const shared = payload?.shared;
  if (!shared) return payload;

  $("modelStat").textContent = `${profile.label} の共通データを読込中…`;

  if (shared.format === "gzip-base64-chunks-v1" && Array.isArray(shared.chunks)) {
    const days = await inflateSharedChunks(profile.dataUrl, shared.chunks);
    return { ...payload, days };
  }

  if (shared.url) {
    const sharedRes = await fetch(resolveSharedUrl(profile.dataUrl, shared.url), { cache: "no-store" });
    if (!sharedRes.ok) throw new Error(`HTTP ${sharedRes.status}`);
    const body = await sharedRes.json();
    return { ...payload, days: body.days || [] };
  }

  return payload;
}

async function inflateSharedChunks(profileUrl, chunks) {
  if (!("DecompressionStream" in window)) {
    throw new Error("このブラウザは圧縮データ展開に未対応です。最新の Safari / Chrome を使ってください。");
  }

  const baseUrl = new URL(profileUrl, window.location.href);
  const texts = await Promise.all(chunks.map(async (chunk) => {
    const response = await fetch(new URL(chunk, baseUrl), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }));

  const bytes = base64ToBytes(texts.join(""));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const shared = JSON.parse(await new Response(stream).text());
  return shared.days || [];
}

function resolveSharedUrl(profileUrl, sharedUrl) {
  return new URL(sharedUrl, new URL(profileUrl, window.location.href)).toString();
}

function base64ToBytes(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function updateProfileButtons() {
  $("profileSeg").querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.user === profileId);
  });
}

function buildRacePane() {
  if (!DATA) {
    $("racepane").innerHTML = "";
    return;
  }
  const fmtDate = (d) => {
    const [, m, dd] = d.split("-");
    return `${+m}/${+dd}`;
  };
  $("racepane").innerHTML = DATA.days.map((day, dayIndex) => `
    <details class="daygrp">
      <summary>${fmtDate(day.date)}（${day.races.length}R）</summary>
      ${day.races.map((race, raceIndex) => `
        <button class="rbtn" data-d="${dayIndex}" data-r="${raceIndex}">
          <span class="no">${race.label}</span>
          <span class="nm">${race.raceName}${/G\d|J\.G|重賞/.test(race.grade) ? ` <span class="gb">${race.grade}</span>` : ""}</span>
        </button>`).join("")}
    </details>`).join("");
  $("racepane").querySelectorAll(".rbtn").forEach((button) => {
    button.addEventListener("click", () => selectRace(+button.dataset.d, +button.dataset.r));
  });
}

function selectRace(dayIndex, raceIndex) {
  curDay = dayIndex;
  curRace = raceIndex;
  selectedHorse = null;
  $("racepane").querySelectorAll(".rbtn").forEach((button) => {
    button.classList.toggle("on", +button.dataset.d === dayIndex && +button.dataset.r === raceIndex);
  });
  const currentRace = race();
  if (!currentRace) return;
  const g = (currentRace.grade || "").toLowerCase().replace(".", "");
  const gcls = g === "g1" ? "g1" : g === "g2" ? "g2" : g === "g3" ? "g3" : "x";
  const named = currentRace.raceName && currentRace.raceName !== `${currentRace.venue}${currentRace.raceNo}R`;
  $("racehead").innerHTML = `<span class="gbadge ${gcls}">${currentRace.grade || "一般"}</span>
    <h1>${currentRace.venue}${currentRace.raceNo}R${named ? "　" + currentRace.raceName : ""}</h1>
    <div class="sub"><span>${DATA.days[dayIndex].date}</span><span>${currentRace.trackType || ""}${currentRace.distance ? currentRace.distance + "m" : ""}</span><span>${currentRace.fieldSize}頭</span></div>`;
  render();
}

function race() {
  return DATA?.days?.[curDay]?.races?.[curRace] ?? null;
}

function compOf(entry) {
  return entry?.[scope];
}

function scoreOf(entry) {
  const comp = compOf(entry);
  return weights.place * comp.placeScore + weights.jockey * comp.jockeyScore + weights.time * comp.timeScore + (weights.parent ?? 0) * (comp.parentScore ?? 0.5);
}

function rankRaceEntries(currentRace, weightSet = weights, scopeKey = scope) {
  const list = currentRace.entries.map((entry) => ({ entry, score: scoreEntry(entry, weightSet, scopeKey) }));
  list.sort((a, b) => b.score - a.score);
  list.forEach((item, index) => {
    item.rank = index + 1;
  });
  return list;
}

function rescored() {
  const currentRace = race();
  if (!currentRace) return [];
  return rankRaceEntries(currentRace, weights, scope);
}

function resBadge(place) {
  if (place == null) return `<span class="res">—</span>`;
  const cls = place === 1 ? "win" : place <= 3 ? "hit" : "";
  return `<span class="res ${cls}">${place}</span>`;
}

function parentNames(entry) {
  const p = entry.parent;
  if (!p) return `<span class="none">–</span>`;
  return `<span class="pn">父 ${p.sire || "–"}</span><br><span class="pn">母 ${p.dam || "–"}</span>`;
}

function render() {
  const currentRace = race();
  if (!currentRace) return;

  const list = rescored();
  $("rows").innerHTML = list.map(({ entry, score, rank }) => {
    const comp = compOf(entry);
    const rowClass = rank <= 3 ? `r${rank}` : "";
    const selectedClass = selectedHorse === entry.horse ? "sel" : "";
    return `<tr class="${rowClass} ${selectedClass}" data-h="${entry.horse}">
      <td class="rank">${rank}</td>
      <td class="mark mobile-hide">${MARK[rank] || ""}</td>
      <td><span class="uma ${WAKU[entry.waku] || "w1"}">${entry.umaban ?? "-"}</span></td>
      <td class="hn">${entry.horse}<div class="s">${entry.sexAge || ""} ${entry.weight ? entry.weight + "k" : ""}</div><div class="mobile-meta">${entry.jockey} / 複勝${pct(comp.jockeyTop3Rate)}%</div></td>
      <td class="jk mobile-hide">${entry.jockey}<div class="s">複勝${pct(comp.jockeyTop3Rate)}%</div></td>
      <td class="tot">${score.toFixed(3)}</td>
      <td class="cell col-detail" data-c="place"><span class="sc">${f2(comp.placeScore)}</span><div class="minibar"><i class="f-p" style="width:${pct(comp.placeScore)}%"></i></div></td>
      <td class="cell col-detail" data-c="jockey"><span class="sc">${f2(comp.jockeyScore)}</span><div class="minibar"><i class="f-j" style="width:${pct(comp.jockeyScore)}%"></i></div></td>
      <td class="cell col-detail" data-c="time"><span class="sc">${f2(comp.timeScore)}</span><div class="minibar"><i class="f-t" style="width:${pct(comp.timeScore)}%"></i></div></td>
      <td class="cell parent col-detail" data-c="parent"><span class="sc">${comp.parentScore != null ? f2(comp.parentScore) : "–"}</span><div class="minibar"><i class="f-parent" style="width:${pct(comp.parentScore ?? 0.5)}%"></i></div><div class="pnames">${parentNames(entry)}</div></td>
      <td class="rescel">${resBadge(entry.actualPlace)}</td>
    </tr>`;
  }).join("");

  $("rows").querySelectorAll("tr").forEach((row) => {
    const horse = row.dataset.h;
    row.querySelectorAll(".cell").forEach((cell) => {
      cell.addEventListener("click", (event) => {
        event.stopPropagation();
        openPop(horse, cell.dataset.c);
      });
    });
    row.querySelector(".rescel")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openResultPop();
    });
    row.addEventListener("click", () => openPop(horse, null));
  });
  renderPredictionPanel();
}

function openPop(horse, focus) {
  if (!DATA) return;
  selectedHorse = horse;
  const item = rescored().find((candidate) => candidate.entry.horse === horse);
  if (!item) return;
  const entry = item.entry;
  const comp = compOf(entry);
  const score = item.score;

  const placeHist = comp.hist.length ? `<ul class="hist">${comp.hist.map((hist) => `<li><span class="l">${fmtD(hist.date)} ${hist.race}</span><span class="r ${hist.place === 1 ? "win" : ""}">${hist.place}着/${hist.field}頭 → ${f2(hist.ps)}</span></li>`).join("")}</ul>` : `<div class="empty">過去の出走データなし（このスコープ）</div>`;
  const timeHist = comp.hist.length ? `<ul class="hist">${comp.hist.map((hist) => `<li><span class="l">${fmtD(hist.date)} ${hist.race}</span><span class="r">z=${hist.z >= 0 ? "+" : ""}${hist.z.toFixed(2)}</span></li>`).join("")}</ul>` : `<div class="empty">過去の出走データなし</div>`;
  const H3CLS = { place: "p", jockey: "j", time: "t", parent: "parent" };
  const section = (cls, title, formula, value, extra) => `<div class="sec ${focus === cls ? "hl" : ""}">
    <h3 class="${H3CLS[cls] || cls[0]}">${title}</h3><div class="fml">${formula}</div><div class="val">${value}</div>${extra || ""}</div>`;

  $("pop").innerHTML = `
    <div class="ph">
      <span class="uma ${WAKU[entry.waku] || "w1"}">${entry.umaban ?? "-"}</span>
      <span class="n">${entry.horse}</span>
      <button class="x" id="popx">×</button>
    </div>
    <div class="pc">
      <div class="sec hl">
        <h3>総合スコア = ${item.rank}位</h3>
        <div class="fml">総合 = 着順力×${f2(weights.place)} ＋ 騎手力×${f2(weights.jockey)} ＋ タイム力×${f2(weights.time)}${weights.parent > 0 ? ` ＋ 親力×${f2(weights.parent)}` : ""}</div>
        <div class="val">${f2(comp.placeScore)}×${f2(weights.place)} + ${f2(comp.jockeyScore)}×${f2(weights.jockey)} + ${f2(comp.timeScore)}×${f2(weights.time)}${weights.parent > 0 ? ` + ${f2(comp.parentScore ?? 0.5)}×${f2(weights.parent)}` : ""} = ${score.toFixed(3)}</div>
      </div>
      ${section("place", "着順力 = " + f2(comp.placeScore), "各レースの着順スコア =（頭数−着順）÷（頭数−1）。1着=1.00 最下位=0.00。その平均が着順力。", `過去${comp.runs}走の平均 = <b>${f2(comp.placeScore)}</b>（勝率${pct(comp.winRate)}% / 複勝率${pct(comp.top3Rate)}%）`, placeHist)}
      ${section("jockey", "騎手力 = " + f2(comp.jockeyScore), "騎手の複勝率（3着内に入った割合）。", `${entry.jockey}：${comp.jockeyStat.top3}/${comp.jockeyStat.runs}走 → 複勝率 <b>${pct(comp.jockeyScore)}%</b>`)}
      ${section("time", "タイム力 = " + f2(comp.timeScore), "各レース内での相対速度 z =（レース平均タイム−自分のタイム）÷標準偏差。速いほど大。平均zを0〜1に正規化(z+2)/4。", `平均z = ${comp.avgZ >= 0 ? "+" : ""}${comp.avgZ.toFixed(2)} → 正規化 <b>${f2(comp.timeScore)}</b>`, timeHist)}
      ${section("parent", "親力 = " + (comp.parentScore != null ? f2(comp.parentScore) : "–"), "父・母それぞれの産駒（兄弟馬）の平均着順スコアを計算し、その平均を親力とする。", entry.parent ? `父 ${entry.parent.sire || "–"}（産駒スコア: ${entry.parent.sireScore != null ? f2(entry.parent.sireScore) : "–"}）<br>母 ${entry.parent.dam || "–"}（産駒スコア: ${entry.parent.damScore != null ? f2(entry.parent.damScore) : "–"}）<br>→ 親力 <b>${comp.parentScore != null ? f2(comp.parentScore) : "データなし"}</b>` : "血統データなし（スクレイピング未取得または未登録）")}
    </div>`;
  $("popx").addEventListener("click", closePop);
  $("overlay").hidden = false;
  $("rows").querySelectorAll("tr").forEach((row) => row.classList.toggle("sel", row.dataset.h === horse));
}

function closePop() {
  $("overlay").hidden = true;
}

function fmtD(date) {
  const [, m, dd] = date.split("-");
  return `${+m}/${+dd}`;
}

function bindInstallButton() {
  const button = $("installBtn");
  if (!button) return;

  button.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    button.hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    button.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    button.hidden = true;
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("service worker registration failed", error);
    });
  });
}

function renderLoadError(profile, error) {
  console.error(error);
  DATA = null;
  $("racepane").innerHTML = "";
  $("racehead").innerHTML = `<h1>${profile.label} のJSONを読み込めませんでした</h1><div class='sub'><span>${profile.dataUrl} を確認してください</span></div>`;
  $("predictPanel").innerHTML = "";
  $("modelStat").textContent = `${profile.label} のデータ読込失敗`;
  $("rows").innerHTML = `<tr><td class='emptycell' colspan='11'>${profile.label} 用のJSONが見つからないか、通信に失敗しました。初回アクセス時はオンラインで ${profile.dataUrl} を取得してください。</td></tr>`;
  $("footer").textContent = `${profile.label} 用データを取得できませんでした。`;
}

function renderEmptyState(profile) {
  $("racepane").innerHTML = "";
  $("predictPanel").innerHTML = "";
  $("modelStat").textContent = `${profile.label} のレースデータなし`;
  $("racehead").innerHTML = `<h1>${profile.label} に表示できるレースがありません</h1><div class='sub'><span>${profile.dataUrl} を作成してから再読み込みしてください</span></div>`;
  $("rows").innerHTML = `<tr><td class='emptycell' colspan='11'>scripts/exportDemo.ts を使って ${profile.label} 用JSONを生成すると、この画面にレース一覧が表示されます。</td></tr>`;
}

function renderInitialSelectionState(profile) {
  $("racepane").querySelectorAll(".rbtn").forEach((button) => button.classList.remove("on"));
  $("predictPanel").innerHTML = "";
  $("racehead").innerHTML = `<h1>レースを選んでください</h1><div class='sub'><span>${profile.label} の開催一覧はすべて閉じた状態で表示しています</span></div>`;
  $("rows").innerHTML = `<tr><td class='emptycell' colspan='11'>左の開催日を開いて、見たいレースを選んでください。</td></tr>`;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function loadProfileStates() {
  return readJsonStorage(PROFILE_STATE_STORAGE_KEY, {});
}

function loadProfileState(id) {
  return loadProfileStates()[id] || null;
}

function persistProfileState() {
  if (!profileId) return;
  const states = loadProfileStates();
  states[profileId] = {
    scope,
    weights: { ...weights },
  };
  writeJsonStorage(PROFILE_STATE_STORAGE_KEY, states);
}

function loadSavedPredictions() {
  return readJsonStorage(SAVED_PREDICTIONS_STORAGE_KEY, {});
}

function persistSavedPredictions(predictions) {
  writeJsonStorage(SAVED_PREDICTIONS_STORAGE_KEY, predictions);
}

function currentRaceKey(dayIndex = curDay, raceIndex = curRace) {
  const day = DATA?.days?.[dayIndex];
  const currentRace = DATA?.days?.[dayIndex]?.races?.[raceIndex];
  if (!day || !currentRace) return null;
  return [profileId, day.date, currentRace.venue || "", currentRace.raceNo || currentRace.label || raceIndex].join("::");
}

function buildPredictionSnapshot(dayIndex = curDay, raceIndex = curRace) {
  const day = DATA?.days?.[dayIndex];
  const currentRace = DATA?.days?.[dayIndex]?.races?.[raceIndex];
  if (!day || !currentRace) return null;
  const rankings = rankRaceEntries(currentRace, weights, scope).slice(0, 3);
  return {
    key: currentRaceKey(dayIndex, raceIndex),
    profileId,
    date: day.date,
    venue: currentRace.venue,
    raceNo: currentRace.raceNo,
    raceLabel: currentRace.label,
    raceName: currentRace.raceName,
    scope,
    weights: { ...weights },
    top3: rankings.map(({ entry, score, rank }) => ({
      rank,
      horse: entry.horse,
      umaban: entry.umaban,
      jockey: entry.jockey,
      score: Number(score.toFixed(3)),
    })),
    savedAt: new Date().toISOString(),
  };
}

function getSavedPrediction(dayIndex = curDay, raceIndex = curRace) {
  const key = currentRaceKey(dayIndex, raceIndex);
  if (!key) return null;
  return loadSavedPredictions()[key] || null;
}

function formatSavedAt(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function renderPredictionChips(snapshot) {
  return snapshot.top3.map((item) => `<span class="predictchip r${item.rank}">${["◎", "○", "▲"][item.rank - 1] || "△"}${item.horse}</span>`).join("");
}

function saveCurrentPrediction() {
  const snapshot = buildPredictionSnapshot();
  if (!snapshot?.key) return;
  const predictions = loadSavedPredictions();
  predictions[snapshot.key] = snapshot;
  persistSavedPredictions(predictions);
  renderPredictionPanel("この端末に保存しました");
}

function renderPredictionPanel(message = "") {
  const panel = $("predictPanel");
  if (!panel) return;
  const currentRace = race();
  if (!currentRace) {
    panel.innerHTML = "";
    return;
  }

  const current = buildPredictionSnapshot();
  if (!current) {
    panel.innerHTML = "";
    return;
  }
  const saved = getSavedPrediction();

  panel.innerHTML = `
    <div class="predictcard">
      <div class="predictcard-head">
        <div>
          <div class="predictlabel">現在の予想</div>
          <div class="predictmeta">${scopeLabel(current.scope)} / ${formatWeights(current.weights)}</div>
        </div>
        <button class="saveprediction" id="savePredictionBtn">予想を保存</button>
      </div>
      <div class="predictchips">${renderPredictionChips(current)}</div>
      ${saved ? `
        <div class="savedprediction">
          <div class="savedprediction-head">保存済み予想 <span>${formatSavedAt(saved.savedAt)}</span></div>
          <div class="predictchips">${renderPredictionChips(saved)}</div>
          <div class="savedprediction-meta">${scopeLabel(saved.scope)} / ${formatWeights(saved.weights)}</div>
        </div>` : `
        <div class="savedprediction emptyhint">保存すると、アプリ改版後もこの端末に予想が残ります。</div>`}
      ${message ? `<div class="predictnotice">${message}</div>` : ""}
    </div>`;

  $("savePredictionBtn")?.addEventListener("click", saveCurrentPrediction);
}

function getInitialProfileId() {
  const queryUser = new URLSearchParams(window.location.search).get("user");
  if (getProfileById(queryUser)) return queryUser;
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (getProfileById(stored)) return stored;
  } catch {}
  return PROFILES[0].id;
}

function persistProfileId(id) {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, id);
  } catch {}
}

function syncProfileQuery(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("user", id);
  window.history.replaceState({}, "", url);
}

function getProfileById(id) {
  return PROFILES.find((profile) => profile.id === id) || null;
}

function fmtPctRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function scopeLabel(scopeKey = scope) {
  return scopeKey === "graded" ? "重賞のみ" : "一般も含む";
}

function normalizeWeights(weightSet) {
  return {
    place: weightSet.place ?? weightSet.wp ?? 0,
    jockey: weightSet.jockey ?? weightSet.wj ?? 0,
    time: weightSet.time ?? weightSet.wt ?? 0,
    parent: weightSet.parent ?? 0,
  };
}

function formatWeights(weightSet) {
  const n = normalizeWeights(weightSet);
  let s = `着順${f2(n.place)} / 騎手${f2(n.jockey)} / タイム${f2(n.time)}`;
  if (n.parent > 0) s += ` / 親${f2(n.parent)}`;
  return s;
}

function scoreEntry(entry, weightSet, scopeKey = scope) {
  const comp = entry?.[scopeKey];
  if (!comp) return Number.NEGATIVE_INFINITY;
  const n = normalizeWeights(weightSet);
  return n.place * comp.placeScore + n.jockey * comp.jockeyScore + n.time * comp.timeScore + n.parent * (comp.parentScore ?? 0.5);
}

function getRecommendationDayDates() {
  if (!DATA?.days?.length) return [];
  const finishedDates = DATA.days
    .filter((day) => day.races.some((race) => race.entries.some((entry) => entry.actualPlace != null)))
    .map((day) => day.date);
  if (!finishedDates.length) return [];
  const selectedDates = RECOMMENDATION_BASE_DATES.filter((date) => finishedDates.includes(date));
  const latestFinishedDate = finishedDates[finishedDates.length - 1];
  if (latestFinishedDate && !selectedDates.includes(latestFinishedDate)) selectedDates.push(latestFinishedDate);
  return selectedDates.length ? selectedDates : finishedDates.slice(-2);
}

function collectRecommendationRaces(dates) {
  if (!DATA?.days?.length || !dates.length) return [];
  const selected = new Set(dates);
  return DATA.days
    .filter((day) => selected.has(day.date))
    .flatMap((day) => day.races
      .filter((race) => [1, 2, 3].every((place) => race.entries.some((entry) => entry.actualPlace === place)))
      .map((race) => ({ date: day.date, race })));
}

function evaluateWeightSet(recommendationRaces, weightSet, scopeKey = scope) {
  const total = recommendationRaces.length;
  const normalized = normalizeWeights(weightSet);
  const rankTop3Counts = [0, 0, 0];
  const exactCounts = [0, 0, 0];
  let winnerInTop3Count = 0;
  let top3BoxCount = 0;

  for (const { race } of recommendationRaces) {
    const ranked = [...race.entries]
      .map((entry) => ({ entry, score: scoreEntry(entry, normalized, scopeKey) }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.entry);
    const predictedTop3 = ranked.slice(0, 3);
    const predictedHorses = predictedTop3.map((entry) => entry.horse);
    const actualTop3 = [1, 2, 3].map((place) => race.entries.find((entry) => entry.actualPlace === place)?.horse ?? null);

    predictedTop3.forEach((entry, index) => {
      if (entry.actualPlace != null && entry.actualPlace <= 3) rankTop3Counts[index] += 1;
      if (entry.actualPlace === index + 1) exactCounts[index] += 1;
    });
    if (actualTop3[0] && predictedHorses.includes(actualTop3[0])) winnerInTop3Count += 1;
    if (actualTop3.every((horse) => horse && predictedHorses.includes(horse))) top3BoxCount += 1;
  }

  return {
    weights: normalized,
    races: total,
    rankTop3Counts,
    exactCounts,
    winnerInTop3Count,
    top3BoxCount,
    rankTop3Rates: rankTop3Counts.map((count) => count / total),
    exactRates: exactCounts.map((count) => count / total),
    winnerInTop3Rate: winnerInTop3Count / total,
    top3BoxRate: top3BoxCount / total,
    score: rankTop3Counts[0] * 3 + rankTop3Counts[1] * 2 + rankTop3Counts[2],
  };
}

function compareRecommendationStats(a, b) {
  return (
    b.score - a.score ||
    b.exactCounts[0] - a.exactCounts[0] ||
    b.winnerInTop3Count - a.winnerInTop3Count ||
    b.top3BoxCount - a.top3BoxCount ||
    Math.max(a.weights.place, a.weights.jockey, a.weights.time, a.weights.parent ?? 0) - Math.max(b.weights.place, b.weights.jockey, b.weights.time, b.weights.parent ?? 0)
  );
}

function findRecommendedWeightSet(recommendationRaces, scopeKey = scope) {
  let best = null;
  for (let pi = 0; pi <= 20; pi++) {
    for (let ji = 0; ji <= 20 - pi; ji++) {
      for (let ti = 0; ti <= 20 - pi - ji; ti++) {
        const par = 20 - pi - ji - ti;
        const candidate = evaluateWeightSet(recommendationRaces, {
          place: pi / 20, jockey: ji / 20, time: ti / 20, parent: par / 20,
        }, scopeKey);
        if (!best || compareRecommendationStats(best, candidate) > 0) best = candidate;
      }
    }
  }
  return best;
}

function metricRows(stats) {
  return [
    ["予想1位が1着", fmtPctRate(stats.exactRates[0])],
    ["予想1位が3着内", fmtPctRate(stats.rankTop3Rates[0])],
    ["予想2位が3着内", fmtPctRate(stats.rankTop3Rates[1])],
    ["予想3位が3着内", fmtPctRate(stats.rankTop3Rates[2])],
    ["勝ち馬が予想TOP3に入る", fmtPctRate(stats.winnerInTop3Rate)],
    ["予想TOP3で3着内を全部拾う", fmtPctRate(stats.top3BoxRate)],
  ];
}

function renderRecommendationCard(title, stats, extraClass = "") {
  return `<div class="reco-card ${extraClass}">
    <div class="reco-card-head">
      <h3>${title}</h3>
      <div class="reco-weight">${formatWeights(stats.weights)}</div>
    </div>
    <div class="metriclist">
      ${metricRows(stats).map(([label, value]) => `<div class="metricrow"><span>${label}</span><b>${value}</b></div>`).join("")}
    </div>
  </div>`;
}

function openRecommendationPop() {
  if (!DATA) return;
  const dates = getRecommendationDayDates();
  const recommendationRaces = collectRecommendationRaces(dates);
  const dayLabel = dates.length ? dates.map(fmtD).join("・") : "対象日なし";

  if (!recommendationRaces.length) {
    $("pop").innerHTML = `
      <div class="ph">
        <span class="n">結果からのおすすめ重み</span>
        <button class="x" id="popx">×</button>
      </div>
      <div class="pc">
        <div class="sec hl">
          <h3>おすすめを作れませんでした</h3>
          <div class="fml">${dayLabel} の確定結果つきレースが不足しています。</div>
        </div>
      </div>`;
    $("popx").addEventListener("click", closePop);
    $("overlay").hidden = false;
    return;
  }

  const recommendationScope = "all";
  const recommended = findRecommendedWeightSet(recommendationRaces, recommendationScope);
  const current = evaluateWeightSet(recommendationRaces, weights, recommendationScope);
  const sameWeights = scope === recommendationScope && ["place", "jockey", "time", "parent"].every((key) => Math.abs((recommended.weights[key] ?? 0) - (current.weights[key] ?? 0)) < 0.001);

  $("pop").innerHTML = `
    <div class="ph">
      <span class="n">結果からのおすすめ重み</span>
      <button class="x" id="popx">×</button>
    </div>
    <div class="pc">
      <div class="sec hl">
        <h3>${dayLabel} の結果で分析</h3>
        <div class="fml">${scopeLabel(recommendationScope)} / ${recommendationRaces.length}レースを集計。予想1位〜3位が実際の3着内へどれだけ入ったかを基準に、おすすめ重みを選んでいます。</div>
        <div class="val">おすすめ: ${formatWeights(recommended.weights)}</div>
      </div>
      <div class="reco-grid">
        ${renderRecommendationCard("おすすめ", recommended, "recommended")}
        ${renderRecommendationCard("現在の設定", current)}
      </div>
      <div class="actionrow">
        <button class="applyreco" id="applyRecoBtn" ${sameWeights ? "disabled" : ""}>${sameWeights ? "この重みを使用中です" : "この重みを適用"}</button>
      </div>
    </div>`;

  $("popx").addEventListener("click", closePop);
  $("applyRecoBtn")?.addEventListener("click", () => {
    weights = { ...recommended.weights };
    scope = recommendationScope;
    syncScopeButtons();
    syncWeightControls();
    persistProfileState();
    if (DATA && race()) render();
    closePop();
  });
  $("overlay").hidden = false;
}

// ---- 最適重みづけ探索（着順:騎手:タイム:親 を5%刻みで全通り試す・1771通り） ----
function findBestWeights() {
  const currentRace = race();
  if (!currentRace) return null;
  const entries = currentRace.entries;
  const finished = entries.filter((e) => e.actualPlace != null);
  if (finished.length < 3) return null;
  const actual = [1, 2, 3].map((p) => finished.find((e) => e.actualPlace === p)?.horse ?? null);
  if (!actual[0]) return null;

  const best = [];
  for (let pi = 0; pi <= 20; pi++) {
    for (let ji = 0; ji <= 20 - pi; ji++) {
      for (let ti = 0; ti <= 20 - pi - ji; ti++) {
        const par = 20 - pi - ji - ti;
        const wp = pi / 20, wj = ji / 20, wt = ti / 20, wpar = par / 20;
        const ranked = [...entries]
          .map((e) => ({ h: e.horse, s: wp * e[scope].placeScore + wj * e[scope].jockeyScore + wt * e[scope].timeScore + wpar * (e[scope].parentScore ?? 0.5) }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.h);
        const hit = [0, 1, 2].map((i) => ranked[i] === actual[i]);
        const trio = actual.filter(Boolean).every((a) => ranked.slice(0, 3).includes(a));
        const n = hit.filter(Boolean).length;
        if (n > 0 || trio) best.push({ wp, wj, wt, wpar, hit, trio, n });
      }
    }
  }
  best.sort((a, b) => (b.trio ? 10 : 0) + b.n - (a.trio ? 10 : 0) - a.n);
  return { actual, best };
}

function openResultPop() {
  const currentRace = race();
  if (!currentRace) return;
  const entries = currentRace.entries;
  if (!entries.some((e) => e.actualPlace != null)) return;

  const res = findBestWeights();
  if (!res) return;
  const { actual, best } = res;

  // 現在の重みでの予測
  const cur = [...entries]
    .map((e) => ({ h: e.horse, s: weights.place * e[scope].placeScore + weights.jockey * e[scope].jockeyScore + weights.time * e[scope].timeScore + (weights.parent ?? 0) * (e[scope].parentScore ?? 0.5) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.h);
  const curHit = [0, 1, 2].map((i) => cur[i] === actual[i]);
  const curTrio = actual.filter(Boolean).every((a) => cur.slice(0, 3).includes(a));
  const curHitN = curHit.filter(Boolean).length;

  const wstr = (c) => `着順${f2(c.wp)} / 騎手${f2(c.wj)} / タイム${f2(c.wt)}${c.wpar > 0 ? ` / 親${f2(c.wpar)}` : ""}`;
  const hitLabel = (c) => {
    const parts = [c.hit[0] ? "1位" : "", c.hit[1] ? "2位" : "", c.hit[2] ? "3位" : ""].filter(Boolean);
    if (c.trio && !c.hit.every(Boolean)) parts.push("3連複");
    return parts.length ? parts.join("・") + "的中" : "–";
  };
  const curLabel = () => {
    const parts = [curHit[0] ? "1位" : "", curHit[1] ? "2位" : "", curHit[2] ? "3位" : ""].filter(Boolean);
    if (curTrio && !curHit.every(Boolean)) parts.push("3連複");
    return parts.length ? parts.join("・") + "的中" : "的中なし";
  };

  const trioCount = best.filter((b) => b.trio).length;
  const topN = best.slice(0, 8);
  const rowCls = (c) => c.trio ? "trio" : c.n >= 2 ? "hit2" : "hit1";

  $("pop").innerHTML = `
    <div class="ph">
      <span class="n">重みづけ別的中分析</span>
      <button class="x" id="popx">×</button>
    </div>
    <div class="pc">
      <div class="sec hl">
        <h3>実際の結果</h3>
        <div class="val">◎${actual[0] || "–"} &nbsp;○${actual[1] || "–"} &nbsp;▲${actual[2] || "–"}</div>
      </div>
      <div class="sec">
        <h3>現在の設定 &nbsp;<span style="font-weight:400;font-size:11px">${formatWeights(weights)}</span></h3>
        <div class="val ${curHitN > 0 ? "hit-ok" : ""}">${curLabel()}</div>
        <div class="fml" style="margin-top:4px">予測: ◎${cur[0] || "–"} &nbsp;○${cur[1] || "–"} &nbsp;▲${cur[2] || "–"}</div>
      </div>
      ${best.length > 0 ? `
      <div class="sec">
        <h3>的中できる重みづけ &nbsp;<span style="font-weight:400;font-size:11px">全${best.length}通り・うち3連複${trioCount}通り</span></h3>
        <table class="opttbl">
          <thead><tr><th>着順</th><th>騎手</th><th>タイム</th><th>親</th><th>的中</th></tr></thead>
          <tbody>${topN.map((c) => `<tr class="${rowCls(c)}">
            <td>${f2(c.wp)}</td><td>${f2(c.wj)}</td><td>${f2(c.wt)}</td><td>${c.wpar > 0 ? f2(c.wpar) : "–"}</td>
            <td>${hitLabel(c)}</td></tr>`).join("")}
          </tbody>
        </table>
        ${best.length > 8 ? `<div class="fml" style="text-align:center;margin-top:6px">上位8通りを表示</div>` : ""}
      </div>` : `<div class="sec"><div class="fml">いずれの重みづけでも的中できませんでした</div></div>`}
    </div>`;
  $("popx").addEventListener("click", closePop);
  $("overlay").hidden = false;
}

main();
