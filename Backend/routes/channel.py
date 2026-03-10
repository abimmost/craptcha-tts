from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from models.schema import SelectChannelRequest
from brain.telegram import TelegramService
from typing import Optional
from pathlib import Path

router = APIRouter(tags=["channels"])

@router.get(
    "/channels",
    summary="List Channels and Groups",
    description=(
        "### Internal Logic\n"
        "Iterates through the user's active dialogs using Telethon's `iter_dialogs()`. Filters for broadcast channels and groups only.\n\n"
        "### Usage Guide\n"
        "Use this to populate the 'Library' or 'Sidebar' of your app. It provides the necessary IDs for the `/channels/select` endpoint.\n\n"
        "### Scenarios\n"
        "- **Initialization**: Loading the app to show a list of available reading material.\n"
        "- **Unread Monitoring**: Checking which channels have new content to read."
    )
)
async def list_channels(request: Request):
    tg_service: TelegramService = request.app.state.tg_service
    channels = await tg_service.get_channels()
    return {"channels": channels}

@router.post(
    "/channels/select",
    summary="Set Active Channel",
    description=(
        "### Internal Logic\n"
        "Updates the `active_channel_id` in `state.json`. This sets the global context for the simplified `/messages` route.\n\n"
        "### Usage Guide\n"
        "Call this when a user clicks a channel in your list. Once selected, you can use the ID-less `/messages` route to navigate.\n\n"
        "### Scenarios\n"
        "- **Switching Books**: Moving from reading 'News Channel A' to 'Tech Group B'."
    )
)
async def select_channel(request: Request, req: SelectChannelRequest):
    tg_service: TelegramService = request.app.state.tg_service
    success = await tg_service.select_channel(req.channel_id)
    if success:
        return {"status": "success", "message": f"Channel {req.channel_id} selected as active."}
    raise HTTPException(status_code=500, detail="Failed to select channel.")

@router.get(
    "/messages",
    summary="Fetch Message (State-Based)",
    description=(
        "### Internal Logic\n"
        "Resolves the current bookmark from `state.json`. Depending on the `direction`, it fetches the message immediately newer or older than the pointer. "
        "It also filters for media, downloading images and audio to the local cache.\n\n"
        "### Usage Guide\n"
        "- `direction=ahead`: Move to the next message (Page Forward).\n"
        "- `direction=behind`: Move to the previous message (Page Backward).\n"
        "- `direction=current`: Resume from the last read position or oldest unread.\n\n"
        "### Scenarios\n"
        "- **Continuous Reading**: The primary loop for a TTS engine to walk through a channel's history post-by-post."
    )
)
async def get_active_message(request: Request, offset_id: Optional[int] = None, direction: str = "current"):
    tg_service: TelegramService = request.app.state.tg_service
    result = await tg_service.get_message(channel_id=None, offset_id=offset_id, direction=direction)
    if not result:
        raise HTTPException(status_code=404, detail="No active channel selected or no messages found.")
    return result
