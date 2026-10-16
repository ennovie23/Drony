import unittest

from pipeline import PipelineSettings


class PipelineSettingsTest(unittest.TestCase):
    def test_defaults_when_env_empty(self):
        self.assertEqual(PipelineSettings.from_env({}),
                         PipelineSettings(0.40, 0.35, 3, 5, 9, 0.15, 640))

    def test_overrides_are_parsed(self):
        s = PipelineSettings.from_env({"FIRE_CONF_MIN": "0.5", "VOTE_K": "2",
                                       "VOTE_N": "4", "DETECT_IMGSZ": "960"})
        self.assertEqual((s.fire_conf_min, s.vote_k, s.vote_n, s.detect_imgsz), (0.5, 2, 4, 960))

    def test_whitespace_stripped_and_empty_means_default(self):
        s = PipelineSettings.from_env({"FIRE_CONF_MIN": " 0.5 ", "VOTE_K": ""})
        self.assertEqual((s.fire_conf_min, s.vote_k), (0.5, 3))

    def test_baseline_values(self):
        self.assertEqual(PipelineSettings.baseline(),
                         PipelineSettings(0.25, 0.25, 1, 1, 1, 0.0, 640))

    def test_invalid_values_raise_with_name(self):
        cases = [("FIRE_CONF_MIN", "0"), ("FIRE_CONF_MIN", "1.5"), ("SMOKE_CONF_MIN", "abc"),
                 ("VOTE_K", "0"), ("VOTE_N", "0"), ("VOTE_K", "2.5"), ("SEVERITY_WINDOW", "0"),
                 ("CROP_PAD", "-0.1"), ("CROP_PAD", "1.1"), ("DETECT_IMGSZ", "500"),
                 ("DETECT_IMGSZ", "288")]
        for var, value in cases:
            with self.subTest(var=var, value=value):
                with self.assertRaisesRegex(ValueError, var):
                    PipelineSettings.from_env({var: value})

    def test_k_greater_than_n_raises(self):
        with self.assertRaisesRegex(ValueError, "VOTE_K"):
            PipelineSettings.from_env({"VOTE_K": "6", "VOTE_N": "5"})


if __name__ == "__main__":
    unittest.main()
