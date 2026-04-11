import time, os, hashlib, hmac, requests

KEYS = [k.strip() for k in os.environ.get("IRCTC_CONNECT_API_KEYS", "").split(",") if k.strip()]
_SECRET = os.environ.get(
    "IRCTC_CONNECT_SDK_SECRET",
    "97c56e08b27b161124f88acd4f24d1bd50f48075f11dc23b9ea6c0bc9b2f8794",
)

def _hash(p):
    return hashlib.sha256(p.encode()).hexdigest()

def _sign(m, p, t, n, ph, k):
    msg = f"{m.upper()}\n{p}\n{t}\n{n}\n{ph}\n{k}"
    return hmac.new(_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()

def request_api(path):
    ts = str(int(time.time() * 1000))
    nonce = os.urandom(32).hex()
    ph = _hash("")
    k = KEYS[0]
    headers = {
        "x-api-key": k,
        "x-irctc-sdk-ts": ts,
        "x-irctc-sdk-nonce": nonce,
        "x-irctc-sdk-payload-sha256": ph,
        "x-irctc-sdk-signature": _sign("GET", path, ts, nonce, ph, k),
        "x-irctc-sdk-version": "1",
        "Accept": "application/json"
    }
    base = os.environ.get(
        "IRCTC_CONNECT_BASE_URL",
        "https://irctc-connect-api.rajivdubey.tech",
    ).rstrip("/")
    return requests.get(f"{base}{path}", headers=headers).json()

if not KEYS:
    raise SystemExit("Set IRCTC_CONNECT_API_KEYS (comma-separated irctc_* keys).")

print(request_api("/api/searchTrainBetweenStations/NDLS/BCT"))
