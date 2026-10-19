import threading
import time


class FrameGrabber:
    """
    Reads a capture source on its own thread so the live stream runs at camera
    speed while the (slower) models analyse whichever frame is newest.
    `on_frame` is called with every frame read (e.g. to publish it to the stream).
    """

    def __init__(self, cap, on_frame=None, max_failures=30, retry_delay=0.1):
        self.cap = cap
        self.on_frame = on_frame
        self.max_failures = max_failures
        self.retry_delay = retry_delay
        self.lost = False
        self._cond = threading.Condition()
        self._frame = None
        self._version = 0
        self._running = False
        self._thread = None

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
        with self._cond:
            self._cond.notify_all()

    def wait_newer(self, last_version, timeout):
        """Blocks until a frame newer than `last_version` exists (or timeout/lost)."""
        with self._cond:
            self._cond.wait_for(lambda: self._version > last_version or self.lost, timeout)
            return self._version, self._frame

    def _run(self):
        failures = 0
        while self._running:
            ok, frame = self.cap.read()
            if not ok:
                # Webcams occasionally drop a frame; give up after a run of failures
                failures += 1
                if failures >= self.max_failures:
                    with self._cond:
                        self.lost = True
                        self._cond.notify_all()
                    return
                time.sleep(self.retry_delay)
                continue
            failures = 0
            if self.on_frame:
                self.on_frame(frame)
            with self._cond:
                self._frame = frame
                self._version += 1
                self._cond.notify_all()
