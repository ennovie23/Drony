import errno
import json
import socket
import threading
import unittest
import urllib.error
import urllib.request

from live_stream import CaptureFlag, LatestFrame, PauseState, start_stream_server


class LiveStreamServerTest(unittest.TestCase):
    def setUp(self):
        self.latest = LatestFrame()
        self.capture = CaptureFlag()
        self.pause = PauseState()
        self.server = start_stream_server(0, self.latest, self.capture, self.pause)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def post_capture(self):
        req = urllib.request.Request(f"{self.base}/capture", data=b"", method="POST")
        return urllib.request.urlopen(req, timeout=5)

    def post(self, path):
        req = urllib.request.Request(f"{self.base}{path}", data=b"", method="POST")
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read())

    def status(self):
        with urllib.request.urlopen(f"{self.base}/status", timeout=5) as res:
            return json.loads(res.read())

    def test_pause_and_resume(self):
        self.assertEqual(self.status(), {"paused": False})
        self.assertEqual(self.post("/pause"), {"success": True, "paused": True})
        self.assertTrue(self.pause.paused)
        self.assertEqual(self.status(), {"paused": True})
        self.assertEqual(self.post("/resume"), {"success": True, "paused": False})
        self.assertFalse(self.pause.paused)

    def test_capture_sets_flag(self):
        with self.post_capture() as res:
            self.assertEqual(res.status, 200)
            self.assertTrue(json.loads(res.read())["success"])
        self.assertTrue(self.capture.consume())
        self.assertFalse(self.capture.consume())

    def test_stream_serves_latest_jpeg(self):
        self.latest.set(b"JPEGDATA")
        with urllib.request.urlopen(f"{self.base}/stream", timeout=5) as res:
            self.assertTrue(res.headers["Content-Type"].startswith("multipart/x-mixed-replace"))
            chunk = b""
            while b"JPEGDATA" not in chunk and len(chunk) < 4096:
                chunk += res.read(1)
            self.assertIn(b"JPEGDATA", chunk)

    def test_stream_ignores_query_string(self):
        self.latest.set(b"JPEGDATA")
        with urllib.request.urlopen(f"{self.base}/stream?attempt=3", timeout=5) as res:
            self.assertEqual(res.status, 200)
            self.assertTrue(res.headers["Content-Type"].startswith("multipart/x-mixed-replace"))

    def test_binds_to_localhost_only(self):
        # The stream is a live webcam: never expose it to the network
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_unknown_path_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(f"{self.base}/nope", timeout=5)
        ctx.exception.close()
        self.assertEqual(ctx.exception.code, 404)

    def test_cors_header_present(self):
        with self.post_capture() as res:
            self.assertEqual(res.headers["Access-Control-Allow-Origin"], "*")


if __name__ == "__main__":
    unittest.main()


class BindWhenFreeTest(unittest.TestCase):
    def hold_port(self):
        holder = socket.socket()
        holder.bind(("127.0.0.1", 0))
        holder.listen()
        return holder, holder.getsockname()[1]

    def test_waits_for_a_busy_port_to_free_up(self):
        holder, port = self.hold_port()
        threading.Timer(0.5, holder.close).start()
        server = start_stream_server(port, LatestFrame(), CaptureFlag(), bind_timeout_s=5)
        try:
            self.assertEqual(server.server_address[1], port)
        finally:
            server.shutdown()
            server.server_close()

    def test_gives_up_after_the_timeout(self):
        holder, port = self.hold_port()
        try:
            with self.assertRaises(OSError) as caught:
                start_stream_server(port, LatestFrame(), CaptureFlag(), bind_timeout_s=0.5)
            self.assertEqual(caught.exception.errno, errno.EADDRINUSE)
        finally:
            holder.close()
