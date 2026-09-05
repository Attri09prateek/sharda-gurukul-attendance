#!/usr/bin/env python3
"""
Public Tunnel Launcher for Sharda Gurukul Attendance System
Establishes a secure, public HTTPS tunnel using localhost.run SSH tunnel
"""

import subprocess
import re
import time
import sys
import os

TUNNEL_FILE = os.path.join(os.path.dirname(__file__), "public_url.txt")

def start_tunnel():
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-R", "80:localhost:3000",
        "nokey@localhost.run"
    ]
    
    print("Starting public HTTPS tunnel to localhost:3000...")
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    
    for line in iter(process.stdout.readline, ''):
        print(line, end='', flush=True)
        match = re.search(r'(https://[a-zA-Z0-9\-]+\.(?:lhr\.life|localhost\.run))', line)
        if match:
            public_url = match.group(1)
            print("\n" + "="*70)
            print(f"🎉 PUBLIC ACCESS URL IS LIVE:")
            print(f"👉 {public_url}")
            print("="*70 + "\n", flush=True)
            with open(TUNNEL_FILE, "w") as f:
                f.write(public_url + "\n")

    process.wait()

if __name__ == "__main__":
    while True:
        try:
            start_tunnel()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            print(f"Tunnel disconnected ({e}). Reconnecting in 5s...", flush=True)
            time.sleep(5)
