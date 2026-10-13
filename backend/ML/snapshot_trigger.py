import time


class SnapshotTrigger:
    """
    Decides when a frame should be saved as a snapshot: automatically on
    fire/smoke (at most once per cooldown) or on a manual capture request.
    """

    def __init__(self, cooldown_s, clock=time.monotonic):
        self.cooldown_s = cooldown_s
        self.clock = clock
        self.last_auto = None

    def check(self, fire, smoke, manual):
        if manual:
            return "manual"
        if not (fire or smoke):
            return None
        now = self.clock()
        if self.last_auto is not None and now - self.last_auto < self.cooldown_s:
            return None
        self.last_auto = now
        return "auto"
