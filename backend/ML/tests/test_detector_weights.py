import os
import shutil
import tempfile
import unittest

from pipeline import detector_weights_path


class DetectorWeightsPathTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        for name in ("best.pt", "best_v2.pt"):
            open(os.path.join(self.tmp, name), "w").close()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_default_is_best_pt(self):
        self.assertEqual(detector_weights_path({}, self.tmp), os.path.join(self.tmp, "best.pt"))

    def test_env_override_stripped(self):
        self.assertEqual(detector_weights_path({"DETECTOR_WEIGHTS": " best_v2.pt "}, self.tmp),
                         os.path.join(self.tmp, "best_v2.pt"))

    def test_empty_value_means_default(self):
        self.assertEqual(detector_weights_path({"DETECTOR_WEIGHTS": ""}, self.tmp),
                         os.path.join(self.tmp, "best.pt"))

    def test_cli_override_wins(self):
        self.assertEqual(detector_weights_path({"DETECTOR_WEIGHTS": "best.pt"}, self.tmp, "best_v2.pt"),
                         os.path.join(self.tmp, "best_v2.pt"))

    def test_missing_file_raises_with_name(self):
        with self.assertRaisesRegex(ValueError, "nope.pt"):
            detector_weights_path({"DETECTOR_WEIGHTS": "nope.pt"}, self.tmp)


if __name__ == "__main__":
    unittest.main()
