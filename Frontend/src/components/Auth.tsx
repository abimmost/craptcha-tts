import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { motion } from 'motion/react';
import { QrCode, Phone, Lock, Loader2 } from 'lucide-react';

interface AuthProps {
  onAuthenticated: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthenticated }) => {
  const [method, setMethod] = useState<'qr' | 'phone'>('qr');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'initial' | 'code' | '2fa'>('initial');
  const [loading, setLoading] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (method === 'qr') {
      const interval = setInterval(() => setQrKey(prev => prev + 1), 5000);
      startQrAuth();
      return () => {
        clearInterval(interval);
        abortControllerRef.current?.abort();
      };
    }
  }, [method]);

  const startQrAuth = async () => {
    if (method !== 'qr' || step !== 'initial') return;
    
    // Abort previous request if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const res = await api.authQr(abortControllerRef.current.signal);
      // Handle both string and object responses
      const status = typeof res === 'string' ? res : res.status;
      
      console.log('QR Auth Status:', status);

      if (status === 'authenticated') {
        onAuthenticated();
      } else if (status === '2fa_needed') {
        setStep('2fa');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('QR Auth Error:', e);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.authPhone(phone);
      const status = typeof res === 'string' ? res : res.status;
      if (status === 'code_sent') setStep('code');
    } catch (e) {
      alert('Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.authPhone(phone, code);
      const status = typeof res === 'string' ? res : res.status;
      if (status === 'authenticated') onAuthenticated();
      if (status === '2fa_needed') setStep('2fa');
    } catch (e) {
      alert('Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.auth2FA(password);
      const status = typeof res === 'string' ? res : res.status;
      if (status === 'authenticated') onAuthenticated();
    } catch (e) {
      alert('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#151619] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#1a1b1e] border border-white/10 rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
            <QrCode className="text-blue-500 w-8 h-8" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2">Telegram Login</h1>
        <p className="text-gray-400 text-center mb-8">Connect your account to start reading</p>

        {step === 'initial' && (
          <div className="space-y-6">
            <div className="flex p-1 bg-black/20 rounded-lg mb-6">
              <button 
                onClick={() => setMethod('qr')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${method === 'qr' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                QR Code
              </button>
              <button 
                onClick={() => setMethod('phone')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${method === 'phone' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Phone
              </button>
            </div>

            {method === 'qr' ? (
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-xl mb-4">
                  <img 
                    src={`${api.getQrUrl()}?t=${qrKey}`} 
                    alt="QR Code" 
                    className="w-48 h-48"
                    onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/200?text=Generating+QR...')}
                  />
                </div>
                <p className="text-sm text-gray-500 text-center">
                  Scan this code with your Telegram app<br/>
                  <span className="text-xs opacity-50 italic">Settings {'>'} Devices {'>'} Link Desktop Device</span>
                </p>
              </div>
            ) : (
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                      type="tel" 
                      placeholder="+1234567890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-black/30 border border-white/5 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                      required
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                </button>
              </form>
            )}
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Verification Code</label>
              <input 
                type="text" 
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-black/30 border border-white/5 rounded-lg py-3 px-4 text-white text-center text-2xl tracking-[1em] focus:outline-none focus:border-blue-500/50 transition-colors"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Code'}
            </button>
            <button 
              type="button"
              onClick={() => setStep('initial')}
              className="w-full text-gray-500 hover:text-gray-300 text-sm"
            >
              Back to phone
            </button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handle2FASubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Two-Factor Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="password" 
                  placeholder="Your cloud password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/30 border border-white/5 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  required
                />
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock Account'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
