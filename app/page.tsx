'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate Authentication
    if (email && password) {
      localStorage.setItem('user', JSON.stringify({ email, role }));
      router.push('/dashboard'); 
    } else {
      alert("Please enter credentials");
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-[#0f172a] p-10 text-center">
          <h1 className="text-4xl font-serif text-white tracking-widest uppercase">D-MAISON</h1>
          <p className="text-[#947a46] text-xs mt-2 uppercase font-bold tracking-[0.2em]">Luxury Jewelry Audit & POS</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-10 space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">System Access Role</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => setRole('STAFF')}
                className={`py-3 rounded-lg font-bold border-2 transition-all text-xs tracking-wider uppercase ${
                  role === 'STAFF' ? 'border-[#947a46] bg-[#947a46] text-white' : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
              >
                Staff
              </button>
              <button 
                type="button"
                onClick={() => setRole('ADMIN')}
                className={`py-3 rounded-lg font-bold border-2 transition-all text-xs tracking-wider uppercase ${
                  role === 'ADMIN' ? 'border-[#0f172a] bg-[#0f172a] text-white' : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="group">
              <input 
                type="email" 
                placeholder="Corporate Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#947a46] font-medium text-sm transition-all"
              />
            </div>
            <div className="group">
              <input 
                type="password" 
                placeholder="Access Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#947a46] font-medium text-sm transition-all"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-[#0f172a] text-white py-4 rounded-lg font-bold text-sm uppercase tracking-[0.1em] hover:bg-slate-800 transition-all shadow-lg"
          >
            Authenticate Session
          </button>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">
              Proprietary System of D-Maison.<br/>Secure biometric-encrypted access enabled.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
