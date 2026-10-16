import io
import os
import shutil
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout

import cv2
import numpy as np

from training.prepare_dfire import Expected, LabelError, main, prepare

FIRE = "1 0.5 0.5 0.2 0.2\n"   # D-Fire class 1 = fire
SMOKE = "0 0.5 0.5 0.2 0.2\n"  # D-Fire class 0 = smoke
SMALL = Expected(train=2, val=1, test=1, fire=2, smoke=1)
YAML = ("path: .\ntrain: images/train\nval: images/val\ntest: images/test\n"
        "names:\n  0: fire\n  1: smoke\n")


def jpeg():
    return cv2.imencode(".jpg", np.zeros((32, 32, 3), np.uint8))[1].tobytes()


def make_zips(tmp, train, test, lists, skip_label=()):
    images = os.path.join(tmp, "D-Fire.zip")
    with zipfile.ZipFile(images, "w") as z:
        for folder, items in (("train", train), ("test", test)):
            for stem, label in items.items():
                z.writestr(f"{folder}/images/{stem}.jpg", jpeg())
                if stem not in skip_label:
                    z.writestr(f"{folder}/labels/{stem}.txt", label)
    splits = os.path.join(tmp, "splits.zip")
    paths = {"train": "Data splitting/5-fold cross validation/dfire_train1.txt",
             "val": "Data splitting/5-fold cross validation/dfire_valid1.txt",
             "test": "Data splitting/dfire_test.txt"}
    with zipfile.ZipFile(splits, "w") as z:
        for split, names in lists.items():
            z.writestr(paths[split], "\n".join(f"{n}.jpg" for n in names) + "\n")
    return images, splits


class PrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.out = os.path.join(self.tmp, "out")
        os.makedirs(self.out)
        self.train = {"t1": FIRE, "t2": SMOKE, "t3": ""}
        self.test_items = {"s1": FIRE}
        self.lists = {"train": ["t1", "t2"], "val": ["t3"], "test": ["s1"]}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_prepare(self, expected=SMALL, **kwargs):
        images, splits = make_zips(self.tmp, self.train, self.test_items, self.lists,
                                   kwargs.pop("skip_label", ()))
        kwargs.setdefault("min_free_bytes", 0)
        kwargs.setdefault("preview_count", 3)
        return prepare(images, splits, self.out, expected, **kwargs)

    def path(self, *parts):
        return os.path.join(self.out, "D-Fire-drony", *parts)

    def test_writes_dataset_with_splits_and_swapped_labels(self):
        summary = self.run_prepare()
        self.assertEqual(summary["images"], {"train": 2, "val": 1, "test": 1})
        with open(self.path("labels", "train", "t1.txt")) as f:
            self.assertTrue(f.read().startswith("0 "))
        with open(self.path("labels", "val", "t3.txt")) as f:
            self.assertEqual(f.read(), "")
        self.assertTrue(os.path.exists(self.path("images", "test", "s1.jpg")))

    def test_writes_data_yaml(self):
        self.run_prepare()
        with open(self.path("data.yaml")) as f:
            self.assertEqual(f.read(), YAML)

    def test_dataset_zip_has_root_layout(self):
        summary = self.run_prepare()
        names = zipfile.ZipFile(summary["dataset_zip"]).namelist()
        self.assertIn("data.yaml", names)
        self.assertIn("images/train/t1.jpg", names)

    def test_writes_previews(self):
        summary = self.run_prepare(preview_count=2)
        previews = [f for f in os.listdir(summary["preview_dir"]) if f.startswith("preview_")]
        self.assertEqual(len(previews), 2)

    def test_count_mismatch_raises(self):
        with self.assertRaisesRegex(LabelError, "train"):
            self.run_prepare(Expected(3, 1, 1, 2, 1))

    def test_missing_label_file_raises(self):
        with self.assertRaisesRegex(LabelError, "t1.jpg"):
            self.run_prepare(skip_label=("t1",))

    def test_not_enough_space_raises_before_writing(self):
        with self.assertRaisesRegex(LabelError, "free"):
            self.run_prepare(min_free_bytes=10**18)
        self.assertFalse(os.path.exists(self.path()))

    def test_rerun_leaves_no_stale_files(self):
        self.train["t9"] = ""
        self.lists["train"].append("t9")
        self.run_prepare(Expected(3, 1, 1, 2, 1))
        del self.train["t9"]
        self.lists["train"].remove("t9")
        self.run_prepare()
        self.assertFalse(os.path.exists(self.path("images", "train", "t9.jpg")))

    def test_main_returns_1_and_prints_error(self):
        missing = os.path.join(self.tmp, "nope.zip")
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(["--images", missing, "--splits", missing]), 1)
        self.assertIn("Error:", out.getvalue())


if __name__ == "__main__":
    unittest.main()
