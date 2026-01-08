from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.responses import FileResponse
import os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
app = FastAPI()

# Simple session store
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
            sessions[token] = req.ip
            return {"token": token, "ip": req.ip}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=401, detail="Auth Failed")

@app.api_route("/api/proxy", methods=["GET", "POST"])
async def proxy(request: Request, path: str, x_auth_token: str = Header(None)):
    if x_auth_token not in sessions:
        raise HTTPException(status_code=401, detail="Session Expired")
    
    ip = sessions[x_auth_token]
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