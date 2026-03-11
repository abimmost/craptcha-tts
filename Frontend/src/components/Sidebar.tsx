import React from 'react';
import { Channel } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Search, Hash } from 'lucide-react';

interface SidebarProps {
  channels: Channel[];
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
  loading: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  channels, 
  activeChannelId, 
  onSelectChannel, 
  loading,
  isOpen,
  onToggle
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isOpen ? '320px' : '0px',
          x: isOpen ? 0 : -320
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        className={`fixed lg:relative h-screen bg-[#151619] border-r border-white/5 flex flex-col z-50 overflow-hidden lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:w-0'
        }`}
      >
        <div className="w-[320px] h-full flex flex-col">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="text-white w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">Craptcha</h2>
            </div>
          </div>

          <div className="p-6 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search channels..." 
                className="w-full bg-black/20 border border-white/5 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            <div className="px-2 mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Your Library</span>
            </div>
            
            {loading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : Array.isArray(channels) ? (
              channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    onSelectChannel(channel.id);
                    if (window.innerWidth < 1024) onToggle();
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group ${
                    activeChannelId === channel.id 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                    activeChannelId === channel.id ? 'bg-white/20' : 'bg-black/20 group-hover:bg-black/40'
                  }`}>
                    {channel.photo ? (
                      <img src={channel.photo} alt="" className="w-full h-full rounded-lg object-cover" />
                    ) : (
                      <Hash className="w-5 h-5 opacity-50" />
                    )}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="text-sm font-semibold truncate">{channel.title}</div>
                    <div className={`text-[10px] ${activeChannelId === channel.id ? 'text-blue-100' : 'text-gray-500'}`}>
                      {channel.unread_count > 0 ? `${channel.unread_count} unread messages` : 'Up to date'}
                    </div>
                  </div>
                  {channel.unread_count > 0 && activeChannelId !== channel.id && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-xs text-gray-500 text-center">No channels found</div>
            )}
          </div>

          <div className="p-4 border-t border-white/5">
            <div className="bg-black/20 rounded-xl p-4">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">System Status</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-400">Telegram Connected</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};
