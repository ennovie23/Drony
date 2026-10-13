import json
import unittest
import urllib.error
import urllib.request

from live_stream import CaptureFlag, LatestFrame, start_stream_server


class LiveStreamServerTest(unittest.TestCase):
    def setUp(self):
        self.latest = LatestFrame()
        self.capture = CaptureFlag()
        self.server = start_stream_server(0, self.latest, self.capture)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def post_capture(self):
        req = urllib.request.Request(f"{self.base}/capture", data=b"", method="POST")
        return urllib.request.urlopen(req, timeout=5)

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
