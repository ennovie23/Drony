import errno
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class LatestFrame:
    """Holds the newest JPEG frame and wakes stream clients when it changes."""

    def __init__(self):
        self._cond = threading.Condition()
        self._jpeg = None
        self._version = 0

    def set(self, jpeg):
        with self._cond:
            self._jpeg = jpeg
            self._version += 1
            self._cond.notify_all()

    def wait_newer(self, last_version, timeout):
        with self._cond:
            self._cond.wait_for(lambda: self._version > last_version, timeout)
            return self._version, self._jpeg


class CaptureFlag:
    """Thread-safe one-shot flag set by POST /capture, consumed by the detection loop."""

    def __init__(self):
        self._event = threading.Event()

    def request(self):
        self._event.set()

    def consume(self):
        if self._event.is_set():
            self._event.clear()
            return True
        return False


class PauseState:
    """Thread-safe pause switch set by POST /pause and /resume; the detection loop
    skips analysis while it is on."""

    def __init__(self):
        self._event = threading.Event()

    def pause(self):
        self._event.set()

    def resume(self):
        self._event.clear()

    @property
    def paused(self):
        return self._event.is_set()


def bind_when_free(make_server, port, timeout_s=15.0, interval_s=0.25):
    """
    Calls make_server() until the port is free. When the backend restarts, it starts a
    new detect.py while the old one is still exiting and holding the port; waiting a
    few seconds beats crashing into the backend's restart backoff.
    """
    deadline = time.monotonic() + timeout_s
    waited = False
    while True:
        try:
            return make_server()
        except OSError as err:
            if err.errno != errno.EADDRINUSE or time.monotonic() >= deadline:
                raise
            if not waited:
                print(f"Stream port {port} still in use (previous detector exiting?); waiting...", flush=True)
                waited = True
            time.sleep(interval_s)


def start_stream_server(port, latest, capture, pause=None, bind_timeout_s=15.0):
    """Serves GET /stream (MJPEG), GET /status, and POST /capture, /pause, /resume
    on a daemon thread."""
    pause = pause or PauseState()

    class Handler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _json(self, payload):
            body = json.dumps(payload).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            actions = {"/capture": capture.request, "/pause": pause.pause, "/resume": pause.resume}
            action = actions.get(urlsplit(self.path).path)
            if action is None:
                self.send_error(404)
                return
            action()
            self._json({"success": True, "paused": pause.paused})

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/status":
                self._json({"paused": pause.paused})
                return
            # Clients add ?attempt=N to bust the cache when reconnecting
            if path != "/stream":
                self.send_error(404)
                return
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            version = 0
            try:
                while True:
                    new_version, jpeg = latest.wait_newer(version, timeout=1.0)
                    if new_version == version or jpeg is None:
                        continue
                    version = new_version
                    self.wfile.write(
                        b"--frame\r\nContent-Type: image/jpeg\r\n"
                        + f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
                        + jpeg
                        + b"\r\n"
                    )
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

        def log_message(self, format, *args):
            pass  # keep detect.py output readable

    # Localhost only: this is a live webcam feed, not something to share on the LAN
    server = bind_when_free(lambda: ThreadingHTTPServer(("127.0.0.1", port), Handler), port, bind_timeout_s)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
