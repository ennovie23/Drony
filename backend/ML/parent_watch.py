import threading


def watch_parent_pipe(stream, on_parent_gone):
    """
    Calls `on_parent_gone` once `stream` (the stdin pipe the backend spawned us
    with) reaches EOF. The pipe closes when the backend exits, is restarted, or
    stops the simulation — however it dies — so the detector never lingers as
    an orphan holding the webcam and the stream port.
    """

    def run():
        try:
            while stream.read(1024):
                pass
        except (OSError, ValueError):
            pass
        on_parent_gone()

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread
