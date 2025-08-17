import asyncio
import time
from src.state import HEALTH_STATE, LB_INDEX
from src.routes.openai import choose_url


def test_round_robin_with_health():
    urls = ["http://u1", "http://u2", "http://u3"]
    now = time.time()
    # mark all healthy
    for u in urls:
        HEALTH_STATE[u] = {"ok": True, "ts": now}
    LB_INDEX.clear()
    picks = [choose_url(urls) for _ in range(6)]
    assert picks == ["http://u1", "http://u2", "http://u3", "http://u1", "http://u2", "http://u3"]


def test_outlier_ejection():
    urls = ["http://u1", "http://u2"]
    now = time.time()
    HEALTH_STATE[urls[0]] = {"ok": False, "ts": now}
    HEALTH_STATE[urls[1]] = {"ok": True, "ts": now}
    LB_INDEX.clear()
    pick = choose_url(urls)
    assert pick == "http://u2"

