#!/usr/bin/env python3
"""
FastClockWeb - Local HTTP Static Server
Launches a simple web server to view FastClockWeb in any browser.
"""

import http.server
import socketserver
import os
import sys
import webbrowser

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Disable caching for instant updates
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    # Allow address reuse
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            url = f"http://localhost:{port}"
            print("=" * 60)
            print(f"🚂 FastClockWeb server running at: {url}")
            print(f"Serving files from: {DIRECTORY}")
            print("Press Ctrl+C to stop.")
            print("=" * 60)
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48: # Address already in use
            print(f"Port {port} is currently in use. Trying port {port + 1}...")
            sys.argv = [sys.argv[0], str(port + 1)]
            main()
        else:
            raise

if __name__ == "__main__":
    main()
