import time


def open_when_available(open_capture, retry_s=3.0, sleep=time.sleep, on_waiting=None):
    """
    Opens the camera, retrying every `retry_s` seconds until one is plugged in.
    `on_waiting` runs once, the first time the camera isn't there. Returns the
    opened capture.
    """
    announced = False
    while True:
        cap = open_capture()
        if cap.isOpened():
            return cap
        cap.release()
        if not announced and on_waiting:
            on_waiting()
            announced = True
        sleep(retry_s)
