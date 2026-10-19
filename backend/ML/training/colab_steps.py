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
    "new" when the run never saved a checkpoint, "done" when training finished,
    otherwise "resume". Ultralytics stores the 0-based epoch in last.pt and sets it
    to -1 once training ends (early stopping included), so a run that finished but
    disconnected before the notebook marked it is still seen as done.
    """
    last = os.path.join(run_dir, "weights", "last.pt")
    if not os.path.exists(last):
        return "new"
    if (os.path.exists(os.path.join(run_dir, "finished"))
            and os.path.exists(os.path.join(run_dir, "weights", "best.pt"))):
        return "done"
    import torch

    epoch = torch.load(last, map_location="cpu", weights_only=False).get("epoch", -1)
    return "done" if epoch == -1 or epoch >= epochs - 1 else "resume"
