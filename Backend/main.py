import os
import sys
import warnings

# Suppress Telethon experimental warning globally
warnings.filterwarnings("ignore", message="Using async sessions support is an experimental feature")
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pathlib import Path

# Add project root to sys.path for modular imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from brain.telegram import TelegramService
from brain.tts_engine import TTSEngine
from routes import auth, channel, forward, voice
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TG-TTS Backend")

# Enable CORS for React/Frontend
cors_origin = os.getenv("CORS_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin] if cors_origin != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# State Initialization
tg_service = TelegramService(session_path=os.getenv("TG_SESSION_PATH", "session"))
tts_engine = TTSEngine(api_key=os.getenv("GEMINI_API_KEY"))

app.state.tg_service = tg_service
app.state.tts_engine = tts_engine

TEMP_MEDIA_DIR = Path("temp_media")
TEMP_MEDIA_DIR.mkdir(exist_ok=True)

# Include Routers
app.include_router(auth.router)
app.include_router(channel.router)
app.include_router(forward.router)
app.include_router(voice.router)

@app.get(
    "/media/{filename}",
    summary="Serve Local Media",
    description=(
        "### Internal Logic\n"
        "Acts as a secure proxy to the `temp_media/` directory. Serves images, audio, and QR codes.\n\n"
        "### Usage Guide\n"
        "Point your `<img>` or `<audio>` tags directly to these URLs.\n\n"
        "### Scenarios\n"
        "- **Multimedia Display**: Viewing photos or QR codes."
    ),
    tags=["media"]
)
async def serve_media(filename: str):
    file_path = TEMP_MEDIA_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path=file_path)

@app.on_event("startup")
async def startup():
    authorized = await tg_service.connect()
    if not authorized:
        print("⚠️ Warning: Telegram Client not authorized. Auth routes will be needed.")
    else:
        print("✅ Telegram Client Connected and Authorized!")

@app.on_event("shutdown")
async def shutdown():
    await tg_service.disconnect()

@app.get(
    "/health",
    summary="System Health Check",
    description=(
        "### Internal Logic\n"
        "Checks if the FastAPI server is responsive and verifies the Telethon client's authentication state.\n\n"
        "### Usage Guide\n"
        "Call this on app startup. If `authorized: false`, redirect the user to the Authentication page.\n\n"
        "### Scenarios\n"
        "- **Session Monitoring**: Verifying that the Telegram session is still active and the user is logged in."
    )
)
async def health_check():
    is_authorized = await tg_service.connect()
    return {
        "status": "ok", 
        "telegram": "connected" if tg_service.client.is_connected() else "disconnected",
        "authorized": is_authorized
    }
