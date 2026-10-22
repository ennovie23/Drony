import io
import os
import threading
import unittest

from parent_watch import watch_parent_pipe


class ParentWatchTest(unittest.TestCase):
    def test_fires_when_pipe_closes(self):
        read_fd, write_fd = os.pipe()
        gone = threading.Event()
        with os.fdopen(read_fd, "rb") as reader:
            watch_parent_pipe(reader, gone.set)
            self.assertFalse(gone.wait(0.2))
            os.close(write_fd)
            self.assertTrue(gone.wait(2))

    def test_ignores_data_until_eof(self):
        gone = threading.Event()
        watch_parent_pipe(io.BytesIO(b"keepalive" * 1000), gone.set)
        self.assertTrue(gone.wait(2))


if __name__ == "__main__":
    unittest.main()
