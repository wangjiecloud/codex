"""Baostock session manager - maintains a single connection per process."""

import threading
import baostock as bs
from datetime import datetime, timedelta

_lock = threading.Lock()
_logged_in = False
_last_login_attempt = None
# 退避时间：10 秒（原 60 秒太长，批量同步期间连续失败会卡很久）
_login_failure_backoff = timedelta(seconds=10)


def get_bs():
    global _logged_in, _last_login_attempt
    with _lock:
        if not _logged_in:
            if (
                _last_login_attempt
                and datetime.utcnow() - _last_login_attempt < _login_failure_backoff
            ):
                elapsed = (datetime.utcnow() - _last_login_attempt).seconds
                raise RuntimeError(
                    f"baostock login recently failed, backing off ({elapsed}s / 10s)"
                )

            try:
                result = bs.login()
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
    """重置 baostock session，同时清除退避计时，允许立即重连。"""
    global _logged_in, _last_login_attempt
    with _lock:
        try:
            bs.logout()
        except Exception:
            pass
        _logged_in = False
        _last_login_attempt = None  # 清除退避，下次 get_bs() 立即尝试重连
