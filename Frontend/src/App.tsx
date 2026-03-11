import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { Reader } from './components/Reader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api } from './api';
import { Channel } from './types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    // Close sidebar by default on mobile
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    checkAuth();
    return () => abortControllerRef.current?.abort();
  }, []);

  const checkAuth = async () => {
    // Abort previous check if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const status = await api.getHealth(abortControllerRef.current.signal);
      // If "authorized" returns true, skip the login.
      if (status && typeof status === 'object' && status.authorized === true) {
        setAuthenticated(true);
        await fetchChannels();
        
        // Fetch the last read message to resume state
        try {
          const data = await api.getMessage('current');
          let lastMessage: any = null;
          if (data && typeof data === 'object' && 'message' in data) {
            lastMessage = data.message;
          } else {
            lastMessage = data;
          }

          if (lastMessage && lastMessage.channel_id) {
            setActiveChannelId(lastMessage.channel_id);
            await api.selectChannel(lastMessage.channel_id);
          }
        } catch (e) {
          console.error('Failed to resume last message:', e);
        }
      } else {
        setAuthenticated(false);
        setLoading(false);
      }
    } catch (e) {
      // Only log if not an abort error
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Auth check failed:', e);
      setAuthenticated(false);
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    // Abort previous fetch if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const data = await api.getChannels(abortControllerRef.current.signal);
      let channelList: Channel[] = [];
      // Handle both raw array and object with channels property
      if (Array.isArray(data)) {
        channelList = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.channels)) {
        channelList = data.channels;
      }
      
      setChannels(channelList);
      return channelList;
    } catch (e) {
      // Only log if not an abort error
      if (e instanceof Error && e.name === 'AbortError') return [];
      
      console.error('Failed to fetch channels:', e);
      setChannels([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChannel = async (id: number) => {
    try {
      await api.selectChannel(id);
      setActiveChannelId(id);
    } catch (e) {
      console.error(e);
      setActiveChannelId(id);
    }
  };

  const handleDecrementUnread = (channelId: number) => {
    setChannels(prev => prev.map(ch => {
      if (ch.id === channelId && ch.unread_count > 0) {
        return { ...ch, unread_count: ch.unread_count - 1 };
      }
      return ch;
    }));
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-[#151619] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {authenticated ? (
        <div className="flex h-screen bg-[#0a0b0d] text-white overflow-hidden relative">
          <Sidebar 
            channels={channels} 
            activeChannelId={activeChannelId} 
            onSelectChannel={handleSelectChannel}
            loading={loading}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          <Reader 
            activeChannelId={activeChannelId} 
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onMessageRead={handleDecrementUnread}
          />
        </div>
      ) : (
        <Auth onAuthenticated={() => {
          setAuthenticated(true);
          fetchChannels();
        }} />
      )}
    </ErrorBoundary>
  );
}
