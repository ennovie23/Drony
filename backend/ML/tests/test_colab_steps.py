import os
import shutil
import tempfile
import unittest

import torch

from training.colab_steps import mark_finished, missing_inputs, run_state


def touch(*parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").close()


def save_last(run_dir, epoch):
    """A checkpoint like Ultralytics saves: 0-based epoch, -1 once training finished."""
    os.makedirs(os.path.join(run_dir, "weights"), exist_ok=True)
    torch.save({"epoch": epoch}, os.path.join(run_dir, "weights", "last.pt"))


class RunStateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.run = os.path.join(self.tmp, "A")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_new_when_no_last_pt(self):
        self.assertEqual(run_state(self.run, 30), "new")

    def test_resume_when_last_pt_unfinished(self):
        save_last(self.run, 4)
        self.assertEqual(run_state(self.run, 30), "resume")

    def test_done_when_last_epoch_saved(self):
        save_last(self.run, 29)
        self.assertEqual(run_state(self.run, 30), "done")

    def test_done_when_training_finished_but_not_marked(self):
        # Early stop at epoch 22, then a disconnect before the notebook marked it finished
        save_last(self.run, -1)
        self.assertEqual(run_state(self.run, 30), "done")

    def test_done_when_marked_finished(self):
        save_last(self.run, 11)
        touch(self.run, "weights", "best.pt")
        mark_finished(self.run)
        self.assertEqual(run_state(self.run, 30), "done")


class MissingInputsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_missing_inputs_lists_in_order(self):
        self.assertEqual(missing_inputs(self.tmp), ["D-Fire-drony.zip", "best.pt", "training/compare.py"])

    def test_missing_inputs_empty_when_all_present(self):
        for parts in (("D-Fire-drony.zip",), ("best.pt",), ("training", "compare.py")):
            touch(self.tmp, *parts)
        self.assertEqual(missing_inputs(self.tmp), [])


if __name__ == "__main__":
    unittest.main()
