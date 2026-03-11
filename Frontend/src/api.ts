import { AuthStatus, Channel, Message, Topic } from './types';

const BASE_URL = import.meta.env.VITE_API_URL;

const headers = {
  'Content-Type': 'application/json',
};

async function handleResponse(res: Response) {
  const text = await res.text();
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} - ${text}`);
  }

  try {
    // Attempt to parse as JSON if it looks like JSON
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      return JSON.parse(text);
    }
  } catch (e) {
    console.warn('Failed to parse JSON, returning raw text', e);
  }
  
  // Return raw text (e.g. "authenticated")
  return text.replace(/^"|"$/g, ''); // Remove quotes if it's a quoted string
}

export const api = {
  async getHealth(signal?: AbortSignal): Promise<AuthStatus> {
    const res = await fetch(`${BASE_URL}/health`, { headers, signal });
    return handleResponse(res);
  },

  async getChannels(signal?: AbortSignal): Promise<Channel[] | { channels: Channel[] }> {
    const res = await fetch(`${BASE_URL}/channels`, { headers, signal });
    return handleResponse(res);
  },

  async selectChannel(channelId: number, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${BASE_URL}/channels/select`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel_id: channelId }),
      signal
    });
    return handleResponse(res);
  },

  async getMessage(direction: 'ahead' | 'behind' | 'current' = 'current', offsetId?: number, signal?: AbortSignal): Promise<Message | { message: Message }> {
    const url = new URL(`${BASE_URL}/messages`);
    url.searchParams.append('direction', direction);
    if (offsetId) url.searchParams.append('offset_id', offsetId.toString());
    const res = await fetch(url.toString(), { headers, signal });
    return handleResponse(res);
  },

  async getTopics(signal?: AbortSignal): Promise<Topic[] | { topics: Topic[] }> {
    const res = await fetch(`${BASE_URL}/topics`, { headers, signal });
    return handleResponse(res);
  },

  async forwardMessage(sourceChannelId: number, messageId: number, topicId: number): Promise<void> {
    const res = await fetch(`${BASE_URL}/forward`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_channel_id: sourceChannelId,
        message_id: messageId,
        topic_id: topicId,
      }),
    });
    return handleResponse(res);
  },

  async streamTTS(text: string, voice: string, speed: number): Promise<Response> {
    const res = await fetch(`${BASE_URL}/tts-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`TTS Stream Error: ${res.status} - ${errorText}`);
    }
    return res;
  },

  getMediaUrl(path: any): string {
    if (!path) return '';
    
    let actualPath = '';
    if (typeof path === 'string') {
      actualPath = path;
    } else if (typeof path === 'object' && path.url) {
      actualPath = path.url;
    } else {
      return '';
    }

    if (actualPath.startsWith('http')) return actualPath;
    
    // Ensure path starts with a slash for consistent checking
    const cleanPath = actualPath.startsWith('/') ? actualPath : `/${actualPath}`;
    
    // If path already starts with /media, don't double it
    if (cleanPath.startsWith('/media')) {
      return `${BASE_URL}${cleanPath}`;
    }
    
    // Otherwise, assume it's a filename and prepend /media
    return `${BASE_URL}/media${cleanPath}`;
  },

  getQrUrl(): string {
    return `${BASE_URL}/media/qr.png`;
  },

  async authQr(signal?: AbortSignal): Promise<{ status: string } | string> {
    const res = await fetch(`${BASE_URL}/auth/qr`, { headers, signal });
    return handleResponse(res);
  },

  async authPhone(phone: string, code?: string): Promise<{ status: string } | string> {
    const res = await fetch(`${BASE_URL}/auth/phone`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, code }),
    });
    return handleResponse(res);
  },

  async auth2FA(password: string): Promise<{ status: string } | string> {
    const res = await fetch(`${BASE_URL}/auth/2fapassword`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
    });
    return handleResponse(res);
  }
};
