import unittest

import numpy as np

from pipeline import FramePipeline, PipelineSettings
from temporal_behavior import TemporalGrowthClassifier
from threat_fusion import calculate_urgency_score

W, H = 640, 360


def F(conf=0.9, box=(100, 100, 200, 200)):
    return {"label": "fire", "conf": conf, "box": list(box)}


def S(conf=0.9, box=(300, 50, 400, 150)):
    return {"label": "smoke", "conf": conf, "box": list(box)}


class FakeClassify:
    def __init__(self, labels=("Moderate",)):
        self.labels = list(labels)
        self.calls = 0
        self.shapes = []

    def __call__(self, crop):
        self.shapes.append(crop.shape)
        label = self.labels[min(self.calls, len(self.labels) - 1)]
        self.calls += 1
        return label, 0.8


def run(frames, settings=None, classify=None):
    pipeline = FramePipeline(None, classify or FakeClassify(),
                             settings or PipelineSettings.from_env({}), W, H)
    frame = np.zeros((H, W, 3), np.uint8)
    return [pipeline.analyze(frame, dets, i + 1, "t") for i, dets in enumerate(frames)]


class FramePipelineTest(unittest.TestCase):
    def test_single_frame_flicker_not_reported(self):
        payloads = run([[F()], [], [], []])
        self.assertEqual([p["fireDetected"] for p in payloads], [False] * 4)
        self.assertTrue(all(p["boxes"] == [] for p in payloads))

    def test_steady_fire_confirmed_on_third_frame(self):
        payloads = run([[F()]] * 3)
        self.assertEqual([p["fireDetected"] for p in payloads], [False, False, True])
        self.assertEqual([b["label"] for b in payloads[2]["boxes"]], ["fire"])

    def test_low_confidence_fire_ignored(self):
        payloads = run([[F(0.39)]] * 5)
        self.assertFalse(any(p["fireDetected"] for p in payloads))

    def test_missed_frame_holds_last_box(self):
        last = run([[F()], [F()], [F()], []])[-1]
        self.assertTrue(last["fireDetected"])
        self.assertEqual(last["fireConfidence"], 90.0)
        self.assertEqual(last["boxes"][0]["id"], "fire_0")

    def test_severity_is_voted(self):
        classify = FakeClassify(["Minor", "Minor", "Severe", "Minor"])
        payloads = run([[F()]] * 6, classify=classify)
        self.assertEqual([p["fireSeverity"] for p in payloads[2:]], ["Minor"] * 4)

    def test_severity_resets_after_fire_lost(self):
        classify = FakeClassify(["Minor"] * 3 + ["Severe"] * 3)
        payloads = run([[F()]] * 5 + [[]] * 5 + [[F()]] * 3, classify=classify)
        self.assertEqual(payloads[-1]["fireSeverity"], "Severe")

    def test_severity_crop_is_padded(self):
        classify = FakeClassify()
        run([[F()]] * 3, classify=classify)
        self.assertEqual(classify.shapes[0], (130, 130, 3))

    def test_box_out_of_frame_does_not_crash(self):
        classify = FakeClassify()
        payloads = run([[F(box=(-20, -10, 700, 400))]] * 3, classify=classify)
        self.assertTrue(payloads[-1]["fireDetected"])
        self.assertEqual(classify.shapes[0], (360, 640, 3))

    def test_strongest_fire_box_drives_confidence(self):
        frame = [F(0.5, (0, 0, 10, 10)), F(0.95, (100, 100, 200, 200))]
        last = run([frame] * 3)[-1]
        self.assertEqual(last["fireConfidence"], 95.0)
        self.assertEqual(len(last["boxes"]), 2)

    def test_fire_takes_precedence_with_smoke(self):
        last = run([[F(), S()]] * 3)[-1]
        self.assertTrue(last["fireDetected"] and last["smokeDetected"])
        self.assertEqual({b["label"] for b in last["boxes"]}, {"fire", "smoke"})
        tracker = TemporalGrowthClassifier(window_size=15)
        for _ in range(3):
            behavior = tracker.update_and_evaluate([{"class": "fire", "box": F()["box"]},
                                                    {"class": "smoke", "box": S()["box"]}])
        expected = calculate_urgency_score(
            detection={"severity": last["fireSeverity"], "confidence": 90.0, "box": F()["box"]},
            behavior=behavior["fire_behavior"])
        self.assertEqual(last["threatScore"], expected)

    def test_baseline_matches_raw_per_frame(self):
        payloads = run([[F(0.3)], [], [S(0.26)], [F(0.24)]], settings=PipelineSettings.baseline())
        self.assertEqual([p["fireDetected"] for p in payloads], [True, False, False, False])
        self.assertEqual([p["smokeDetected"] for p in payloads], [False, False, True, False])
        self.assertEqual([len(p["boxes"]) for p in payloads], [1, 0, 1, 0])


class FakeBox:
    def __init__(self, xyxy, cls, conf):
        self.xyxy = np.array([xyxy], dtype=float)
        self.cls = np.array([cls])
        self.conf = np.array([conf])


class FakeResult:
    def __init__(self, boxes):
        self.boxes = boxes


class FakeDetector:
    names = {0: "fire", 1: "smoke"}

    def __init__(self, test):
        self.test = test

    def __call__(self, frame, conf, imgsz, verbose):
        self.test.assertEqual((conf, imgsz, verbose), (0.35, 640, False))
        return [FakeResult([FakeBox([1, 2, 3, 4], 0, 0.8)])]


class RunDetectorTest(unittest.TestCase):
    def test_run_detector_converts_results(self):
        pipeline = FramePipeline(FakeDetector(self), FakeClassify(),
                                 PipelineSettings.from_env({}), W, H)
        dets = pipeline.run_detector(np.zeros((H, W, 3), np.uint8))
        self.assertEqual(len(dets), 1)
        self.assertEqual(dets[0]["label"], "fire")
        self.assertAlmostEqual(dets[0]["conf"], 0.8)
        self.assertEqual(dets[0]["box"], [1.0, 2.0, 3.0, 4.0])


if __name__ == "__main__":
    unittest.main()
