import {
  $,
  escapeHtml as esc,
  safeUrl,
  taipei,
  pad,
  timeOf,
  fullMotion,
} from "./shared.js";

function projection(version = "") {
  const label = version.normalize("NFKC").toUpperCase();
  const system = label.match(
    /IMAX|4DX|MX4D|LUXE|TITAN|DVA|SCREENX|INFINITY VISION|B\.O\.X|MUCROWN|GOLD CLASS|皇家廳|標準廳|沙發版|ATMOS/,
  )?.[0];
  const dimension = label.match(/(?<![\dA-Z])[23]D(?![\dA-Z])/)?.[0];
  return [system, dimension].filter(Boolean).join(" ") ||
    (label.includes("數位") ? "數位" : "規格未公布");
}

export function setupMap(db) {
  const theaters = new Map(db.cinemas.map((c) => [c.id, c]));
  const films = new Map(db.movies.map((m) => [m.id, m]));
  const page = $("#mapPage");
  const blank = () => ({
    movie: "",
    from: 0,
    period: "全天",
    live: false,
    city: "",
    brand: "",
    version: "",
    query: "",
  });
  let state = blank(),
    today = taipei().slice(0, 10),
    day = today,
    map,
    layer,
    visibleGroups = [],
    activeCinema = "";
  const pins = new Map();
  const facets = { city: "縣市", version: "放映規格", brand: "品牌" };
  const formats = new Map(db.sessions.map((s) => [s, projection(s.version)]));
  page.innerHTML =
    '<div class="mapHeading"><h1>電影場次地圖</h1></div><div class="mapShell"><aside class="filterPane"><div class="paneHead"><h2>篩選場次</h2><button id="clear">重設</button></div><fieldset><legend>放映日期</legend><div id="dayBtns" class="chips"></div></fieldset><label class="field">電影<select id="pickFilm"></select></label><fieldset><legend>開始時間 <output id="fromValue">00:00 起</output></legend><input type="range" id="from" aria-label="場次開始時間" min="0" max="1439" step="1" value="0"><button class="liveToggle" id="liveTime" aria-pressed="false">從現在起</button></fieldset><fieldset><legend>快速時段</legend><div id="periods" class="chips"></div></fieldset><div id="facets"></div></aside><section class="theaters"><div class="paneHead"><h2>影城列表</h2><small id="matchSummary"></small></div><div id="results"></div></section><section class="mapBox" aria-label="影城地圖"><label class="mapSearch search"><span aria-hidden="true">⌕</span><input type="search" id="findCinema" aria-label="搜尋影城、品牌、縣市" placeholder="搜尋影城、品牌、縣市"></label><div id="tiles" aria-label="臺灣影城互動地圖"></div><button id="fit" title="顯示符合條件的所有影城">⌖ 全部影城</button><div class="mapNotice" hidden></div></section></div><p class="mapNote"><time id="mapClock"></time>　數位或特殊廳的 2D／3D 以影城公告為準。點選場次查看來源。</p>';
  const dates = () =>
    [
      ...new Set([
        today,
        ...[-1, 1].map((d) =>
          new Date(Date.parse(today + "T12:00:00Z") + d * 86400000)
            .toISOString()
            .slice(0, 10),
        ),
        ...db.sessions.map((s) => s.date),
      ]),
    ].sort();
  function btn(type, value, label, on) {
    return (
      '<button data-filter="' +
      type +
      '" data-value="' +
      esc(value) +
      '" aria-pressed="' +
      on +
      '" class="' +
      (on ? "chosen" : "") +
      '">' +
      label +
      "</button>"
    );
  }
  const norm = (s) => s.toLowerCase().replaceAll("台", "臺");
  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  function matches(s, ignore = "") {
    const c = theaters.get(s.cinemaId),
      minute = minutes(s.time);
    if (
      !c ||
      s.date !== day ||
      (ignore !== "movie" && state.movie && s.movieId !== state.movie) ||
      minute < state.from
    )
      return false;
    const period = minute < 720 ? "上午" : minute < 1080 ? "下午" : "晚上";
    if (state.period !== "全天" && state.period !== period) return false;
    if (state.live && timeOf(s) < Date.now()) return false;
    if (
      state.query &&
      !norm([c.name, c.brand, c.city].join(" ")).includes(norm(state.query))
    )
      return false;
    return Object.keys(facets).every(
      (key) =>
        key === ignore ||
        !state[key] ||
        state[key] === (key === "version" ? formats.get(s) : c[key]),
    );
  }
  function render(fit = true) {
    const sessions = db.sessions.filter((s) => matches(s));
    const grouped = new Map();
    sessions.forEach((s) => {
      if (!grouped.has(s.cinemaId)) grouped.set(s.cinemaId, []);
      grouped.get(s.cinemaId).push(s);
    });
    visibleGroups = [...grouped]
      .map(([id, rows]) => ({
        c: theaters.get(id),
        rows: rows.sort((a, b) => a.time.localeCompare(b.time)),
      }))
      .sort((a, b) => a.rows[0].time.localeCompare(b.rows[0].time));
    if (!grouped.has(activeCinema)) activeCinema = "";
    $("#dayBtns").innerHTML = dates()
      .map((d) =>
        btn(
          "day",
          d,
          (d === today
            ? "今天 "
            : d ===
                new Date(Date.parse(today + "T12:00Z") + 86400000)
                  .toISOString()
                  .slice(0, 10)
              ? "明天 "
              : "") + d.slice(5).replace("-", "/"),
          day === d,
        ),
      )
      .join("");
    const filmCount = new Map();
    db.sessions
      .filter((s) => s.date === day)
      .forEach((s) =>
        filmCount.set(s.movieId, 1 + (filmCount.get(s.movieId) || 0)),
      );
    $("#pickFilm").innerHTML =
      '<option value="">全部電影（' +
      [...filmCount.values()].reduce((a, b) => a + b, 0) +
      " 場）</option>" +
      db.movies
        .filter((m) => filmCount.has(m.id) || m.id === state.movie)
        .map(
          (m) =>
            '<option value="' +
            esc(m.id) +
            '">' +
            esc(m.title) +
            "（" +
            (filmCount.get(m.id) || 0) +
            "）</option>",
        )
        .join("");
    $("#pickFilm").value = state.movie;
    $("#periods").innerHTML = ["全天", "上午", "下午", "晚上"]
      .map((v) => btn("period", v, v, state.period === v))
      .join("");
    $("#liveTime").hidden = day !== today;
    $("#liveTime").setAttribute("aria-pressed", state.live);
    const start = state.live ? minutes(taipei().slice(11, 16)) : state.from;
    $("#from").value = start;
    $("#fromValue").textContent =
      pad(Math.floor(start / 60)) + ":" + pad(start % 60) + " 起";
    $("#facets").innerHTML = Object.entries(facets)
      .map(([key, label]) => {
        const counts = new Map();
        db.sessions
          .filter((s) => matches(s, key))
          .forEach((s) => {
            const val =
              key === "version" ? formats.get(s) : theaters.get(s.cinemaId)[key];
            counts.set(val, (counts.get(val) || 0) + 1);
          });
        if (state[key] && !counts.has(state[key])) counts.set(state[key], 0);
        return (
          "<fieldset><legend>" +
          label +
          '</legend><div class="chips">' +
          [...counts]
            .sort((a, b) => b[1] - a[1])
            .map(([val, n]) =>
              btn(
                key,
                val,
                esc(val) + " <small>" + n + "</small>",
                state[key] === val,
              ),
            )
            .join("") +
          (counts.size ? "" : "<small>無符合項目</small>") +
          "</div></fieldset>"
        );
      })
      .join("");
    $("#matchSummary").textContent =
      grouped.size + " 家 · " + sessions.length + " 場";
    $("#results").innerHTML =
      visibleGroups
        .map(
          ({ c, rows }) =>
            '<article class="venue" data-venue="' +
            esc(c.id) +
            '"><button class="venueName" data-focus="' +
            esc(c.id) +
            '">' +
            esc(c.name) +
            " <small>" +
            esc(c.city) +
            '</small></button><div class="times">' +
            rows
              .map(
                (s) => {
                  const title = films.get(s.movieId).title;
                  const format = formats.get(s);
                  const version = s.version && s.version !== "版本未標示" ? s.version : "";
                  const label = format === "規格未公布" && version
                    ? format + " · " + version
                    : version || format;
                  return (
                    '<a class="showTime" href="' +
                    safeUrl(s.sourceUrl) +
                    '" target="_blank" rel="noopener" data-when="' +
                    timeOf(s) +
                    '" title="' +
                    esc(title + " · " + label + " · 查閱場次來源") +
                    '"><b>' +
                    esc(s.time) +
                    "</b>" +
                    (state.movie ? "" : '<small>' + esc(title) + "</small>") +
                    '<small class="showFormat">' + esc(label) + "</small></a>"
                  );
                },
              )
              .join("") +
            "</div></article>",
        )
        .join("") || '<p class="empty">這組條件尚無公開場次。</p>';
    $("#findCinema").value = state.query;
    tick();
    drawPins();
    if (fit) {
      if (fullMotion())
        $("#results").animate([{ opacity: 0.38 }, { opacity: 1 }], {
          duration: 260,
          easing: "ease-out",
        });
      fitPins();
    }
  }
  function tick() {
    page
      .querySelectorAll("[data-when]")
      .forEach((el) =>
        el.classList.toggle("elapsed", Number(el.dataset.when) < Date.now()),
      );
  }
  const coords = (c) => Number.isFinite(c.lat) && Number.isFinite(c.lng);
  function fitPins() {
    if (!map || page.hidden) return;
    const points = visibleGroups
      .filter((g) => coords(g.c))
      .map((g) => [g.c.lat, g.c.lng]);
    if (points.length)
      map.flyToBounds(L.latLngBounds(points), {
        padding: [32, 44],
        maxZoom: 13,
        animate: fullMotion(),
        duration: 0.58,
      });
    else
      map.flyTo([23.7, 120.95], 7, { animate: fullMotion(), duration: 0.58 });
  }
  function drawPins() {
    if (!map) return;
    layer.clearLayers();
    pins.clear();
    // Group close markers in screen pixels, recomputing at each zoom level.
    const clusters = [];
    for (const { c, rows } of visibleGroups.filter((g) => coords(g.c))) {
      const pt = L.latLng(c.lat, c.lng),
        px = map.project(pt);
      const group = clusters.find(
        (g) => g.px.distanceTo(px) < 34 && map.getZoom() < 15,
      );
      if (group) group.items.push({ c, rows });
      else clusters.push({ px, pt, items: [{ c, rows }] });
    }
    clusters.forEach(({ pt, items }) => {
      const grouped = items.length > 1,
        { c, rows } = items[0];
      const marker = L.marker(pt, {
        icon: L.divIcon({
          className: "venuePin",
          html: "<span>" + (grouped ? items.length : "●") + "</span>",
          iconSize: [30, 30],
          iconAnchor: [15, 28],
        }),
        title: grouped ? items.length + " 家影城" : c.name,
      }).addTo(layer);
      if (grouped)
        marker.on("click", () =>
          map.flyTo(pt, map.getZoom() + 2, {
            animate: fullMotion(),
            duration: 0.5,
          }),
        );
      else {
        marker.getElement()?.setAttribute("aria-label", c.name);
        marker.bindPopup(
          "<strong>" +
            esc(c.name) +
            "</strong><br>" +
            esc(c.address || c.city) +
            "<br>" +
            rows.length +
            " 場放映",
        );
        marker.on("click", () => {
          activeCinema = c.id;
          highlight(true);
        });
        pins.set(c.id, marker);
      }
    });
  }
  function highlight(scroll = false) {
    page.querySelectorAll(".venue").forEach((el) => {
      el.classList.toggle("focused", el.dataset.venue === activeCinema);
      if (scroll && el.dataset.venue === activeCinema)
        el.scrollIntoView({
          block: "nearest",
          behavior: fullMotion() ? "smooth" : "instant",
        });
    });
  }
  function initMap() {
    if (map) return;
    if (!window.L) {
      $(".mapNotice").hidden = false;
      $(".mapNotice").textContent = "地圖元件未載入，仍可使用影城列表。";
      return;
    }
    map = L.map("tiles", { scrollWheelZoom: false }).setView([23.7, 120.95], 7);
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(map);
    tiles.on("tileerror", () => {
      $(".mapNotice").hidden = false;
      $(".mapNotice").textContent =
        "部分底圖暫時無法載入，可點選影城標記或列表。";
    });
    tiles.on("tileload", () => {
      $(".mapNotice").hidden = true;
    });
    layer = L.layerGroup().addTo(map);
    map.on("zoomend", drawPins);
  }
  $("#pickFilm").onchange = (e) => {
    state.movie = e.target.value;
    render();
  };
  $("#liveTime").onclick = () => {
    state.live = !state.live;
    state.from = 0;
    render();
  };
  $("#from").oninput = (e) => {
    state.live = false;
    state.from = Number(e.target.value);
    render();
  };
  $("#findCinema").oninput = (e) => {
    state.query = e.target.value.trim();
    render();
  };
  $("#clear").onclick = () => {
    state = blank();
    day = today;
    render();
  };
  $("#fit").onclick = fitPins;
  page.addEventListener("click", (e) => {
    const button = e.target.closest("[data-filter]");
    if (button) {
      const { filter: key, value } = button.dataset;
      if (key === "day") {
        day = value;
        state.live = false;
      } else state[key] = key === "period" || state[key] !== value ? value : "";
      render();
      return;
    }
    const focus = e.target.closest("[data-focus]");
    if (focus) {
      activeCinema = focus.dataset.focus;
      highlight();
      const c = theaters.get(activeCinema);
      if (map && coords(c)) {
        map.stop();
        const target = L.latLng(c.lat, c.lng);
        const showPopup = () => {
          if (activeCinema === c.id) pins.get(c.id)?.openPopup();
        };
        if (map.getZoom() === 15 && map.getCenter().equals(target, 0.00001))
          showPopup();
        else {
          map.once("moveend", showPopup);
          map.flyTo(target, 15, { animate: fullMotion(), duration: 0.7 });
        }
      }
    }
  });
  return {
    open(id) {
      if (id && films.has(id)) {
        state = blank();
        state.movie = id;
        const next = db.sessions
          .filter((s) => s.movieId === id && timeOf(s) >= Date.now())
          .sort((a, b) => timeOf(a) - timeOf(b))[0];
        day = next?.date || today;
      } else {
        state.movie = "";
      }
      initMap();
      map?.invalidateSize();
      render();
    },
    tick() {
      if (state.live && !page.hidden) render(false);
      else tick();
    },
    rollDate(next) {
      if (day === today) day = next;
      today = next;
      if (!page.hidden) render();
    },
  };
}
