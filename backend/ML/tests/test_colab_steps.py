import os
import shutil
import tempfile
import unittest

from training.colab_steps import mark_finished, missing_inputs, run_state


def touch(*parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").close()


def write_results(run_dir, rows):
    with open(os.path.join(run_dir, "results.csv"), "w") as f:
        f.write("epoch,metrics\n" + "".join(f"{i},0\n" for i in range(1, rows + 1)))


class RunStateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.run = os.path.join(self.tmp, "A")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_new_when_no_last_pt(self):
        self.assertEqual(run_state(self.run, 30), "new")

    def test_resume_when_last_pt_unfinished(self):
        touch(self.run, "weights", "last.pt")
        write_results(self.run, 5)
        self.assertEqual(run_state(self.run, 30), "resume")

    def test_done_when_all_epochs_logged(self):
        touch(self.run, "weights", "last.pt")
        write_results(self.run, 30)
        self.assertEqual(run_state(self.run, 30), "done")

    def test_done_when_marked_finished(self):
        touch(self.run, "weights", "last.pt")
        touch(self.run, "weights", "best.pt")
        write_results(self.run, 12)
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
