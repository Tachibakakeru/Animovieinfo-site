import {
  $,
  escapeHtml as esc,
  safeUrl,
  taipei,
  timeOf,
  countdown,
  fullMotion,
} from "./shared.js";
import { setupMap } from "./map.js?v=schedules-update";

let db,
  mapView,
  category = "now",
  lastDate = "",
  lastMinute = "",
  currentMovie;
const dialog = $("#detail");
const dates = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "long",
});
const poster = (m) =>
  '<img src="' +
  safeUrl(m.poster) +
  '" alt="' +
  esc(m.title) +
  ' 海報" loading="lazy">';
function status(m, day) {
  if (m.releaseDate > day) return "upcoming";
  if (db.sessions.some((s) => s.movieId === m.id && s.date >= day))
    return "now";
  if (m.releaseDate === day) return "now";
  return "past";
}
function renderFilms() {
  if (!db) return;
  const day = taipei().slice(0, 10);
  const list = db.movies.filter((m) => status(m, day) === category);
  const query = $("#filmSearch").value.trim().toLocaleLowerCase();
  const result = list.filter((m) =>
    (m.title + " " + (m.originalTitle || ""))
      .toLocaleLowerCase()
      .includes(query),
  );
  const popularity = (m) =>
    db.sessions.filter((s) => s.movieId === m.id && s.date >= day).length;
  result.sort((a, b) =>
    category === "now"
      ? popularity(b) - popularity(a) ||
        b.releaseDate.localeCompare(a.releaseDate)
      : a.releaseDate.localeCompare(b.releaseDate),
  );
  for (const [id, cat] of [
    ["now", "now"],
    ["up", "upcoming"],
  ]) {
    $("#" + id + "N").textContent = db.movies.filter(
      (m) => status(m, day) === cat,
    ).length;
    $("#" + id + "Tab").classList.toggle("selected", category === cat);
    $("#" + id + "Tab").setAttribute("aria-pressed", category === cat);
  }
  $("#filmMeta").textContent =
    "共 " +
    result.length +
    " 部電影" +
    (category === "now"
      ? "　／　依近期場次數排序"
      : "　／　依台灣上映日期排序");
  $("#cards").innerHTML =
    result
      .map(
        (m) =>
          '<button class="card" data-id="' +
          esc(m.id) +
          '"><span class="poster">' +
          poster(m) +
          '<span class="flag ' +
          category +
          '"><i></i>' +
          (category === "now" ? "上映中" : "即將上映") +
          '</span></span><span class="cardInfo"><strong>' +
          esc(m.title) +
          "</strong><small>" +
          esc(m.releaseDate.replaceAll("-", ".")) +
          " 上映</small>" +
          (category === "upcoming"
            ? '<span class="until" data-date="' +
              esc(m.releaseDate) +
              '"></span>'
            : "") +
          "</span></button>",
      )
      .join("") || '<p class="empty">目前沒有符合條件的電影。</p>';
  refreshCountdowns(Date.now());
}
function refreshCountdowns(now) {
  document.querySelectorAll(".until").forEach((el) => {
    el.textContent =
      el.dataset.date > taipei(now).slice(0, 10)
        ? "距上映 " + countdown(el.dataset.date, now)
        : "已到上映日";
  });
}
function openMovie(m) {
  currentMovie = m;
  const future = status(m, taipei().slice(0, 10)) === "upcoming";
  $("#detailBody").innerHTML =
    '<div class="detailGrid"><div class="detailPoster">' +
    poster(m) +
    '</div><article><p class="eyebrow"><i></i> FILM DETAILS</p><h2 id="detailTitle">' +
    esc(m.title) +
    '</h2><p class="original">' +
    esc(m.originalTitle || "") +
    '</p><p class="tags">' +
    m.genres.map((g) => "<span>" + esc(g) + "</span>").join("") +
    "</p><dl><dt>台灣上映</dt><dd>" +
    esc(m.releaseDate) +
    "</dd>" +
    (m.runtime ? "<dt>片長</dt><dd>" + esc(m.runtime) + " 分鐘</dd>" : "") +
    (m.director ? "<dt>導演</dt><dd>" + esc(m.director) + "</dd>" : "") +
    '</dl><p class="synopsis">' +
    esc(m.description) +
    "</p>" +
    (future
      ? '<p class="until" data-date="' +
        esc(m.releaseDate) +
        '"></p><small>依台北時間上映日零點計算</small>'
      : "") +
    '<p id="nextShow"></p><div class="detailLinks"><a class="primary" href="#map/' +
    encodeURIComponent(m.id) +
    '">查看電影場次 ↗</a><a href="' +
    safeUrl(m.sourceUrl) +
    '" target="_blank" rel="noopener">電影資料 ↗</a><a href="' +
    safeUrl(m.posterCreditUrl || m.posterSource) +
    '" target="_blank" rel="noopener">海報來源 ↗</a></div></article></div>';
  if (m.backdrop) {
    $("#detailBody article").insertAdjacentHTML(
      "beforeend",
      '<details class="still"><summary>電影劇照</summary><img loading="lazy" alt="' +
        esc(m.title) +
        ' 劇照" src="' +
        safeUrl(m.backdrop) +
        '"><a target="_blank" rel="noopener" href="' +
        safeUrl(m.backdropCreditUrl) +
        '">劇照來源 ↗</a></details>',
    );
  }
  dialog.setAttribute("aria-labelledby", "detailTitle");
  dialog.showModal();
  refreshCountdowns(Date.now());
  updateNextShow(Date.now());
}
function updateNextShow(now) {
  if (!dialog.open) return;
  const next = db.sessions
    .filter((s) => s.movieId === currentMovie.id && timeOf(s) >= now)
    .sort((a, b) => timeOf(a) - timeOf(b))[0];
  $("#nextShow").textContent = next
    ? "最近一場　" +
      next.date.slice(5).replace("-", "/") +
      " " +
      next.time +
      " · " +
      db.cinemas.find((c) => c.id === next.cinemaId).name
    : "目前尚無後續公開場次";
}
function flip(el, number) {
  const previous = el.dataset.n;
  if (previous === number) return;
  el.dataset.n = number;
  function face(cls, value) {
    const half = document.createElement("span");
    half.className = cls;
    half.dataset.value = value;
    return half;
  }
  const upper = face("clockFace", number);
  const lower = face("clockFace lower", number);
  el.replaceChildren(upper, lower);
  if (!previous || !fullMotion() || $("#films").hidden) return;
  lower.dataset.value = previous;
  const oldTop = face("flipTop", previous);
  const newBottom = face("flipBottom", number);
  el.append(oldTop, newBottom);
  newBottom.addEventListener(
    "animationend",
    () => {
      lower.dataset.value = number;
      oldTop.remove();
      newBottom.remove();
    },
    { once: true },
  );
}
function tick() {
  const now = Date.now(),
    local = taipei(now),
    day = local.slice(0, 10);
  const units = local.slice(11).split(":");
  document.querySelectorAll(".digits b").forEach((el, i) => flip(el, units[i]));
  $("#fullTime").textContent = local.replace("T", " ") + " UTC+8";
  $("#dateLine").textContent = dates.format(now);
  if ($("#mapClock"))
    $("#mapClock").textContent = local.replace("T", " ") + " UTC+8";
  if (day !== lastDate) {
    renderFilms();
    mapView?.rollDate(day);
    lastDate = day;
  }
  if (local.slice(0, 16) !== lastMinute) {
    mapView?.tick();
    updateNextShow(now);
    lastMinute = local.slice(0, 16);
  }
  refreshCountdowns(now);
}
const motionChoice = $("#motionChoice");
const systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
try {
  motionChoice.value = localStorage.getItem("animovie-motion") || "system";
} catch {}
function applyMotion() {
  const choice = motionChoice.value;
  document.documentElement.dataset.motion =
    choice === "system" ? (systemMotion.matches ? "reduced" : "full") : choice;
}
applyMotion();
systemMotion.addEventListener("change", applyMotion);
motionChoice.onchange = () => {
  applyMotion();
  try {
    localStorage.setItem("animovie-motion", motionChoice.value);
  } catch {}
};

$("#themeToggle").onclick = () => {
  const root = document.documentElement;
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = theme;
  try {
    localStorage.setItem("animovie-theme", theme);
  } catch {}
};

let routeId = 0,
  scrollId = 0;
async function glideTo(top) {
  const id = ++scrollId;
  const start = scrollY;
  const end = Math.max(
    0,
    Math.min(top, document.documentElement.scrollHeight - innerHeight),
  );
  if (!fullMotion() || Math.abs(end - start) < 2) {
    window.scrollTo({ top: end, behavior: "instant" });
    return;
  }
  const duration = Math.min(850, 420 + Math.abs(end - start) * 0.22);
  const begin = performance.now();
  await new Promise((resolve) => {
    function frame(now) {
      if (id !== scrollId) return resolve();
      const t = Math.min(1, (now - begin) / duration);
      const eased = t * t * (3 - 2 * t);
      window.scrollTo({
        top: start + (end - start) * eased,
        behavior: "instant",
      });
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
for (const evt of ["wheel", "touchstart", "pointerdown", "keydown"])
  window.addEventListener(
    evt,
    () => {
      scrollId++;
    },
    { passive: true },
  );
async function fade(el, enter, duration) {
  if (!fullMotion()) return;
  const frames = [
    { opacity: 0, transform: "translateY(6px)" },
    { opacity: 1, transform: "translateY(0)" },
  ];
  await el.animate(enter ? frames : frames.reverse(), {
    duration,
    easing: "ease-in-out",
  }).finished;
}
async function route(initial = false) {
  const token = ++routeId;
  const [page, id] = location.hash.slice(1).split("/");
  const mapping = page === "map";
  const before = $("#films").hidden ? $("#mapPage") : $("#films");
  const after = mapping ? $("#mapPage") : $("#films");
  const changing = before !== after;
  if (dialog.open) await closeDetail();
  if (token !== routeId) return;
  if (changing && !initial) {
    await glideTo(0);
    if (token !== routeId) return;
    await fade(before, false, 165);
    if (token !== routeId) return;
  }
  $("#films").hidden = mapping;
  $("#mapPage").hidden = !mapping;
  document.body.classList.toggle("mapView", mapping);
  $("#filmsNav").classList.toggle("active", !mapping);
  $("#mapNav").classList.toggle("active", mapping);
  if (mapping) mapView?.open(id);
  if (changing && !initial) fade(after, true, 320);
  const top =
    page === "collection"
      ? $("#collection").getBoundingClientRect().top + scrollY - 20
      : 0;
  if (initial) window.scrollTo({ top, behavior: "instant" });
  else await glideTo(top);
}
// pushState preserves the shareable hash without the browser jumping to the anchor first.
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (
    !link ||
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    e.shiftKey
  )
    return;
  if (!/^#(?:films|collection|map(?:\/[\w-]+)?)$/.test(link.hash)) return;
  e.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, "", link.hash);
  route();
});
history.scrollRestoration = "manual";
$("#cards").addEventListener("click", (e) => {
  const el = e.target.closest("[data-id]");
  if (el) openMovie(db.movies.find((m) => m.id === el.dataset.id));
});
let closingDetail;
function closeDetail() {
  if (!closingDetail)
    closingDetail = fade(dialog, false, 150).then(() => {
      dialog.close();
      closingDetail = null;
    });
  return closingDetail;
}
dialog.querySelector(".close").onclick = closeDetail;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDetail();
});
dialog.onclick = (e) => {
  if (e.target === dialog) closeDetail();
};
let categoryChange = 0;
async function switchCategory(next) {
  const token = ++categoryChange;
  if (next === category) return;
  const cards = $("#cards");
  await fade(cards, false, 145);
  if (token !== categoryChange) return;
  category = next;
  renderFilms();
  fade(cards, true, 270);
}
$("#nowTab").onclick = () => switchCategory("now");
$("#upTab").onclick = () => switchCategory("upcoming");
$("#filmSearch").oninput = renderFilms;
window.addEventListener("hashchange", () => route());
function scheduleTick() {
  tick();
  setTimeout(scheduleTick, 1000 - (Date.now() % 1000));
}
scheduleTick();
try {
  const response = await fetch("./data.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("data");
  db = await response.json();
  $("#dataStamp").textContent =
    "資料更新　" +
    taipei(Date.parse(db.updatedAt)).slice(0, 16).replace("T", " ") +
    "（UTC+8）";
  $("#sourceText").textContent =
    db.sourceName +
    "。本期收錄 " +
    db.cinemas.length +
    " 家影城的已公告場次，涵蓋範圍依來源公布進度變動。";
  mapView = setupMap(db);
  renderFilms();
  route(true);
} catch (error) {
  console.error(error);
  $("#filmMeta").textContent = "電影資料暫時無法載入，請重新整理。";
  $("#mapPage").textContent = "場次資料暫時無法載入，請重新整理。";
  route(true);
}
