#!/usr/bin/env python3
"""
Deployment verification script.
Usage: python verify_deployment.py --frontend https://your-app.vercel.app --backend https://your-api.onrender.com
"""
import argparse
import json
import sys
import urllib.request
import urllib.error

PASS = "✅ PASS"
FAIL = "❌ FAIL"
results = []


def check(label, fn):
    try:
        fn()
        results.append((label, True, ""))
        print(f"  {PASS}  {label}")
    except Exception as e:
        results.append((label, False, str(e)))
        print(f"  {FAIL}  {label}: {e}")


def get(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": "verify-deployment/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        return resp.status, resp.headers, body


def post(url, data, timeout=10):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "verify-deployment/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        return resp.status, resp.headers, body


def run_checks(frontend_url, backend_url):
    print(f"\n{'='*60}")
    print(f"AI Fitness Trainer — Deployment Verification")
    print(f"Frontend: {frontend_url or '(skipped)'}")
    print(f"Backend:  {backend_url or '(skipped)'}")
    print(f"{'='*60}\n")

    if frontend_url:
        print("FRONTEND CHECKS")
        check("Frontend loads (200)", lambda: get(frontend_url.rstrip('/') + '/'))
        print()

    if backend_url:
        base = backend_url.rstrip('/')
        print("BACKEND CHECKS")

        check("GET /ping → 200 {pong:true}", lambda: (
            lambda s, h, b: (
                assert_true(s == 200, f"status={s}"),
                assert_true(json.loads(b).get("pong") is True, "missing pong")
            )
        )(*get(f"{base}/ping")))

        check("GET /health → db:connected", lambda: (
            lambda s, h, b: (
                assert_true(s == 200, f"status={s}"),
                assert_true(json.loads(b).get("db") == "connected", "db not connected")
            )
        )(*get(f"{base}/health")))

        session_id = [None]

        def create_session_check():
            payload = {
                "exercise": "bicep_curl", "sets": 2, "reps": 20,
                "duration_seconds": 60, "avg_form_score": 85.0,
                "best_form_score": 95.0, "rep_log": [], "summary": {}
            }
            s, h, b = post(f"{base}/sessions", payload)
            assert_true(s == 201, f"status={s}")
            data = json.loads(b)
            assert_true("id" in data, "missing id")
            session_id[0] = data["id"]

        check("POST /sessions → 201", create_session_check)

        check("GET /sessions → 200 list", lambda: (
            lambda s, h, b: (
                assert_true(s == 200, f"status={s}"),
                assert_true("sessions" in json.loads(b), "missing sessions key")
            )
        )(*get(f"{base}/sessions")))

        if session_id[0]:
            check(f"GET /sessions/{session_id[0]} → 200", lambda: (
                lambda s, h, b: assert_true(s == 200, f"status={s}")
            )(*get(f"{base}/sessions/{session_id[0]}")))

        check("GET /sessions/9999999 → 404", lambda: _expect_404(f"{base}/sessions/9999999"))

        check("GET /analytics/summary → 200", lambda: (
            lambda s, h, b: assert_true(s == 200, f"status={s}")
        )(*get(f"{base}/analytics/summary")))

        def cors_check():
            req = urllib.request.Request(
                f"{base}/health",
                headers={"Origin": "https://example.com", "User-Agent": "verify-deployment/1.0"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                headers = dict(resp.headers)
                has_cors = any(
                    k.lower() == "access-control-allow-origin"
                    for k in headers
                )
                assert_true(has_cors, "no CORS headers found")

        check("CORS headers present", cors_check)

        check("POST /sessions malformed → 422", lambda: _expect_422(f"{base}/sessions"))

        if session_id[0]:
            def delete_check():
                req = urllib.request.Request(
                    f"{base}/sessions/{session_id[0]}",
                    method="DELETE",
                    headers={"User-Agent": "verify-deployment/1.0"}
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    assert_true(resp.status == 204, f"status={resp.status}")
            check(f"DELETE /sessions/{session_id[0]} → 204", delete_check)

        print()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = len(results) - passed

    print(f"{'='*60}")
    if failed == 0:
        print(f"✅ Deployment verified — all {passed} checks passed")
    else:
        print(f"❌ {failed} check(s) failed — see above")
    print(f"{'='*60}\n")

    return failed == 0


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def _expect_404(url):
    try:
        get(url)
        raise AssertionError("Expected 404 but got 200")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise AssertionError(f"Expected 404, got {e.code}")


def _expect_422(url):
    try:
        post(url, {"bad": "data"})
        raise AssertionError("Expected 422 but got 200")
    except urllib.error.HTTPError as e:
        if e.code != 422:
            raise AssertionError(f"Expected 422, got {e.code}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify AI Fitness Trainer deployment")
    parser.add_argument("--frontend", default="", help="Vercel frontend URL")
    parser.add_argument("--backend", default="", help="Render backend URL")
    args = parser.parse_args()

    if not args.frontend and not args.backend:
        print("Usage: python verify_deployment.py --frontend <url> --backend <url>")
        sys.exit(1)

    success = run_checks(args.frontend or None, args.backend or None)
    sys.exit(0 if success else 1)
