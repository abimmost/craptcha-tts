import React, { useState, useEffect, useRef } from 'react';
import { Message, Topic, MediaItem } from '../types';
import { api } from '../api';
import { PCMPlayer } from '../utils/PCMPlayer';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Square, 
  Volume2, 
  Settings2, 
  Share2, 
  Image as ImageIcon,
  FileText,
  Clock,
  Zap,
  Menu,
  MessageSquare,
  RefreshCw,
  Music,
  Video,
  File
} from 'lucide-react';

interface ReaderProps {
  activeChannelId: number | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onMessageRead: (channelId: number) => void;
}

const VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];
const SPEEDS = [0.5, 1.0, 1.25, 1.5];

export const Reader: React.FC<ReaderProps> = ({ activeChannelId, sidebarOpen, onToggleSidebar, onMessageRead }) => {
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState('Zephyr');
  const [speed, setSpeed] = useState(1.0);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [mediaHistory, setMediaHistory] = useState<MediaItem[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const playerRef = useRef<PCMPlayer | null>(null);
  const isFirstLoad = useRef(true);
  const autoScrollRef = useRef(autoScroll);
  const abortControllerRef = useRef<AbortController | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setShowShare(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (autoScroll && !playing && message) {
      fetchMessage('ahead', message.id);
    }
  }, [autoScroll]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (activeChannelId) {
      stopPlayback(); // Stop any ongoing playback immediately
      const savedMessageId = localStorage.getItem(`lastMessageId_${activeChannelId}`);
      fetchMessage('current', savedMessageId ? parseInt(savedMessageId) : undefined);
      fetchTopics();
      setMediaHistory([]); // Reset media when channel changes
      setSelectedMediaIndex(0);
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (message) {
      // Extract media items from the current message
      const items: MediaItem[] = [];
      
      const processMedia = (m: any, type?: string) => {
        if (!m) return;
        if (typeof m === 'string') {
          items.push({ url: m, type: (type || message.media_type) as any });
        } else if (Array.isArray(m)) {
          m.forEach(item => processMedia(item));
        } else if (typeof m === 'object' && m.url) {
          items.push({ url: m.url, type: (m.type || type || message.media_type) as any });
        }
      };

      processMedia(message.media);
      if (items.length === 0 && message.media_url) {
        items.push({ url: message.media_url, type: message.media_type as any });
      }

      setMediaHistory(items);
      setSelectedMediaIndex(0);

      if (activeChannelId) {
        localStorage.setItem(`lastMessageId_${activeChannelId}`, message.id.toString());
      }
      
      if (message.text) {
        // Only auto-play if it's not the initial load OR if auto-scroll is enabled
        // This prevents browser autoplay blocks on page reload
        if (!isFirstLoad.current || autoScroll) {
          startPlayback();
        }
      } else if (autoScroll) {
        if (items.length > 0) {
          // If message has media but no text, don't skip immediately.
          // Stay for a few seconds to let the user see/hear it.
          const timer = setTimeout(() => {
            if (autoScrollRef.current) {
              fetchMessage('ahead', message.id);
            }
          }, 8000); // 8 seconds for media-only messages
          return () => clearTimeout(timer);
        } else {
          // Skip messages with no text content AND no media during auto scroll
          fetchMessage('ahead', message.id);
        }
      }
      
      isFirstLoad.current = false;
    }
  }, [message, autoScroll]);

  const fetchMessage = async (direction: 'ahead' | 'behind' | 'current', offsetId?: number) => {
    // Abort previous fetch if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    if (playing) stopPlayback();
    try {
      // Workaround: if direction is 'current', increment offsetId by 1 
      // because the backend's offset_id is exclusive (returns messages older than offset)
      const effectiveOffsetId = (direction === 'current' && offsetId) ? offsetId + 1 : offsetId;
      const data = await api.getMessage(direction, effectiveOffsetId, abortControllerRef.current.signal);
      // Handle both raw message and object with message property
      let newMessage: Message | null = null;
      if (data && typeof data === 'object' && 'message' in data) {
        newMessage = data.message as Message;
      } else {
        newMessage = data as Message;
      }
      
      if (newMessage && activeChannelId) {
        setMessage(newMessage);
        onMessageRead(activeChannelId);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Failed to fetch message:', e);
      setMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async () => {
    try {
      const data = await api.getTopics(abortControllerRef.current?.signal);
      // Handle both raw array and object with topics property
      if (Array.isArray(data)) {
        setTopics(data);
      } else if (data && typeof data === 'object' && 'topics' in data && Array.isArray((data as any).topics)) {
        setTopics((data as any).topics);
      } else {
        setTopics([]);
      }
    } catch (e) {
      console.error('Failed to fetch topics:', e);
      setTopics([]);
    }
  };

  const startPlayback = async () => {
    if (!message) return;
    setPlaying(true);
    if (!playerRef.current) playerRef.current = new PCMPlayer();
    
    try {
      const response = await api.streamTTS(message.text, voice, speed);
      await playerRef.current.playStream(response, () => {
        setPlaying(false);
        if (autoScrollRef.current) {
          fetchMessage('ahead', message.id);
        }
      });
    } catch (e) {
      console.error(e);
      setPlaying(false);
    }
  };

  const stopPlayback = () => {
    if (playerRef.current) {
      playerRef.current.stop();
    }
    setPlaying(false);
  };

  const handleForward = async (topicId: number) => {
    if (!message || !activeChannelId) return;
    try {
      await api.forwardMessage(activeChannelId, message.id, topicId);
      alert('Forwarded successfully!');
    } catch (e) {
      alert('Failed to forward');
    }
  };

  if (!activeChannelId) {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center bg-[#0a0b0d] text-gray-500">
        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
          <Zap className="w-10 h-10 opacity-20" />
        </div>
        <h2 className="text-xl font-medium mb-2">No Channel Selected</h2>
        <p className="text-sm">Select a channel from the sidebar to start reading</p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen flex flex-col bg-[#0a0b0d] overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-[#151619] z-50 relative">
        <div className="flex items-center gap-6">
          <button 
            onClick={onToggleSidebar}
            className="p-2.5 bg-black/40 border border-white/5 rounded-xl text-gray-400 hover:text-white transition-all"
            title={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-black/40 rounded-lg p-1 border border-white/5">
            <button 
              onClick={() => fetchMessage('behind', message?.id)}
              className="p-2 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <button 
              onClick={() => fetchMessage('ahead', message?.id)}
              className="p-2 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setAutoScroll(!autoScroll);
              setShowShare(false);
              setShowSettings(false);
            }}
            className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 ${
              autoScroll ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
            }`}
            title="Auto Scroll"
          >
            <motion.div
              animate={autoScroll ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              <RefreshCw className="w-5 h-5" />
            </motion.div>
            <span className="text-xs font-bold hidden md:inline">Auto Scroll</span>
          </button>
          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => {
                setShowSettings(!showSettings);
                setShowShare(false);
              }}
              className={`p-2.5 rounded-xl transition-all border ${
                showSettings ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
          <div className="relative" ref={shareRef}>
            <button 
              onClick={() => {
                setShowShare(!showShare);
                setShowSettings(false);
              }}
              className={`p-2.5 border rounded-xl transition-all ${
                showShare ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Share2 className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showShare && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[#232429] border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] p-2"
                >
                  <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Forward to Topic</div>
                  {topics.map(topic => (
                    <button 
                      key={topic.id}
                      onClick={() => {
                        handleForward(topic.id);
                        setShowShare(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-lg transition-all"
                    >
                      {topic.title}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-12">
          
          {/* Settings Bar */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-6 p-6 bg-[#151619] rounded-2xl border border-white/5 mb-8">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Voice Engine</label>
                    <div className="grid grid-cols-3 gap-2">
                      {VOICES.map(v => (
                        <button 
                          key={v}
                          onClick={() => setVoice(v)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all border ${
                            voice === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Playback Speed</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SPEEDS.map(s => (
                        <button 
                          key={s}
                          onClick={() => setSpeed(s)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all border ${
                            speed === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:border-white/20'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Media Gallery (Collection) */}
          {mediaHistory.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Media Collection</h3>
                </div>
                <span className="text-[10px] text-gray-600">{mediaHistory.length} items in this message</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {mediaHistory.map((m, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedMediaIndex(idx)}
                      className={`flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border transition-all relative group ${
                        selectedMediaIndex === idx ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-white/5 hover:border-white/20'
                      }`}
                    >
                      {m.type === 'audio' ? (
                        <div className="w-full h-full bg-blue-600/20 flex items-center justify-center">
                          <Music className="w-8 h-8 text-blue-400" />
                        </div>
                      ) : m.type === 'video' ? (
                        <div className="w-full h-full bg-red-600/20 flex items-center justify-center">
                          <Video className="w-8 h-8 text-red-400" />
                        </div>
                      ) : m.type === 'document' ? (
                        <div className="w-full h-full bg-emerald-600/20 flex items-center justify-center">
                          <FileText className="w-8 h-8 text-emerald-400" />
                        </div>
                      ) : (
                        <img 
                          src={api.getMediaUrl(m.url)} 
                          alt="" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {m.type === 'audio' && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Display */}
          <div className="relative group">
            <div className="absolute -left-12 top-0 h-full w-1 bg-blue-600/20 rounded-full overflow-hidden">
              {playing && (
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '100%' }}
                  transition={{ duration: 10, ease: "linear" }}
                  className="w-full bg-blue-500"
                />
              )}
            </div>

            {loading ? (
              <div className="space-y-4">
                <div className="h-8 bg-white/5 rounded-lg w-3/4 animate-pulse" />
                <div className="h-8 bg-white/5 rounded-lg w-full animate-pulse" />
                <div className="h-8 bg-white/5 rounded-lg w-1/2 animate-pulse" />
              </div>
            ) : message ? (
              <div className="space-y-8">
                {mediaHistory.length > 0 && mediaHistory[selectedMediaIndex] && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black/40"
                  >
                    {mediaHistory[selectedMediaIndex].type === 'audio' ? (
                      <div className="p-12 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600/20 to-purple-600/20">
                        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20">
                          <Music className="text-white w-10 h-10" />
                        </div>
                        <audio 
                          src={api.getMediaUrl(mediaHistory[selectedMediaIndex].url)} 
                          controls 
                          className="w-full max-w-md"
                        />
                        <p className="mt-4 text-sm text-gray-400 font-medium">Audio Attachment</p>
                      </div>
                    ) : mediaHistory[selectedMediaIndex].type === 'video' ? (
                      <video 
                        src={api.getMediaUrl(mediaHistory[selectedMediaIndex].url)} 
                        controls 
                        className="w-full h-auto max-h-[500px]"
                      />
                    ) : mediaHistory[selectedMediaIndex].type === 'document' ? (
                      <div className="p-12 flex flex-col items-center justify-center bg-white/5">
                        <FileText className="w-16 h-16 text-gray-500 mb-4" />
                        <a 
                          href={api.getMediaUrl(mediaHistory[selectedMediaIndex].url)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-6 py-2 bg-blue-600 rounded-lg text-white font-bold hover:bg-blue-700 transition-all"
                        >
                          Download Document
                        </a>
                      </div>
                    ) : (
                      <img 
                        src={api.getMediaUrl(mediaHistory[selectedMediaIndex].url)} 
                        alt="Scraped Media" 
                        className="w-full h-auto max-h-[500px] object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="absolute top-4 left-4 flex gap-2">
                      <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
                        {mediaHistory[selectedMediaIndex].type === 'audio' ? <Music className="w-3.5 h-3.5 text-blue-400" /> :
                         mediaHistory[selectedMediaIndex].type === 'video' ? <Video className="w-3.5 h-3.5 text-red-400" /> :
                         mediaHistory[selectedMediaIndex].type === 'document' ? <File className="w-3.5 h-3.5 text-emerald-400" /> :
                         <ImageIcon className="w-3.5 h-3.5 text-blue-400" />}
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                          {mediaHistory[selectedMediaIndex].type || 'Media'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="prose prose-invert max-w-none">
                  <p className="text-2xl leading-relaxed text-gray-200 font-light tracking-tight selection:bg-blue-500/30">
                    {message.text || <span className="italic text-gray-600">No text content in this message.</span>}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-gray-600">
                Failed to load message.
              </div>
            )}
          </div>

          {/* Animated Ad Section */}
          <AnimatePresence>
            {playing && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-12 p-8 bg-gradient-to-br from-blue-600/10 to-violet-600/10 border border-blue-500/20 rounded-3xl relative overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-full h-full">
                  <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_50%)] from-blue-500/10 animate-[spin_10s_linear_infinite]" />
                </div>
                
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <Zap className="text-white w-8 h-8" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Sponsored Content</div>
                      <h3 className="text-xl font-bold text-white mb-1">Upgrade to Pro Reader</h3>
                      <p className="text-sm text-gray-400">Unlock unlimited channels and offline listening.</p>
                    </div>
                  </div>
                  <button className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition-all text-sm">
                    Learn More
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="h-24 border-t border-white/5 bg-[#151619] flex items-center justify-center px-8 relative">
        <div className="absolute left-8 flex items-center gap-6">
          <div className="text-xs font-mono text-gray-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            MSG_ID: {message?.id || '---'}
          </div>
        </div>

        <div className="flex items-center gap-12">
          <button 
            onClick={() => fetchMessage('behind', message?.id)}
            className="group flex flex-col items-center gap-2 text-gray-500 hover:text-white transition-all"
          >
            <ChevronLeft className="w-10 h-10 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Previous</span>
          </button>
          
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  animate={playing ? { height: [4, 16, 4] } : { height: 4 }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                  className="w-1 bg-blue-500 rounded-full"
                />
              ))}
            </div>
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              {playing ? 'Streaming Live' : 'Idle'}
            </span>
          </div>

          <button 
            onClick={() => fetchMessage('ahead', message?.id)}
            className="group flex flex-col items-center gap-2 text-gray-500 hover:text-white transition-all"
          >
            <ChevronRight className="w-10 h-10 group-hover:translate-x-1 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Next</span>
          </button>
        </div>

        <div className="absolute right-8 flex items-center gap-4 text-xs font-mono text-gray-500">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-white">{message?.date ? new Date(message.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '---'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
