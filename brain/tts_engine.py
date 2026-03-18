import logging
from typing import AsyncGenerator
from google import genai
from google.genai import types

# Set up logging for TTS Engine
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TTSEngine")

class TTSEngine:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.5-flash-native-audio-preview-12-2025"

    def _get_pacing_prompt(self, speed: float) -> str:
        """Maps speed multiplier to a natural language pacing instruction."""
        if speed <= 0.5:
            return "Speak very slowly and deliberately, with significant pauses between words."
        elif speed >= 1.5:
            return "Speak very rapidly and quickly, with minimal pauses between words."
        elif speed >= 1.25:
            return "Speak at a fast pace, slightly quicker than normal."
        else:
            return "Speak at a natural, normal pace."

    async def stream_tts(self, text: str, voice: str = "Zephyr", speed: float = 1.0) -> AsyncGenerator[bytes, None]:
        """
        Streams audio from Gemini Live API based on text input.
        Returns a generator of raw PCM chunks (24kHz, 16-bit, mono).
        """
        pacing_instruction = self._get_pacing_prompt(speed)
        
        config = {
            "response_modalities": ["AUDIO"],
            "speech_config": types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                )
            ),
            "system_instruction": (
                "You are a professional Text-to-Speech engine. "
                "Your ONLY job is to read the provided text exactly as it is written. "
                "DO NOT engage in conversation, DO NOT answer questions, and DO NOT add your own commentary. "
                f"Pacing: {pacing_instruction}"
            )
        }

        logger.info(f"Starting TTS stream for text (len={len(text)}): {text[:50]}...")
        
        try:
            async with self.client.aio.live.connect(model=self.model, config=config) as session:
                await session.send_client_content(
                    turns={"role": "user", "parts": [{"text": text}]},
                    turn_complete=True,
                )

                async for response in session.receive():
                    if response.server_content and response.server_content.model_turn:
                        for part in response.server_content.model_turn.parts:
                            if part.inline_data:
                                yield part.inline_data.data
        except Exception as e:
            logger.error(f"TTS Streaming error: {e}")
            # Do not re-raise to avoid crashing the StreamingResponse, 
            # though the stream will terminate here.
