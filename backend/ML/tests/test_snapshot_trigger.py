import unittest

from snapshot_trigger import SnapshotTrigger


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class SnapshotTriggerTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.trigger = SnapshotTrigger(5, clock=self.clock)

    def test_first_detection_fires(self):
        self.assertEqual(self.trigger.check(True, False, False), "auto")

    def test_auto_respects_cooldown(self):
        self.assertEqual(self.trigger.check(True, False, False), "auto")
        self.clock.t = 4.9
        self.assertIsNone(self.trigger.check(True, False, False))
        self.clock.t = 5.0
        self.assertEqual(self.trigger.check(True, False, False), "auto")

    def test_no_detection_no_snapshot(self):
        self.assertIsNone(self.trigger.check(False, False, False))

    def test_manual_bypasses_cooldown(self):
        self.assertEqual(self.trigger.check(True, False, False), "auto")
        self.clock.t = 1
        self.assertEqual(self.trigger.check(False, False, True), "manual")
        self.clock.t = 2
        self.assertIsNone(self.trigger.check(True, False, False))

    def test_smoke_only_triggers(self):
        self.assertEqual(self.trigger.check(False, True, False), "auto")


if __name__ == "__main__":
    unittest.main()
