import { AuthStatus, Channel, Message, Topic } from './types';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url) {
    throw new Error('CONFIG_MISSING: VITE_API_URL is not defined.');
  }
  return url;
};

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
  getHealth(signal?: AbortSignal): Promise<AuthStatus> {
    const url = getBaseUrl();
    return fetch(`${url}/health`, { headers, signal }).then(handleResponse);
  },

  getChannels(signal?: AbortSignal): Promise<Channel[] | { channels: Channel[] }> {
    const url = getBaseUrl();
    return fetch(`${url}/channels`, { headers, signal }).then(handleResponse);
  },

  selectChannel(channelId: number, signal?: AbortSignal): Promise<void> {
    const url = getBaseUrl();
    return fetch(`${url}/channels/select`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel_id: channelId }),
      signal
    }).then(handleResponse);
  },

  getMessage(direction: 'ahead' | 'behind' | 'current' = 'current', offsetId?: number, signal?: AbortSignal): Promise<Message | { message: Message }> {
    const baseUrl = getBaseUrl();
    const url = new URL(`${baseUrl}/messages`);
    url.searchParams.append('direction', direction);
    if (offsetId) url.searchParams.append('offset_id', offsetId.toString());
    return fetch(url.toString(), { headers, signal }).then(handleResponse);
  },

  getTopics(signal?: AbortSignal): Promise<Topic[] | { topics: Topic[] }> {
    const url = getBaseUrl();
    return fetch(`${url}/topics`, { headers, signal }).then(handleResponse);
  },

  forwardMessage(sourceChannelId: number, messageId: number, topicId: number): Promise<void> {
    const url = getBaseUrl();
    return fetch(`${url}/forward`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_channel_id: sourceChannelId,
        message_id: messageId,
        topic_id: topicId,
      }),
    }).then(handleResponse);
  },

  async streamTTS(text: string, voice: string, speed: number): Promise<Response> {
    const url = getBaseUrl();
    const res = await fetch(`${url}/tts-stream`, {
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
    
    const baseUrl = getBaseUrl();
    // Ensure path starts with a slash for consistent checking
    const cleanPath = actualPath.startsWith('/') ? actualPath : `/${actualPath}`;
    
    // If path already starts with /media, don't double it
    if (cleanPath.startsWith('/media')) {
      return `${baseUrl}${cleanPath}`;
    }
    
    // Otherwise, assume it's a filename and prepend /media
    return `${baseUrl}/media${cleanPath}`;
  },

  getQrUrl(): string {
    const url = getBaseUrl();
    return `${url}/media/qr.png`;
  },

  authQr(signal?: AbortSignal): Promise<{ status: string } | string> {
    const url = getBaseUrl();
    return fetch(`${url}/auth/qr`, { headers, signal }).then(handleResponse);
  },

  authPhone(phone: string, code?: string): Promise<{ status: string } | string> {
    const url = getBaseUrl();
    return fetch(`${url}/auth/phone`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, code }),
    }).then(handleResponse);
  },

  auth2FA(password: string): Promise<{ status: string } | string> {
    const url = getBaseUrl();
    return fetch(`${url}/auth/2fapassword`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
    }).then(handleResponse);
  }
};
