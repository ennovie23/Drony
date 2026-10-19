from collections import deque


def filter_by_confidence(detections, fire_min, smoke_min):
    """
    Drops fire and smoke detections below their own class threshold.
    Other labels pass through untouched; order is preserved.
    """
    minimums = {"fire": fire_min, "smoke": smoke_min}
    return [d for d in detections if d["conf"] >= minimums.get(d["label"], 0.0)]


class PresenceVote:
    """
    Confirms a class once it has been seen in at least k of the last n frames.
    Frames not yet seen (warm-up) count as misses.
    """

    def __init__(self, k, n):
        self.k = k
        self.history = deque(maxlen=n)

    def update(self, seen):
        self.history.append(bool(seen))
        return sum(self.history) >= self.k


class SeverityVote:
    """
    Smooths severity labels: returns the most common label of the last n,
    breaking ties in favour of the label seen most recently.
    """

    def __init__(self, n):
        self.history = deque(maxlen=n)

    def update(self, label):
        self.history.append(label)
        counts = {}
        last_seen = {}
        for i, item in enumerate(self.history):
            counts[item] = counts.get(item, 0) + 1
            last_seen[item] = i
        return max(counts, key=lambda item: (counts[item], last_seen[item]))

    def reset(self):
        self.history.clear()


def pad_box(box, fraction, width, height):
    """
    Grows [x1, y1, x2, y2] by `fraction` of its size on every side,
    clamped to the frame.
    """
    x1, y1, x2, y2 = box
    pad_x = (x2 - x1) * fraction
    pad_y = (y2 - y1) * fraction
    return [
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(width, x2 + pad_x),
        min(height, y2 + pad_y),
    ]
