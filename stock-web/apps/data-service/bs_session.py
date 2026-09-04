"""Baostock session manager - maintains a single connection per process."""

import os
import random
import string
import threading
import time
import baostock as bs
from datetime import datetime, timedelta

_lock = threading.Lock()
_logged_in = False
_last_login_attempt = None
_last_request_time = 0.0
# 退避时间：IP 被封时延长退避，避免疯狂重试刷屏
_login_failure_backoff = timedelta(seconds=30)
# 请求间最小间隔（秒），降低被 baostock 拉黑的概率
_min_request_interval = float(os.environ.get("BAOSTOCK_MIN_INTERVAL", "0.3"))


def _generate_user_id() -> str:
    """随机生成一个 user_id。"""
    env_uid = os.environ.get("BAOSTOCK_USER_ID")
    if env_uid:
        return env_uid
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=8))


def get_bs():
    global _logged_in, _last_login_attempt, _last_request_time
    with _lock:
        # 请求间限速
        now = time.monotonic()
        elapsed = now - _last_request_time
        if elapsed < _min_request_interval:
            time.sleep(_min_request_interval - elapsed)
        _last_request_time = time.monotonic()

        if not _logged_in:
            if (
                _last_login_attempt
                and datetime.utcnow() - _last_login_attempt < _login_failure_backoff
            ):
                remaining = (
                    _login_failure_backoff - (datetime.utcnow() - _last_login_attempt)
                ).seconds
                raise RuntimeError(
                    f"baostock login recently failed, backing off ({remaining}s / {_login_failure_backoff.seconds}s)"
                )

            try:
                user_id = _generate_user_id()
                result = bs.login(user_id=user_id, password="123456")
                if result.error_code == "0":
                    _logged_in = True
                    _last_login_attempt = None
                else:
                    _last_login_attempt = datetime.utcnow()
                    raise RuntimeError(f"baostock login failed: {result.error_msg}")
            except RuntimeError:
                raise
            except Exception as e:
                _last_login_attempt = datetime.utcnow()
                raise RuntimeError(f"baostock connection error: {str(e)}")
    return bs


def reset_bs():
    """重置 baostock session。仅在已登录时调 logout，避免 Bad file descriptor。

    保留退避计时，避免 reset → 立即重试 → 又失败 的循环。
    """
    global _logged_in, _last_login_attempt
    with _lock:
        if _logged_in:
            try:
                bs.logout()
            except Exception:
                pass
        _logged_in = False


def throttle():
    """请求间限速，已集成到 get_bs() 中。"""
    global _last_request_time
    with _lock:
        now = time.monotonic()
        elapsed = now - _last_request_time
        if elapsed < _min_request_interval:
            time.sleep(_min_request_interval - elapsed)
        _last_request_time = time.monotonic()
