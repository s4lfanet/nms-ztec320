import urllib.request, json, http.cookiejar

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Login
data = json.dumps({"username": "admin", "password": "admin123"}).encode()
try:
    r = op.open(urllib.request.Request(
        "http://localhost:5000/api/auth/login",
        data=data,
        headers={"Content-Type": "application/json"}
    ))
    print("Login:", r.status, r.read().decode()[:100])
except Exception as e:
    print("Login failed:", e)
    exit(1)

# Check update
try:
    r2 = op.open("http://localhost:5000/api/system/update/check")
    resp = r2.read().decode()
    print("Check:", resp[:500])
except Exception as e:
    print("Check failed:", e)
