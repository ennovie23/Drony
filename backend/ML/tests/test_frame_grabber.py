import threading
import time
import unittest

from frame_grabber import FrameGrabber


class FakeCapture:
    """Yields numbered frames; `fail_after` makes every later read fail."""

    def __init__(self, fail_after=None, delay=0.001):
        self.n = 0
        self.fail_after = fail_after
        self.delay = delay
        self.lock = threading.Lock()

    def read(self):
        time.sleep(self.delay)
        with self.lock:
            self.n += 1
            if self.fail_after is not None and self.n > self.fail_after:
                return False, None
            return True, self.n


def wait_until(predicate, timeout=2.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.005)
    return False


class FrameGrabberTest(unittest.TestCase):
    def test_publishes_every_frame_and_keeps_latest(self):
        published = []
        grabber = FrameGrabber(FakeCapture(), on_frame=published.append)
        grabber.start()
        try:
            self.assertTrue(wait_until(lambda: len(published) >= 20))
            version, frame = grabber.wait_newer(0, timeout=1.0)
            self.assertGreater(version, 0)
            self.assertIsNotNone(frame)
        finally:
            grabber.stop()

    def test_wait_newer_returns_a_newer_frame(self):
        grabber = FrameGrabber(FakeCapture())
        grabber.start()
        try:
            v1, f1 = grabber.wait_newer(0, timeout=1.0)
            v2, f2 = grabber.wait_newer(v1, timeout=1.0)
            self.assertGreater(v2, v1)
            self.assertGreater(f2, f1)
        finally:
            grabber.stop()

    def test_reader_never_waits_for_a_slow_consumer(self):
        # The consumer (the model) is slow; the camera keeps being read meanwhile
        published = []
        grabber = FrameGrabber(FakeCapture(), on_frame=published.append)
        grabber.start()
        try:
            v1, _ = grabber.wait_newer(0, timeout=1.0)
            time.sleep(0.2)  # "inference"
            v2, _ = grabber.wait_newer(v1, timeout=1.0)
            self.assertGreater(v2 - v1, 5)
        finally:
            grabber.stop()

    def test_marks_lost_after_consecutive_failures(self):
        grabber = FrameGrabber(FakeCapture(fail_after=3), max_failures=5, retry_delay=0.001)
        grabber.start()
        try:
            self.assertTrue(wait_until(lambda: grabber.lost))
        finally:
            grabber.stop()


if __name__ == "__main__":
    unittest.main()
