from fastapi import APIRouter, HTTPException, Request
from models.schema import PhoneAuthRequest, PasswordRequest
from brain.telegram import TelegramService

router = APIRouter(prefix="/auth", tags=["auth"])

# We will expect the app to inject the tg_service via request state or global
# For simplicity in this refactor, we'll assume we can import it or get it from app.state

@router.get(
    "/qr",
    summary="QR Code Authentication",
    description=(
        "### Internal Logic\n"
        "Initiates a blocking QR code login flow. The server internally manages a loop that generates a temporary QR token, "
        "converts it to a `qr.png` image (stored in `temp_media/`), and refreshes it every 30 seconds to stay within Telegram's constraints.\n\n"
        "### Usage Guide\n"
        "1. Call this endpoint. It will hang (long-poll) while waiting for the scan.\n"
        "2. Display `[BASE_URL]/media/qr.png` on your frontend, refreshing the image element every few seconds.\n"
        "3. If the user scans, the request completes with 'authenticated'.\n\n"
        "### Scenarios\n"
        "- **Standard Login**: First-time setup or session expiry.\n"
        "- **2FA Trigger**: Returns a '2fa_needed' status if the account has a password enabled, signaling you to redirect to `/auth/2fapassword`."
    )
)
async def auth_qr(request: Request):
    tg_service: TelegramService = request.app.state.tg_service
    status = await tg_service.login_with_qr(timeout_total=180)
    
    if status == "success":
        tg_service.cleanup_qr_image()
        return {"status": "authenticated"}
    elif status == "2fa_needed":
        return {"status": "2fa_needed", "instruction": "Submit 2FA password to /auth/password"}
    elif status == "timeout":
        tg_service.cleanup_qr_image()
        return {"status": "timeout", "instruction": "Authentication timed out (3 mins). Try again."}
    
    return {"status": "failed", "instruction": "Login failed. Try again."}

@router.post(
    "/phone",
    summary="Phone Number Authentication",
    description=(
        "### Internal Logic\n"
        "A two-step stateful authentication. Step 1 sends the code request via Telegram. Step 2 verifies the code sent to the user's device.\n\n"
        "### Usage Guide\n"
        "- **Step 1**: Send `{\"phone\": \"+123456789\"}`. Backend returns 'code_sent'.\n"
        "- **Step 2**: Send `{\"phone\": \"+123456789\", \"code\": \"12345\"}`. Backend returns 'authenticated'.\n\n"
        "### Scenarios\n"
        "- **Alternative Auth**: Used if the user cannot scan a QR code (e.g., they are on the same device where the QR is displayed)."
    )
)
async def auth_phone(request: Request, req: PhoneAuthRequest):
    tg_service: TelegramService = request.app.state.tg_service
    if not req.code:
        await tg_service.send_code_request(req.phone)
        return {"status": "code_sent", "instruction": "Submit received code in next POST"}
    
    status = await tg_service.sign_in_phone(req.phone, req.code)
    if status == "success":
        return {"status": "authenticated"}
    elif status == "2fa_needed":
        return {"status": "2fa_needed", "instruction": "Submit 2FA password to /auth/password"}
    raise HTTPException(status_code=401, detail="Phone authentication failed.")

@router.post(
    "/2fapassword",
    summary="Two-Factor Authentication Password",
    description=(
        "### Internal Logic\n"
        "Verifies the cloud password against the current pending session. Successfully submitting this completes the login flow.\n\n"
        "### Usage Guide\n"
        "Call this only after `/auth/qr` or `/auth/phone` returns a '2fa_needed' status.\n\n"
        "### Scenarios\n"
        "- **Secure Accounts**: Essential for users who have enabled Telegram's Cloud Password security feature."
    )
)
async def auth_password(request: Request, req: PasswordRequest):
    tg_service: TelegramService = request.app.state.tg_service
    success = await tg_service.sign_in_password(req.password)
    if success:
        tg_service.cleanup_qr_image()
        return {"status": "authenticated"}
    raise HTTPException(status_code=401, detail="Invalid 2FA password.")
