from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.responses import FileResponse
import os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
app = FastAPI()

# Session store: token -> {ip, username, password}
sessions = {} 

class LoginRequest(BaseModel):
    ip: str
    username: str
    password: str

@app.post("/api/login")
def login(req: LoginRequest):
    url = f"https://{req.ip}/redfish/v1/SessionService/Sessions"
    try:
        resp = requests.post(url, json={"UserName": req.username, "Password": req.password}, verify=False, timeout=5)
        if resp.status_code == 201:
            token = resp.headers.get("X-Auth-Token")
            # Store credentials securely for session renewal
            sessions[token] = {
                "ip": req.ip,
                "username": req.username,
                "password": req.password
            }
            return {"token": token, "ip": req.ip}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=401, detail="Auth Failed")

@app.post("/api/renew-session")
def renew_session(x_auth_token: str = Header(None)):
    """
    Renew an existing session by creating a new session with stored credentials.
    This is called when a 401 is detected to seamlessly re-authenticate.
    """
    if not x_auth_token or x_auth_token not in sessions:
        raise HTTPException(status_code=401, detail="No session to renew")

    session = sessions[x_auth_token]
    url = f"https://{session['ip']}/redfish/v1/SessionService/Sessions"

    try:
        resp = requests.post(
            url,
            json={"UserName": session["username"], "Password": session["password"]},
            verify=False,
            timeout=5
        )
        if resp.status_code == 201:
            new_token = resp.headers.get("X-Auth-Token")
            # Copy credentials to new token and cleanup old session
            sessions[new_token] = session.copy()
            del sessions[x_auth_token]
            return {"token": new_token, "ip": session["ip"]}
    except Exception as e:
        # Clean up expired session on renewal failure
        del sessions[x_auth_token]
        raise HTTPException(status_code=500, detail=str(e))

    # Clean up expired session on renewal failure
    del sessions[x_auth_token]
    raise HTTPException(status_code=401, detail="Session renewal failed")

@app.api_route("/api/proxy", methods=["GET", "POST"])
async def proxy(request: Request, path: str, x_auth_token: str = Header(None)):
    if x_auth_token not in sessions:
        raise HTTPException(status_code=401, detail="Session Expired")

    session = sessions[x_auth_token]
    ip = session["ip"]
    url = f"https://{ip}{path}"
    headers = {"X-Auth-Token": x_auth_token}
    
    try:
        if request.method == "POST":
            # For Actions (Reset, etc), capture the JSON body from the frontend
            body = await request.json()
            resp = requests.post(url, json=body, headers=headers, verify=False, timeout=10)
        else:
            # For Browsing
            resp = requests.get(url, headers=headers, verify=False, timeout=10)
            # MiTAC/AMI Trailing Slash Fix
            if resp.status_code == 404 and not path.endswith('/'):
                resp = requests.get(url + '/', headers=headers, verify=False, timeout=10)
        
        # Return the actual JSON so the JsonViewer can parse it
        if resp.text:
            return resp.json()
        return {"status": "success", "code": resp.status_code}
        
    except Exception as e:
        # Return the error as JSON so the UI doesn't crash
        return {"error": str(e)}

# Static File Mounting
# Ensure this stays at the bottom so it doesn't override API routes
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

@app.get("/{catchall:path}")
async def serve_vue(catchall: str):
    static_file = os.path.join("static", "index.html")
    if not os.path.exists(static_file):
        return {"error": "Frontend build folder 'static' not found."}
    return FileResponse(static_file)