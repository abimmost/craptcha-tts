from fastapi import APIRouter, HTTPException, Request
from models.schema import ForwardRequest
from brain.telegram import TelegramService
from typing import Optional

router = APIRouter(tags=["forwarding"])

@router.get(
    "/topics",
    summary="List Forum Topics",
    description=(
        "### Internal Logic\n"
        "Queries the `TG_TARGET_GROUP_ID` defined in `.env` for its forum topics. Formats the topic list with titles and emojis.\n\n"
        "### Usage Guide\n"
        "Use this for a quick 'Favorites' or 'Archive' picker. It provides the `topic_id` needed for the `/forward` endpoint.\n\n"
        "### Scenarios\n"
        "- **Curation**: Choosing which discussion thread to save an interesting message into."
    )
)
async def get_topics(request: Request):
    tg_service: TelegramService = request.app.state.tg_service
    topics = await tg_service.get_group_topics()
    if not topics:
        raise HTTPException(status_code=404, detail="Group not found or not a forum.")
    return topics

@router.post(
    "/forward",
    summary="Forward Message to Topic",
    description=(
        "### Internal Logic\n"
        "Uses Telegram's `ForwardMessagesRequest` to clone a message from a source channel into a specific topic ID in your target group.\n\n"
        "### Usage Guide\n"
        "Submit the source channel ID, the message ID you are currently reading, and the target topic ID.\n\n"
        "### Scenarios\n"
        "- **Bookmarking**: Saving a specific post for later discussion in your private community forum."
    )
)
async def forward_message(request: Request, req: ForwardRequest):
    tg_service: TelegramService = request.app.state.tg_service
    success = await tg_service.forward_to_topic(
        req.source_channel_id, 
        req.message_id, 
        req.topic_id
    )
    if success:
        return {"status": "success", "message": "Message forwarded."}
    raise HTTPException(status_code=500, detail="Forwarding failed.")
