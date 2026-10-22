import unittest

from camera_wait import open_when_available


class FakeCapture:
    def __init__(self, opened):
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def release(self):
        self.released = True


class OpenWhenAvailableTest(unittest.TestCase):
    def test_returns_at_once_when_camera_present(self):
        cap = FakeCapture(True)
        sleeps = []
        self.assertIs(open_when_available(lambda: cap, sleep=sleeps.append), cap)
        self.assertEqual(sleeps, [])

    def test_retries_until_plugged_in(self):
        attempts = [FakeCapture(False), FakeCapture(False), FakeCapture(True)]
        tries = iter(attempts)
        sleeps = []
        cap = open_when_available(lambda: next(tries), retry_s=3.0, sleep=sleeps.append)
        self.assertIs(cap, attempts[2])
        self.assertEqual(sleeps, [3.0, 3.0])
        self.assertTrue(attempts[0].released and attempts[1].released)
        self.assertFalse(attempts[2].released)

    def test_announces_waiting_once(self):
        tries = iter([FakeCapture(False), FakeCapture(False), FakeCapture(True)])
        waiting = []
        open_when_available(lambda: next(tries), sleep=lambda s: None, on_waiting=lambda: waiting.append(1))
        self.assertEqual(waiting, [1])


if __name__ == "__main__":
    unittest.main()
