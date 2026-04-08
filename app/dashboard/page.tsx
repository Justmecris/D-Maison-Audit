'use client';

import { useState, useMemo, useEffect } from 'react';
import { EXPECTED_PARCELS } from '@/app/lib/data';
import { motion } from 'framer-motion';

interface AuditMatch {
  invoiceNumber: string;
  customerName: string;
  orNumber: string;
  status: 'received' | 'missing';
}

interface SalesData {
  monthlyTotal: number;
  monthlyCount: number;
  dailyStats: { date: string; total: number; count: number }[];
}

export default function Dashboard() {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7));

  useEffect(() => {
    fetchSalesData();
  }, [currentMonth]);

  const fetchSalesData = async () => {
    setIsLoadingSales(true);
    try {
      const res = await fetch(`/api/dashboard/sales?month=${currentMonth}`);
      const result = await res.json();
      if (result.success) {
        setSalesData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch sales data:', error);
    } finally {
      setIsLoadingSales(false);
    }
  };

  // --- Dashboard Stats ---
  const stats = [
    { name: 'Total Inventory Value', value: '₱1,284,000', change: '+2.5%', icon: (
      <svg className="w-6 h-6 text-[#947a46]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    ) },
    { name: 'Confirmed Sales', value: salesData ? `${salesData.monthlyCount}` : '...', change: 'Audit Records', icon: (
      <svg className="w-6 h-6 text-[#947a46]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    ) },
    { name: 'Confirmed Revenue', value: salesData ? `₱${salesData.monthlyTotal.toLocaleString()}` : '...', change: `Period: ${currentMonth}`, icon: (
      <svg className="w-6 h-6 text-[#947a46]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
    ) },
    { name: 'Sync Health', value: '100%', change: 'All Records Locked', icon: (
      <svg className="w-6 h-6 text-[#947a46]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
    ) },
  ];

  // --- Reconciliation State ---
  const [manifestInput, setManifestInput] = useState('');
  const [receivingInput, setReceivingInput] = useState('');

  const reconciliation = useMemo(() => {
    const linesA = manifestInput.split('\n').filter(l => l.trim() !== '');
    const manifestData = linesA.map(line => {
      const parts = line.split(/[\t,]/);
      const invoice = parts[0]?.trim();
      let name = parts[1]?.trim();
      if (invoice && !name) {
        const found = EXPECTED_PARCELS.find(p => p.trackingNumber === invoice);
        name = found ? found.recipient : 'Unknown Client';
      }
      return { invoice, name: name || 'Unknown Client' };
    });

    const linesB = receivingInput.split('\n').filter(l => l.trim() !== '');
    const receivingData = linesB.map(line => {
      const parts = line.split(/[\t,]/);
      return { invoice: parts[0]?.trim(), orNumber: parts[1]?.trim() || 'Pending...' };
    });

    const matched: AuditMatch[] = [];
    const missing: AuditMatch[] = [];

    manifestData.forEach(m => {
      if (!m.invoice) return;
      const recv = receivingData.find(r => r.invoice === m.invoice);
      if (recv) {
        matched.push({ invoiceNumber: m.invoice, customerName: m.name, orNumber: recv.orNumber, status: 'received' });
      } else {
        missing.push({ invoiceNumber: m.invoice, customerName: m.name, orNumber: '-', status: 'missing' });
      }
    });

    return { matched, missing, prepared: manifestData.length, scanned: receivingData.length };
  }, [manifestInput, receivingInput]);

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#0f172a] uppercase tracking-wider">Executive Overview</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">D-Maison Real-time Analytics Dashboard</p>
        </div>
        <div className="flex space-x-3">
          <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-colors shadow-sm">
            Export Report
          </button>
          <button className="px-5 py-2.5 bg-[#947a46] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-yellow-900/10">
            Create Sale
          </button>
        </div>
      </header>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-[#947a4610] transition-colors">
                {stat.icon}
              </div>
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-tighter ${
                stat.change.includes('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {stat.change}
              </span>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.name}</p>
            <h3 className="text-2xl font-black text-[#0f172a]">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* RECONCILIATION HUB SECTION */}
      <section className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-serif font-black text-[#0f172a] uppercase tracking-wider">Reconciliation Hub</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Logistics & Parcel Handover Audit</p>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase">Success Rate</p>
              <p className="text-lg font-black text-emerald-600">
                {reconciliation.prepared > 0 ? Math.round((reconciliation.matched.length / reconciliation.prepared) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Input A: Outgoing Manifest</label>
              <textarea 
                value={manifestInput}
                onChange={(e) => setManifestInput(e.target.value)}
                placeholder="Paste Invoice Numbers and Names..."
                className="w-full h-40 p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-[#947a46] focus:outline-none font-mono text-xs transition-all shadow-inner"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Input B: J&T Receiving Log</label>
              <textarea 
                value={receivingInput}
                onChange={(e) => setReceivingInput(e.target.value)}
                placeholder="Paste Invoice and OR Numbers..."
                className="w-full h-40 p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:bg-white focus:border-[#947a46] focus:outline-none font-mono text-xs transition-all shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Matched List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  Verified Handover ({reconciliation.matched.length})
                </h3>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl max-h-60 overflow-y-auto shadow-sm">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">Invoice</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">Client</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">OR#</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reconciliation.matched.map((item, idx) => (
                      <tr key={idx} className="hover:bg-emerald-50/30">
                        <td className="px-4 py-3 font-bold">#{item.invoiceNumber}</td>
                        <td className="px-4 py-3 text-slate-600">{item.customerName}</td>
                        <td className="px-4 py-3 font-mono text-[#947a46]">{item.orNumber}</td>
                      </tr>
                    ))}
                    {reconciliation.matched.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-300 italic">Waiting for scan data...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Missing List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                  Missing Exception ({reconciliation.missing.length})
                </h3>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl max-h-60 overflow-y-auto shadow-sm">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">Invoice</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">Expected Client</th>
                      <th className="px-4 py-3 font-black text-slate-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reconciliation.missing.map((item, idx) => (
                      <tr key={idx} className="bg-rose-50/10">
                        <td className="px-4 py-3 font-bold">#{item.invoiceNumber}</td>
                        <td className="px-4 py-3 text-slate-600">{item.customerName}</td>
                        <td className="px-4 py-3 font-black text-rose-500">NOT SCANNED</td>
                      </tr>
                    ))}
                    {reconciliation.missing.length === 0 && reconciliation.prepared > 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-emerald-600 font-bold uppercase">All Parcels Accounted For</td></tr>
                    )}
                    {reconciliation.prepared === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-300 italic">No manifest loaded...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Sales Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <div>
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm">Monthly Sales Breakdown</h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aggregated from confirmed audit files</p>
            </div>
            <div className="flex items-center gap-3">
              <input 
                type="month" 
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase focus:ring-2 focus:ring-[#947a46] outline-none"
              />
              <button onClick={fetchSalesData} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase">Audit Date</th>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase text-right">Daily Total</th>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase text-right">Orders</th>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase text-right">Avg / Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {salesData?.dailyStats.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-black text-[#0f172a]">{new Date(stat.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase()}</td>
                    <td className="px-6 py-4 text-right font-black text-[#947a46]">₱{stat.total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-500">{stat.count} items</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-400 italic">₱{(stat.total / stat.count).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
                {(!salesData || salesData.dailyStats.length === 0) && (
                  <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-300 italic lowercase tracking-widest">no confirmed sales recorded for this period...</td></tr>
                )}
              </tbody>
              {salesData && salesData.dailyStats.length > 0 && (
                <tfoot className="bg-slate-900 text-white sticky bottom-0 z-10">
                  <tr>
                    <td className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Monthly Accumulation</td>
                    <td className="px-6 py-4 text-right font-black text-[#947a46]">₱{salesData.monthlyTotal.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-400">{salesData.monthlyCount}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h2 className="font-black text-slate-900 uppercase tracking-widest text-sm">Priority Repairs</h2>
          </div>
          <div className="p-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-white transition-colors">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Rolex Submariner</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Calibration • Ref #82{i}9</p>
                  </div>
                </div>
                <span className="text-[9px] font-black text-[#947a46] uppercase border border-[#947a4640] px-2 py-0.5 rounded">Urgent</span>
              </div>
            ))}
          </div>
          <button className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-t border-slate-50 hover:bg-slate-50 transition-colors">
            View All Work Orders
          </button>
        </div>
      </div>
    </div>
  );
}
