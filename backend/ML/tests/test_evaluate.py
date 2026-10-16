import dataclasses
import unittest

from evaluate import main, needs_separate_pass, summarize
from pipeline import PipelineSettings


def p(fire, smoke=False, sev=None):
    return {"fireDetected": fire, "smokeDetected": smoke, "fireSeverity": sev}


class SummarizeTest(unittest.TestCase):
    def test_summarize_rates(self):
        s = summarize([p(True), p(True), p(False), p(False, True)])
        self.assertEqual((s["frames"], s["fire_pct"], s["smoke_pct"]), (4, 50.0, 25.0))

    def test_summarize_flickers_count_true_to_false(self):
        s = summarize([p(True, False), p(False, True), p(True, False), p(False, False)])
        self.assertEqual(s["flickers"], 3)

    def test_summarize_sev_changes_only_while_fire(self):
        s = summarize([p(True, sev="Minor"), p(True, sev="Severe"), p(False),
                       p(True, sev="Minor"), p(True, sev="Minor")])
        self.assertEqual(s["sev_changes"], 1)

    def test_summarize_empty(self):
        self.assertEqual(summarize([]), {"frames": 0, "fire_pct": 0.0, "smoke_pct": 0.0,
                                         "flickers": 0, "sev_changes": 0})


class SeparatePassTest(unittest.TestCase):
    def test_shared_pass_when_stabilized_is_stricter(self):
        self.assertFalse(needs_separate_pass(PipelineSettings.baseline(), PipelineSettings.from_env({})))

    def test_separate_pass_for_other_imgsz(self):
        stab = PipelineSettings.from_env({"DETECT_IMGSZ": "960"})
        self.assertTrue(needs_separate_pass(PipelineSettings.baseline(), stab))

    def test_separate_pass_when_threshold_below_baseline(self):
        stab = dataclasses.replace(PipelineSettings.from_env({}), fire_conf_min=0.15)
        self.assertTrue(needs_separate_pass(PipelineSettings.baseline(), stab))


class MainTest(unittest.TestCase):
    def test_main_returns_1_when_no_video_opens(self):
        def no_models():
            raise AssertionError("models must not load when no video opens")
        self.assertEqual(main(["does_not_exist.mp4"], load_models=no_models), 1)


if __name__ == "__main__":
    unittest.main()
