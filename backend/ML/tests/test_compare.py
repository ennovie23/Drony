import unittest

from training.compare import pick_winner


def row(name, imgsz, p, r, m50=0.5):
    return {"name": name, "imgsz": imgsz, "precision": p, "recall": r, "map50": m50,
            "map50_95": 0.3, "ms_per_image": 5.0}


class PickWinnerTest(unittest.TestCase):
    def test_picks_highest_recall_within_precision_budget(self):
        rows = [row("old", 640, .77, .66), row("A", 640, .76, .72), row("B", 640, .80, .70)]
        self.assertEqual(pick_winner(rows), ("A", 640))

    def test_rejects_precision_drop_over_002(self):
        self.assertIsNone(pick_winner([row("old", 640, .77, .66), row("A", 640, .74, .90)]))

    def test_compares_against_old_at_same_size(self):
        rows = [row("old", 640, .77, .66), row("old", 960, .70, .75), row("A", 960, .69, .80)]
        self.assertEqual(pick_winner(rows), ("A", 960))

    def test_tie_goes_to_map50(self):
        rows = [row("old", 640, .77, .66), row("A", 640, .77, .70, .60), row("B", 640, .77, .70, .65)]
        self.assertEqual(pick_winner(rows), ("B", 640))

    def test_none_when_no_candidate_beats_old_recall(self):
        self.assertIsNone(pick_winner([row("old", 640, .77, .66), row("A", 640, .78, .60)]))

    def test_missing_old_row_raises(self):
        with self.assertRaises(ValueError):
            pick_winner([row("old", 640, .77, .66), row("A", 960, .8, .8)])


if __name__ == "__main__":
    unittest.main()
