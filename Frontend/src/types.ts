export interface Channel {
  id: number;
  title: string;
  unread_count: number;
  photo?: string;
}

export interface Message {
  id: number;
  text: string;
  date: string;
  media_url?: string;
  media_type?: 'image' | 'audio' | 'video' | 'document';
  channel_id: number;
}

export interface Topic {
  id: number;
  title: string;
}

export interface AuthStatus {
  status: 'authenticated' | 'disconnected' | '2fa_needed' | 'waiting_qr';
  telegram: 'connected' | 'disconnected';
  authorized: boolean;
}
