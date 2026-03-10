import os
import re
import asyncio
import json
import warnings
from pathlib import Path
from typing import List, Optional, Dict, Any
from telethon import TelegramClient, functions, types, errors
from telethon.tl.types import (
    MessageMediaPhoto, MessageMediaDocument, Channel, Chat,
    DocumentAttributeFilename, DocumentAttributeAudio, DocumentAttributeCustomEmoji
)
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class TelegramService:
    def __init__(self, session_path: str = 'session'):
        self.api_id = int(os.getenv('TG_API_ID'))
        self.api_hash = os.getenv('TG_API_HASH')
        self.target_group_id = int(os.getenv('TG_TARGET_GROUP_ID'))
        
        # Session configuration
        # Defaults to the provided session_path, but can be overridden by ENV
        self.session_name = os.getenv('TG_SESSION_PATH', session_path)
        
        # State persistence
        self.state_file = Path("state.json")
        self.state = self.load_state()
        
        # Identity Spoofing
        device_model = os.getenv('TG_DEVICE_MODEL', 'TTS-Reader-Local')
        system_version = os.getenv('TG_SYSTEM_VERSION', 'Windows 10')
        app_version = os.getenv('TG_APP_VERSION', '1.0.0')
        
        self.client = TelegramClient(
            self.session_name, 
            self.api_id, 
            self.api_hash,
            device_model=device_model,
            system_version=system_version,
            app_version=app_version
        )
        self.qr_login = None
        self.temp_media_dir = Path("temp_media")
        self.temp_media_dir.mkdir(exist_ok=True)

    def load_state(self) -> Dict[str, Any]:
        """Loads the session state from state.json."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading state.json: {e}")
        return {
            "active_channel_id": None,
            "pointers": {}  # channel_id -> last_message_id
        }
    def _clean_text(self, text: str) -> str:
        """Removes URLs and Emojis from text to make it TTS-ready."""
        if not text:
            return ""
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        # Remove Emojis (character range for supplementary planes)
        text = re.sub(r'[^\x00-\xFFFF]', '', text)
        # Clean up multiple spaces and newlines
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def _clear_temp_media(self):
        """Deletes all files in temp_media except for qr.png."""
        try:
            for item in self.temp_media_dir.iterdir():
                if item.is_file() and item.name != "qr.png":
                    item.unlink()
        except Exception as e:
            print(f"Error clearing temp_media: {e}")

    def save_state(self):
        """Saves current state to state.json."""
        try:
            with open(self.state_file, 'w') as f:
                json.dump(self.state, f, indent=2)
        except Exception as e:
            print(f"Error saving state.json: {e}")

    async def connect(self):
        if not self.client.is_connected():
            await self.client.connect()
        return await self.client.is_user_authorized()

    async def disconnect(self):
        await self.client.disconnect()

    # --- Authentication Methods ---

    async def login_with_qr(self, timeout_total: int = 180):
        """
        Merged QR login flow:
        1. Checks if already authorized.
        2. Loops, generating a fresh QR every 30s until success, 2FA, or total timeout.
        """
        if not self.client.is_connected():
            await self.client.connect()
            
        if await self.client.is_user_authorized():
            return "success"

        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < timeout_total:
            try:
                # Generate fresh token (expires in ~30s)
                self.qr_login = await self.client.qr_login()
                self.generate_qr_image(self.qr_login.url)
                
                try:
                    # Wait for scan OR for the 30s token expiration
                    await self.qr_login.wait(timeout=30)
                    return "success"
                except asyncio.TimeoutError:
                    # Token expired, loop will refresh it
                    print("QR Token expired, refreshing...")
                    continue
                except (errors.SessionPasswordNeededError, errors.rpcerrorlist.SessionPasswordNeededError):
                    return "2fa_needed"
                
            except Exception as e:
                print(f"QR Login loop error: {e}")
                await asyncio.sleep(2) # Prevent rapid fire on errors
        
        return "timeout"

    def generate_qr_image(self, url: str):
        """Generates a QR code image and saves it to temp_media."""
        import qrcode
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(self.temp_media_dir / "qr.png")

    def cleanup_qr_image(self):
        """Removes the QR image after use."""
        qr_path = self.temp_media_dir / "qr.png"
        if qr_path.exists():
            qr_path.unlink()

    async def send_code_request(self, phone: str):
        """Starts phone login."""
        if not self.client.is_connected():
            await self.client.connect()
        return await self.client.send_code_request(phone)

    async def sign_in_phone(self, phone: str, code: str):
        """Completes phone login step 1 (code)."""
        try:
            await self.client.sign_in(phone, code)
            return "success"
        except errors.SessionPasswordNeededError:
            return "2fa_needed"
        except Exception as e:
            print(f"Phone Auth error: {e}")
            return "failed"

    async def sign_in_password(self, password: str):
        """Completes login if 2FA is required."""
        try:
            await self.client.sign_in(password=password)
            return True
        except Exception as e:
            print(f"2FA Password error: {e}")
            return False

    # --- Core Telegram Logic ---

    async def get_channels(self) -> List[Dict[str, Any]]:
        """Lists only broadcast channels (public/private)."""
        channels = []
        async for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            # Filter: Skip Telegram system (777000), must be a Channel, and must be a broadcast
            if dialog.id != 777000 and isinstance(entity, Channel) and entity.broadcast:
                channels.append({
                    "id": dialog.id,
                    "title": dialog.name,
                    "username": getattr(entity, 'username', None),
                    "unread_count": dialog.unread_count,
                    "type": "channel"
                })
        return channels

    async def get_group_topics(self, group_id: Optional[int] = None):
        """Fetches topics and their emojis dynamically. Defaults to TG_TARGET_GROUP_ID."""
        target_id = group_id or self.target_group_id
        try:
            entity = await self.client.get_entity(target_id)
            result = await self.client(functions.channels.GetForumTopicsRequest(
                channel=entity,
                offset_date=None,
                offset_id=0,
                offset_topic=0,
                limit=100
            ))
            
            # Resolve custom emojis if any
            emoji_ids = [t.icon_emoji_id for t in result.topics if t.icon_emoji_id]
            emoji_map = {}
            if emoji_ids:
                docs = await self.client(functions.messages.GetCustomEmojiDocumentsRequest(document_id=emoji_ids))
                for doc in docs:
                    for attr in doc.attributes:
                        if isinstance(attr, DocumentAttributeCustomEmoji):
                            emoji_map[doc.id] = attr.alt
                            break
            
            topics_data = []
            for t in result.topics:
                topics_data.append({
                    "id": t.id,
                    "title": t.title,
                    "emoji": emoji_map.get(t.icon_emoji_id, "📁")
                })
            
            return {
                "group_name": getattr(entity, 'title', 'Unknown'),
                "topics": topics_data
            }
        except Exception as e:
            print(f"Error fetching topics: {e}")
            return None

    async def select_channel(self, channel_id: int):
        """Sets the active channel and saves it to state."""
        self.state["active_channel_id"] = channel_id
        self.save_state()
        return True

    async def get_message(self, channel_id: Optional[int] = None, offset_id: Optional[int] = None, direction: str = 'current') -> Optional[Dict[str, Any]]:
        """
        Fetches a single message based on the direction.
        If channel_id is None, uses active_channel_id from state.
        If offset_id is None, uses pointer from state.
        """
        if not self.client.is_connected():
            await self.client.connect()

        # Resolve channel_id
        effective_channel_id = channel_id or self.state.get("active_channel_id")
        if not effective_channel_id:
            return None

        # Resolve offset_id
        effective_offset = offset_id
        if effective_offset is None:
            effective_offset = self.state["pointers"].get(str(effective_channel_id))

        try:
            entity = await self.client.get_entity(effective_channel_id)
            
            # 1. Handle "current" (oldest unread)
            if direction == 'current' and effective_offset is None:
                dialog = next((d for d in (await self.client.get_dialogs()) if d.id == effective_channel_id), None)
                if not dialog or dialog.unread_count == 0:
                    messages = await self.client.get_messages(entity, limit=1)
                else:
                    # Access the raw Dialog object's attribute
                    read_max_id = dialog.dialog.read_inbox_max_id
                    messages = await self.client.get_messages(entity, offset_id=read_max_id, reverse=True, limit=1)
            
            # 2. Handle "ahead" (next message)
            elif direction == 'ahead' and effective_offset is not None:
                messages = await self.client.get_messages(entity, offset_id=effective_offset, reverse=True, limit=1)

            # 3. Handle "behind" (previous message)
            elif direction == 'behind' and effective_offset is not None:
                messages = await self.client.get_messages(entity, offset_id=effective_offset, limit=1)
            
            # Default fallback for 'current' with a pointer
            else:
                messages = await self.client.get_messages(entity, offset_id=effective_offset or 0, limit=1)

            if not messages:
                return None

            # Clear old media assets before processing the new one
            self._clear_temp_media()

            msg = messages[0]
            
            # Media Filter
            media_info = None
            if msg.media:
                if isinstance(msg.media, (MessageMediaPhoto, MessageMediaDocument)):
                    doc = getattr(msg.media, 'document', None)
                    is_audio = False
                    if doc and hasattr(doc, 'attributes'):
                        is_audio = any(isinstance(x, DocumentAttributeAudio) for x in doc.attributes)
                    
                    is_image = isinstance(msg.media, MessageMediaPhoto)
                    
                    if is_audio or is_image:
                        local_path = await self.download_media(msg)
                        if local_path:
                            media_info = {
                                "url": f"/media/{Path(local_path).name}",
                                "type": "photo" if is_image else "audio"
                            }

            # Update State
            self.state["pointers"][str(effective_channel_id)] = msg.id
            self.save_state()

            # Mark as read
            await self.client.send_read_acknowledge(entity, max_id=msg.id)

            return {
                "id": msg.id,
                "text": self._clean_text(msg.message or ""),
                "date": msg.date.isoformat(),
                "views": getattr(msg, 'views', 0),
                "media": media_info,
                "channel_id": effective_channel_id,
                "status": "success"
            }

        except Exception as e:
            print(f"Error in get_message: {e}")
            return None

    async def download_media(self, message) -> Optional[str]:
        """Downloads photo, audio, or voice to temp directory."""
        if not message.media:
            return None
            
        try:
            # Generate a unique path in temp_media
            ext = "bin"
            if message.photo:
                ext = "jpg"
            elif message.audio or message.voice:
                ext = getattr(message.file, 'ext', 'ogg')

            filename = f"{message.id}.{ext}"
            target_path = self.temp_media_dir / filename
            
            # Use telethon's download method
            path = await message.download_media(file=str(target_path))
            return path
        except Exception as e:
            print(f"Download error: {e}")
            return None

    async def forward_to_topic(self, channel_id: int, message_id: int, topic_id: int):
        """Forwards a message to a specific topic in the CRAptcha group."""
        try:
            from_peer = await self.client.get_input_entity(channel_id)
            to_peer = await self.client.get_input_entity(self.target_group_id)
            
            import random
            await self.client(functions.messages.ForwardMessagesRequest(
                from_peer=from_peer,
                id=[message_id],
                to_peer=to_peer,
                top_msg_id=topic_id,
                random_id=[random.randint(-2**63, 2**63 - 1)]
            ))
            return True
        except Exception as e:
            print(f"Forwarding error: {e}")
            return False
