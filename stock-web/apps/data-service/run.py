import os
import signal
import sys
import time
import subprocess


def main():
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ],
        preexec_fn=os.setsid,
    )

    def _shutdown(signum, frame):
        signal.signal(signal.SIGINT, signal.SIG_DFL)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
            time.sleep(2)
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    proc.wait()


if __name__ == "__main__":
    main()
