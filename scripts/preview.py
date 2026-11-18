"""Serve the site on localhost and reload its open tab after a site file changes."""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"
RELOAD = b"""<script>
let previous;
setInterval(async () => {
  try {
    const stamp = await (await fetch('/_preview_version', {cache: 'no-store'})).text();
    if (previous && previous !== stamp) location.reload();
    previous = stamp;
  } catch {}
}, 1200);
</script>"""


class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = self.path.partition("?")[0]
        if route == "/_preview_version":
            stamp = max((p.stat().st_mtime_ns for p in SITE.rglob("*") if p.is_file()), default=0)
            self.reply(str(stamp).encode(), "text/plain")
        elif route in ("/", "/index.html"):
            page = (SITE / "index.html").read_bytes().replace(b"</body>", RELOAD + b"</body>")
            self.reply(page, "text/html; charset=utf-8")
        else:
            super().do_GET()

    def reply(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    os.chdir(SITE)
    ThreadingHTTPServer(("127.0.0.1", 18764), Preview).serve_forever()
