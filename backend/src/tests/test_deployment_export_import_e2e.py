import os
import time
import json
import httpx


def _base_url() -> str:
    # Prefer env override so CI/dev can target the right host.
    # In docker-compose dev, gateway is typically exposed on host:8084.
    return os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")


def _login(client: httpx.Client, username: str = "admin", password: str = "admin") -> None:
    r = client.post(
        "/auth/login",
        json={"username": username, "password": password},
        timeout=10.0,
    )
    assert r.status_code == 200, r.text


def _find_model(models: list[dict], needle: str) -> dict:
    n = needle.lower()
    for m in models:
        name = str(m.get("name") or "").lower()
        served = str(m.get("served_model_name") or "").lower()
        lp = str(m.get("local_path") or "").lower()
        if n in name or n in served or n in lp:
            return m
    raise AssertionError(f"Model not found: {needle}. Available: {[x.get('served_model_name') for x in models]}")


def _wait_for_job_complete(client: httpx.Client, timeout_s: float = 60.0) -> dict:
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout_s:
        r = client.get("/admin/deployment/status", timeout=10.0)
        assert r.status_code == 200, r.text
        data = r.json()
        last = data
        st = str(data.get("status") or "")
        if st in ("completed", "failed"):
            return data
        time.sleep(0.5)
    raise AssertionError(f"Timed out waiting for job completion. Last={last}")


def _wait_for_readiness(client: httpx.Client, model_id: int, timeout_s: float = 180.0) -> None:
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout_s:
        r = client.get(f"/admin/models/{model_id}/readiness", timeout=10.0)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") == "ready":
            return
        time.sleep(1.0)
    raise AssertionError(f"Model not ready in time. Last={last}")


def _wait_for_gateway_chat_ok(
    client: httpx.Client,
    served_model_name: str,
    api_key: str | None,
    timeout_s: float = 180.0,
) -> dict:
    """Wait until gateway can successfully chat-complete against this served model."""
    t0 = time.time()
    last_text = None
    while time.time() - t0 < timeout_s:
        try:
            headers = {}
            # In dev mode, Cortex allows missing bearer tokens. In stricter modes, provide CORTEX_TEST_API_KEY.
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            rr = client.post(
                "/v1/chat/completions",
                headers=headers,
                json={
                    "model": served_model_name,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                    "temperature": 0.0,
                },
                timeout=30.0,
            )
            if rr.status_code == 200:
                return rr.json()
            last_text = rr.text[:400]
        except Exception as e:
            last_text = str(e)
        time.sleep(1.0)
    raise AssertionError(f"Gateway never returned 200 for chat. Last={last_text}")

def test_export_import_model_manifest_e2e():
    """
    End-to-end test (HTTP) that exercises:
    - list models
    - export single model (manifest only; quick)
    - scan manifests directory
    - import model with rename-on-conflict safeguard
    - start imported model
    - readiness + small chat completion

    Target model: qwen3-06b (offline loaded).

    Notes:
    - Set CORTEX_GATEWAY_URL if gateway is not on 127.0.0.1:8084
    - Set CORTEX_EXPORT_DIR if you want a different export dir (must be container-visible)
    """
    base = _base_url()
    export_dir = os.environ.get("CORTEX_EXPORT_DIR", "/var/cortex/exports")
    needle = os.environ.get("CORTEX_TEST_MODEL", "qwen3-06b")

    with httpx.Client(base_url=base, timeout=30.0) as c:
        # health
        r = c.get("/health", timeout=10.0)
        assert r.status_code == 200, r.text

        # admin login (cookie session)
        _login(c)

        # list models and find target
        models = c.get("/admin/models", timeout=20.0).json()
        assert isinstance(models, list)
        target = _find_model(models, needle)
        target_id = int(target["id"])

        # Export (manifest only; no engine image tar in test to keep it fast and deterministic)
        r = c.post(
            f"/admin/deployment/export-model/{target_id}",
            json={
                "output_dir": export_dir,
                "include_engine_image": False,
                "tar_model_files": False,
                "tar_hf_cache": False,
                "allow_pull_images": False,
            },
            timeout=20.0,
        )
        assert r.status_code == 200, r.text
        job = _wait_for_job_complete(c, timeout_s=30.0)
        assert job.get("status") == "completed", job
        artifacts = job.get("artifacts") or {}
        mf = None
        for p in (artifacts.get("manifests") or []):
            if isinstance(p, str) and p.endswith(f"model-{target_id}.json"):
                mf = os.path.basename(p)
                break
        # Fallback: assume file name pattern
        mf = mf or f"model-{target_id}.json"

        # Scan manifests directory and ensure our manifest is present
        r = c.get("/admin/deployment/model-manifests", params={"output_dir": export_dir}, timeout=20.0)
        assert r.status_code == 200, r.text
        items = r.json().get("items")
        assert isinstance(items, list)
        assert any(it.get("file") == mf for it in items), items

        # Import with rename-on-conflict and a visible name override
        r = c.post(
            "/admin/deployment/import-model",
            json={
                "output_dir": export_dir,
                "manifest_file": mf,
                "conflict_strategy": "rename",
                "name_override": f"{target.get('name')} (imported e2e)",
                "served_model_name_override": None,
                "local_path_override": None,
                "use_exported_engine_image": True,
            },
            timeout=20.0,
        )
        assert r.status_code in (200, 409), r.text
        if r.status_code == 409:
            raise AssertionError(f"served_model_name conflict; expected rename strategy to succeed: {r.text}")
        imported = r.json()
        imported_id = int(imported["id"])
        imported_served = str(imported["served_model_name"])
        assert imported_served

        # Start imported model
        r = c.post(f"/admin/models/{imported_id}/start", timeout=30.0)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") in ("running", "failed"), body
        assert body.get("status") == "running", body

        # Wait until the model is actually serving by exercising the same gateway path clients use.
        # (The /admin/models/{id}/readiness probe may fail with 401 if engines enforce an internal API key.)
        api_key = os.environ.get("CORTEX_TEST_API_KEY", "").strip() or None
        data = _wait_for_gateway_chat_ok(c, imported_served, api_key, timeout_s=180.0)
        assert isinstance(data, dict)
        assert data.get("choices"), data

        # Cleanup: stop imported model container to keep system tidy (best-effort)
        try:
            c.post(f"/admin/models/{imported_id}/stop", timeout=20.0)
        except Exception:
            pass


