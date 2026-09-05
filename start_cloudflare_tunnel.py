#!/usr/bin/env python3
"""
Stable Cloudflare Tunnel Launcher for Sharda Gurukul Attendance System
Provides permanent, rock-solid HTTPS connection via Cloudflare Edge Network.
"""

import subprocess
import re
import time
import sys
import os

CLOUDFLARED_BIN = "/Users/gobindattri/.gemini/antigravity-ide/scratch/cloudflared"
TUNNEL_FILE = os.path.join(os.path.dirname(__file__), "public_url.txt")

def start_cloudflare_tunnel():
    cmd = [
        CLOUDFLARED_BIN,
        "tunnel",
        "--url", "http://localhost:3000",
        "--no-autoupdate"
    ]
    
    print("Launching Cloudflare Tunnel to http://localhost:3000...")
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    url_found = False
    for line in iter(process.stdout.readline, ''):
        print(line, end='', flush=True)
        # Match https://*.trycloudflare.com
        match = re.search(r'(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)', line)
        if match:
            public_url = match.group(1)
            print("\n" + "="*70)
            print("🎉 ROCK-SOLID CLOUDFLARE PUBLIC HTTPS URL IS LIVE:")
            print(f"👉 {public_url}")
            print("="*70 + "\n", flush=True)
            with open(TUNNEL_FILE, "w") as f:
                f.write(public_url + "\n")
            url_found = True

    process.wait()

if __name__ == "__main__":
    while True:
        try:
            start_cloudflare_tunnel()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            print(f"Cloudflare Tunnel disconnected ({e}). Reconnecting in 3s...", flush=True)
            time.sleep(3)
