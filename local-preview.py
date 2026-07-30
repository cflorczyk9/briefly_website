#!/usr/bin/env python3
"""Local preview for brieflywealth.com that behaves like Netlify.

Run:  python3 local-preview.py
Open: http://localhost:8888

Serves clean URLs (/download -> download.html), applies the 301 rules
from _redirects (so /context-graph lands on /knowledge-base exactly like
it will live), and serves index.html at /. Stop with Ctrl+C.
This file is a dev tool only. Leave it out of the push, or delete it.
"""
import http.server
import os
import socketserver

PORT = 8888
ROOT = os.path.dirname(os.path.abspath(__file__))

redirects = {}
with open(os.path.join(ROOT, "_redirects")) as f:
    for line in f:
        parts = line.split()
        if len(parts) >= 3 and parts[2].startswith("301"):
            redirects[parts[0]] = parts[1]


class NetlifyishHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if path in redirects:
            self.send_response(301)
            self.send_header("Location", redirects[path])
            self.end_headers()
            return
        if path != "/":
            stripped = path.rstrip("/")
            candidate = os.path.join(ROOT, stripped.lstrip("/"))
            if os.path.exists(candidate + ".html"):
                self.path = stripped + ".html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), NetlifyishHandler) as httpd:
    print(f"Briefly preview running at http://localhost:{PORT}  (Ctrl+C to stop)")
    httpd.serve_forever()
