import unittest

from stabilizer import PresenceVote, SeverityVote, filter_by_confidence, pad_box


def det(label, conf):
    return {"label": label, "conf": conf, "box": [0, 0, 10, 10]}


class FilterByConfidenceTest(unittest.TestCase):
    def test_keeps_fire_at_exact_threshold(self):
        self.assertEqual(len(filter_by_confidence([det("fire", 0.40)], 0.40, 0.35)), 1)

    def test_drops_fire_below_threshold(self):
        self.assertEqual(filter_by_confidence([det("fire", 0.39)], 0.40, 0.35), [])

    def test_smoke_uses_own_threshold(self):
        kept = filter_by_confidence([det("smoke", 0.36), det("fire", 0.36)], 0.40, 0.35)
        self.assertEqual([d["label"] for d in kept], ["smoke"])

    def test_other_labels_pass_through(self):
        self.assertEqual(len(filter_by_confidence([det("person", 0.01)], 0.4, 0.35)), 1)


class PresenceVoteTest(unittest.TestCase):
    def feed(self, vote, values):
        return [vote.update(v) for v in values]

    def test_vote_turns_on_at_kth_hit(self):
        vote = PresenceVote(3, 5)
        self.assertEqual(self.feed(vote, [True, True, True]), [False, False, True])

    def test_vote_warmup_counts_missing_as_false(self):
        vote = PresenceVote(3, 5)
        self.assertEqual(self.feed(vote, [True, False, True]), [False, False, False])

    def test_vote_turns_off_when_hits_drop_below_k(self):
        vote = PresenceVote(3, 5)
        self.assertEqual(self.feed(vote, [True, True, True, False, False]),
                         [False, False, True, True, True])
        self.assertFalse(vote.update(False))

    def test_vote_1_of_1_is_passthrough(self):
        vote = PresenceVote(1, 1)
        self.assertEqual(self.feed(vote, [True, False, True]), [True, False, True])


class SeverityVoteTest(unittest.TestCase):
    def feed(self, vote, labels):
        return [vote.update(label) for label in labels][-1]

    def test_majority_wins(self):
        self.assertEqual(self.feed(SeverityVote(3), ["Minor", "Severe", "Minor"]), "Minor")

    def test_tie_goes_to_most_recent(self):
        self.assertEqual(self.feed(SeverityVote(2), ["Minor", "Severe"]), "Severe")

    def test_window_drops_old_labels(self):
        self.assertEqual(self.feed(SeverityVote(3), ["Minor", "Minor", "Severe", "Severe"]), "Severe")

    def test_reset_clears_history(self):
        vote = SeverityVote(3)
        self.feed(vote, ["Minor", "Minor"])
        vote.reset()
        self.assertEqual(vote.update("Severe"), "Severe")


class PadBoxTest(unittest.TestCase):
    def test_pad_grows_each_side(self):
        self.assertEqual(pad_box([100, 100, 200, 150], 0.1, 640, 360), [90, 95, 210, 155])

    def test_pad_clamps_to_frame(self):
        self.assertEqual(pad_box([0, 0, 640, 360], 0.5, 640, 360), [0, 0, 640, 360])

    def test_pad_clamps_out_of_range_input(self):
        self.assertEqual(pad_box([-5, -3, 700, 400], 0, 640, 360), [0, 0, 640, 360])

    def test_zero_pad_returns_box(self):
        self.assertEqual(pad_box([10, 20, 30, 40], 0, 640, 360), [10, 20, 30, 40])


if __name__ == "__main__":
    unittest.main()
