"""Baostock session manager - maintains a single connection per process."""
import threading
import baostock as bs

_lock = threading.Lock()
_logged_in = False


def get_bs():
    global _logged_in
    with _lock:
        if not _logged_in:
            result = bs.login()
            if result.error_code == "0":
                _logged_in = True
            else:
                raise RuntimeError(f"baostock login failed: {result.error_msg}")
    return bs


def reset_bs():
    global _logged_in
    with _lock:
        try:
            bs.logout()
        except Exception:
            pass
        _logged_in = False
