import json
import threading
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


def start_stream_server(port, latest, capture):
    """Serves GET /stream (MJPEG) and POST /capture on a daemon thread."""

    class Handler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_POST(self):
            if urlsplit(self.path).path != "/capture":
                self.send_error(404)
                return
            capture.request()
            body = json.dumps({"success": True}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            # Clients add ?attempt=N to bust the cache when reconnecting
            if urlsplit(self.path).path != "/stream":
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
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
