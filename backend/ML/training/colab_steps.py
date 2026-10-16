"""
colab_steps.py
Small helpers the Colab notebook uses to check its inputs and to resume or
skip training runs after a disconnect.
"""
import os

REQUIRED_INPUTS = ["D-Fire-drony.zip", "best.pt", "training/compare.py"]


def missing_inputs(drive_dir):
    """Files the notebook needs in MyDrive/drony that are not there yet."""
    return [name for name in REQUIRED_INPUTS if not os.path.exists(os.path.join(drive_dir, name))]


def mark_finished(run_dir):
    """Records that training returned normally (early stopping included)."""
    with open(os.path.join(run_dir, "finished"), "w") as f:
        f.write("done\n")


def run_state(run_dir, epochs):
    """
    "new" when the run never saved a checkpoint, "done" when every epoch was
    logged or the notebook marked it finished, otherwise "resume".
    """
    if not os.path.exists(os.path.join(run_dir, "weights", "last.pt")):
        return "new"
    if (os.path.exists(os.path.join(run_dir, "finished"))
            and os.path.exists(os.path.join(run_dir, "weights", "best.pt"))):
        return "done"
    results = os.path.join(run_dir, "results.csv")
    if os.path.exists(results):
        with open(results) as f:
            logged = sum(1 for line in f if line.strip()) - 1  # minus the header
        if logged >= epochs:
            return "done"
    return "resume"
