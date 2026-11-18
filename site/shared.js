export const $ = (selector) => document.querySelector(selector);
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function safeUrl(value) {
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:"].includes(url.protocol)
      ? escapeHtml(url.href)
      : "";
  } catch {
    return "";
  }
}
export const pad = (n) => String(n).padStart(2, "0");
export function taipei(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 19);
}
export const timeOf = (s) => Date.parse(s.date + "T" + s.time + ":00+08:00");
export function countdown(date, now) {
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(date + "T00:00:00+08:00") - now) / 1000),
  );
  return (
    Math.floor(seconds / 86400) +
    " 天 " +
    [
      Math.floor(seconds / 3600) % 24,
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ]
      .map(pad)
      .join(":")
  );
}

export const fullMotion = () =>
  document.documentElement.dataset.motion === "full";
