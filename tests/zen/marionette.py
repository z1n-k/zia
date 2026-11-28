"""A small Marionette client (Python's standard library only): starts Zen on the harness's
throwaway profile and runs scripts in the browser window's own (chrome) context."""

import json
import os
import socket
import subprocess
import time

# (ZIA_ZEN=<folder holding Zen.app>: another Zen, say a new release downloaded to test before
# it's installed)
# On Windows (GitHub's Windows runners, ci/setup-windows.sh) ZIA_ZEN is the folder holding zen.exe.
if os.name == "nt":
    ZEN = os.path.join(os.environ["ZIA_ZEN"], "zen.exe")
else:
    ZEN = os.path.join(os.environ.get("ZIA_ZEN") or "/Applications", "Zen.app/Contents/MacOS/zen")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Zen:
    def __init__(self, profile, headless=True):
        # (a port of its own, so it never meets another Zen's, or one still closing down)
        self.port = free_port()
        with open(os.path.join(profile, "user.js"), "a") as prefs:
            prefs.write(f'user_pref("marionette.port", {self.port});\n')
        args = [ZEN, "-no-remote", "-profile", profile, "-marionette", "-remote-allow-system-access"]
        if headless:
            args.append("-headless")
        env = dict(os.environ, MOZ_MARIONETTE="1", MOZ_REMOTE_ALLOW_SYSTEM_ACCESS="1")
        self.process = subprocess.Popen(args, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.sock = self._connect()
        self.next_id = 0
        self._read()  # Marionette's hello
        self.command("WebDriver:NewSession", {"capabilities": {}})
        self.command("Marionette:SetContext", {"value": "chrome"})

    def _connect(self, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            try:
                return socket.create_connection(("127.0.0.1", self.port), timeout=120)
            except OSError:
                if self.process.poll() is not None:
                    raise RuntimeError("Zen quit before Marionette started")
                time.sleep(0.5)
        raise RuntimeError("Marionette didn't start")

    def _read(self):
        length = b""
        while not length.endswith(b":"):
            chunk = self.sock.recv(1)
            if not chunk:
                raise RuntimeError("Marionette closed the connection")
            length += chunk
        size = int(length[:-1])
        body = b""
        while len(body) < size:
            body += self.sock.recv(size - len(body))
        return json.loads(body)

    def command(self, name, params=None):
        self.next_id += 1
        data = json.dumps([0, self.next_id, name, params or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b":" + data)
        while True:
            reply = self._read()
            if reply[0] == 1 and reply[1] == self.next_id:
                if reply[2]:
                    raise RuntimeError(f"{name}: {reply[2].get('message', reply[2])}")
                return reply[3]

    def run(self, script, *args, timeout=60):
        """Runs an async script in the browser window: it ends by calling the last argument."""
        self.command("WebDriver:SetTimeouts", {"script": timeout * 1000})
        reply = self.command("WebDriver:ExecuteAsyncScript", {"script": script, "args": list(args)})
        return reply.get("value")

    def quit(self):
        try:
            self.command("Marionette:Quit", {"flags": ["eForceQuit"]})
        except Exception:
            pass
        try:
            self.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.process.kill()
