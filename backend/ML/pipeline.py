from dataclasses import dataclass


def _setting(env, name, default, cast, check, range_text):
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = cast(raw.strip())
    except ValueError:
        raise ValueError(f"{name} must be {range_text} (got {raw!r})") from None
    if not check(value):
        raise ValueError(f"{name} must be {range_text} (got {raw!r})")
    return value


@dataclass(frozen=True)
class PipelineSettings:
    """Tuning for FramePipeline; see backend/.env for the variables."""

    fire_conf_min: float
    smoke_conf_min: float
    vote_k: int
    vote_n: int
    severity_window: int
    crop_pad: float
    detect_imgsz: int

    @classmethod
    def from_env(cls, env):
        vote_n = _setting(env, "VOTE_N", 5, int, lambda v: v >= 1, "an integer >= 1")
        return cls(
            fire_conf_min=_setting(env, "FIRE_CONF_MIN", 0.40, float,
                                   lambda v: 0 < v <= 1, "a number in (0, 1]"),
            smoke_conf_min=_setting(env, "SMOKE_CONF_MIN", 0.35, float,
                                    lambda v: 0 < v <= 1, "a number in (0, 1]"),
            vote_k=_setting(env, "VOTE_K", 3, int, lambda v: 1 <= v <= vote_n,
                            f"an integer from 1 to VOTE_N ({vote_n})"),
            vote_n=vote_n,
            severity_window=_setting(env, "SEVERITY_WINDOW", 9, int,
                                     lambda v: v >= 1, "an integer >= 1"),
            crop_pad=_setting(env, "CROP_PAD", 0.15, float,
                              lambda v: 0 <= v <= 1, "a number in [0, 1]"),
            detect_imgsz=_setting(env, "DETECT_IMGSZ", 640, int,
                                  lambda v: v >= 320 and v % 32 == 0,
                                  "an integer >= 320 and a multiple of 32"),
        )

    @classmethod
    def baseline(cls):
        """The behaviour before stabilization: every raw detection counts."""
        return cls(0.25, 0.25, 1, 1, 1, 0.0, 640)
