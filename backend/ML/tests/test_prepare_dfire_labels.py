import unittest

from training.prepare_dfire import LabelError, assign_splits, rewrite_label


class RewriteLabelTest(unittest.TestCase):
    def test_swaps_smoke_to_1_and_fire_to_0(self):
        self.assertEqual(
            rewrite_label("0 0.5 0.5 0.2 0.2\n1 0.3 0.3 0.1 0.1\n", "a.txt"),
            ("1 0.500000 0.500000 0.200000 0.200000\n0 0.300000 0.300000 0.100000 0.100000\n", 0, 0))

    def test_empty_label_stays_empty(self):
        self.assertEqual(rewrite_label("", "a.txt"), ("", 0, 0))

    def test_tolerates_blank_lines_spaces_crlf(self):
        self.assertEqual(rewrite_label("\r\n0 0.5 0.5 0.2 0.2  \r\n\r\n", "a.txt")[0],
                         "1 0.500000 0.500000 0.200000 0.200000\n")

    def test_clips_box_past_right_edge(self):
        self.assertEqual(rewrite_label("1 0.95 0.5 0.2 0.2\n", "a.txt"),
                         ("0 0.925000 0.500000 0.150000 0.200000\n", 1, 0))

    def test_drops_box_fully_outside(self):
        self.assertEqual(rewrite_label("1 1.2 0.5 0.1 0.1\n", "a.txt"), ("", 0, 1))

    def test_bad_lines_raise_with_file_and_line(self):
        for text in ["0 0.5 0.5 0.2\n", "2 0.5 0.5 0.2 0.2\n", "0 a 0.5 0.2 0.2\n"]:
            with self.subTest(text=text):
                with self.assertRaisesRegex(LabelError, r"a\.txt.*line 1"):
                    rewrite_label(text, "a.txt")


class AssignSplitsTest(unittest.TestCase):
    lists = {"train": {"a.jpg"}, "val": {"b.jpg"}, "test": {"c.jpg"}}

    def test_assigns_each_image_to_its_list(self):
        self.assertEqual(assign_splits({"a.jpg", "b.jpg", "c.jpg"}, self.lists),
                         {"a.jpg": "train", "b.jpg": "val", "c.jpg": "test"})

    def test_listed_image_missing_raises(self):
        with self.assertRaisesRegex(LabelError, "c.jpg"):
            assign_splits({"a.jpg", "b.jpg"}, self.lists)

    def test_unlisted_image_raises(self):
        with self.assertRaisesRegex(LabelError, "d.jpg"):
            assign_splits({"a.jpg", "b.jpg", "c.jpg", "d.jpg"}, self.lists)

    def test_image_in_two_lists_raises(self):
        with self.assertRaisesRegex(LabelError, "a.jpg"):
            assign_splits({"a.jpg", "b.jpg", "c.jpg"}, {**self.lists, "val": {"a.jpg", "b.jpg"}})


if __name__ == "__main__":
    unittest.main()
