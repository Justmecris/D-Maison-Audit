'use client';

import { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

interface ManifestItem {
  invoiceNumber: string;
  customerName: string;
  scanned: boolean;
  scanTime?: string;
  isDuplicate?: boolean;
}

export default function JntReconciliation() {
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [highlightedInvoice, setHighlightedInvoice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING'>('ALL');
  const [syncSource, setSyncSource] = useState<'google' | 'onedrive' | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const filteredManifest = useMemo(() => {
    let list = manifest;
    
    // 1. Apply Status Filter
    if (activeFilter === 'VERIFIED') list = list.filter(item => item.scanned);
    if (activeFilter === 'PENDING') list = list.filter(item => !item.scanned);

    // 2. Apply Search Filter
    const search = scanInput.toLowerCase().trim();
    if (!search || search.includes('\n') || search.includes('\t')) return list;
    
    return list.filter(item => 
      item.invoiceNumber.toLowerCase().includes(search) || 
      item.customerName.toLowerCase().includes(search)
    );
  }, [manifest, scanInput, activeFilter]);

  // Auto-verify on exact match (Zero-delay Instant Scan)
  useEffect(() => {
    const input = scanInput.trim().toLowerCase();
    // Immediate check for standard J&T length (usually 12)
    if (input.length >= 12 && !input.includes('\n')) {
      const match = manifest.find(item => item.invoiceNumber.toLowerCase() === input);
      if (match && !match.scanned) {
        handleScan(new Event('submit') as any);
      }
    }
  }, [scanInput, manifest]);

  // Load persistent data from SQLite on mount
  const loadPersistentData = async () => {
    try {
      const res = await fetch('/api/sync/sheets'); // Primary source
      const result = await res.json();
      if (result.success && result.data) {
        const formatted = result.data.map((item: any) => ({
          invoiceNumber: item.invoice_number,
          customerName: item.customer_name,
          scanned: item.status === 'VERIFIED',
          scanTime: item.scanned_at,
          isDuplicate: !!item.is_duplicate
        }));
        setManifest(formatted);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  useEffect(() => {
    loadPersistentData();

    // Setup Auto-Sync Polling (every 30 seconds)
    const interval = setInterval(loadPersistentData, 30000);
    return () => clearInterval(interval);
  }, []);

  // 1. Manual Sync with Google Sheets or OneDrive
  const syncData = async (source: 'google' | 'onedrive') => {
    setIsSyncing(true);
    setSyncSource(source);
    const endpoint = source === 'google' ? '/api/sync/sheets' : '/api/sync/onedrive';
    
    try {
      const res = await fetch(endpoint);
      const result = await res.json();
      if (result.success) {
        const formatted = result.data.map((item: any) => ({
          invoiceNumber: item.invoice_number,
          customerName: item.customer_name,
          scanned: item.status === 'VERIFIED',
          scanTime: item.scanned_at,
          isDuplicate: !!item.is_duplicate
        }));
        setManifest(formatted);
      } else {
        alert(result.error || `Sync from ${source} failed.`);
      }
    } catch (error) {
      alert(`Network error during ${source} sync.`);
    } finally {
      setIsSyncing(false);
      setSyncSource(null);
    }
  };

  // 2. High Performance Scan/Type Event
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = scanInput.trim().toLowerCase();
    
    if (!input) return;

    // Fast local check
    const index = manifest.findIndex(item => 
      item.invoiceNumber.toLowerCase() === input || 
      item.customerName.toLowerCase().includes(input)
    );
    
    if (index !== -1) {
      const matchedItem = manifest[index];
      const scanTime = new Date().toLocaleTimeString();
      
      // 1. Update Persistent Storage (Fire & Forget for speed)
      fetch('/api/sync/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: matchedItem.invoiceNumber,
          status: 'VERIFIED',
          scanTime: scanTime
        })
      });

      // 2. Update Local State (Immediate)
      const updatedManifest = [...manifest];
      updatedManifest[index] = { 
        ...updatedManifest[index], 
        scanned: true,
        scanTime: scanTime
      };
      
      setManifest(updatedManifest);
      setLastScanned(`${matchedItem.customerName} - #${matchedItem.invoiceNumber}`);
      setHighlightedInvoice(matchedItem.invoiceNumber);
      setScanInput('');

      // Clear highlight after 5 seconds
      setTimeout(() => setHighlightedInvoice(null), 5000);

      // 3. Smooth Auto-scroll
      setTimeout(() => {
        const element = document.getElementById(`invoice-${matchedItem.invoiceNumber}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      // Logic: If invoice number already exists in the sheet, the system should highlight it as a duplicate
      // (This is handled by the `isDuplicate` flag from the server sync)
      alert(`No record found for "${scanInput}". Please check the manifest.`);
      setScanInput('');
    }
  };

  // 3. Manual File Upload & Paste Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        // Skip header, process rows
        // Expecting: Column B (1) as Customer, Column C (2) as Invoice
        const extracted = data.slice(1).map(row => ({
          customerName: String(row[1] || 'Unknown').trim(),
          invoiceNumber: String(row[2] || '').trim(),
        })).filter(item => item.invoiceNumber !== '');

        await bulkSync(extracted);
      } catch (error: any) {
        alert(`Error parsing file: ${error.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteSync = async () => {
    const lines = scanInput.split('\n').filter(l => l.trim() !== '');
    if (lines.length <= 1 && !scanInput.includes('\t')) {
       // Normal scan mode
       return;
    }

    const extracted = lines.map(line => {
      // Split by tab (Excel/Google Sheets) or comma
      const parts = line.split(/[\t,]/);
      let p1 = parts[0]?.trim() || '';
      let p2 = parts[1]?.trim() || '';
      
      let invoice = '';
      let name = '';

      // J&T Express Tracker format: Usually 12 digits or starts with JT
      // Example: 920000000000, 700000000000, JT1234567890
      const isInvoice = (str: string) => {
        const clean = str.replace(/[^0-9A-Z]/gi, '');
        return clean.match(/^(JT)?[0-9]{8,15}$/i) || (clean.length >= 8 && /^[0-9]+$/.test(clean));
      };

      if (isInvoice(p2)) {
        invoice = p2;
        name = p1 || 'Unknown Client';
      } else if (isInvoice(p1)) {
        invoice = p1;
        name = p2 || 'Unknown Client';
      } else if (p1 && p2) {
        // Fallback: Assume Column 1 is Name, Column 2 is Invoice (B:C)
        // If neither looks exactly like an invoice, we still take p2 as invoice
        name = p1;
        invoice = p2;
      } else if (p1) {
        // Only one column - if it has numbers, treat as invoice
        if (p1.match(/[0-9]{5,}/)) {
          invoice = p1;
          name = 'Unknown Client';
        } else {
          return null;
        }
      }

      return { invoiceNumber: invoice, customerName: name };
    }).filter((item): item is {invoiceNumber: string, customerName: string} => 
      item !== null && item.invoiceNumber !== ''
    );

    console.log('[DEBUG] Extracted from paste:', extracted);
    try {
      await bulkSync(extracted);
      setScanInput('');
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    }
  };

  const bulkSync = async (items: {invoiceNumber: string, customerName: string}[]) => {
    if (items.length === 0) {
      alert("No valid invoice numbers found in your paste. Ensure you are copying at least two columns (e.g. Name and Invoice Number).");
      return;
    }

    setIsSyncing(true);
    try {
      // Sync to server using the new bulk endpoint
      const response = await fetch('/api/sync/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      
      const result = await response.json();
      if (result.success) {
        // Refresh local table immediately
        await loadPersistentData();
        alert(`Successfully synced ${items.length} records. Total records in system: ${result.total || 'Updated'}`);
      } else {
        throw new Error(result.error || 'Server rejected the data');
      }
    } catch (error: any) {
      console.error('Bulk sync error:', error);
      alert(`Bulk sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const stats = {
    total: manifest.length,
    scanned: manifest.filter(m => m.scanned).length,
    remaining: manifest.filter(m => !m.scanned).length,
    duplicates: manifest.filter(m => m.isDuplicate).length
  };

  const toggleZoom = () => {
    setZoomLevel(prev => prev === 1 ? 1.25 : 1);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="border-b border-slate-100 pb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#0f172a] uppercase tracking-wider">J&T <span className="text-rose-500">Counter Checking</span></h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">High-Speed Cloud Integration Protocol</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => document.getElementById('fileUpload')?.click()}
            className="px-6 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            📁 Upload Excel
            <input 
              id="fileUpload"
              type="file" 
              className="hidden" 
              accept=".xlsx,.xls,.csv" 
              onChange={handleFileUpload} 
            />
          </button>
        </div>
      </header>

      {/* Control Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm space-y-6">
            <div className="space-y-4">
              <form onSubmit={handleScan} className="space-y-4">
                <textarea 
                  rows={4}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Search Invoice"
                  className="w-full px-5 py-4 bg-rose-50 border-2 border-rose-100 rounded-2xl focus:border-rose-500 focus:outline-none font-mono text-sm font-black transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (scanInput.includes('\t') || scanInput.includes('\n')) {
                        handlePasteSync();
                      } else {
                        handleScan(e);
                      }
                    }
                  }}
                />
                {(scanInput.includes('\t') || scanInput.split('\n').filter(l => l.trim()).length > 1) && (
                  <button 
                    type="button"
                    onClick={handlePasteSync}
                    className="w-full py-3 bg-emerald-500 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-emerald-500/20"
                  >
                    ⚡ Sync Pasted Data ({scanInput.split('\n').filter(l => l.trim()).length} rows)
                  </button>
                )}
              </form>
              <p className="text-[9px] text-slate-400 italic">Pasting multi-line data will trigger bulk sync</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <StatCard 
              label="Cloud Records" 
              value={stats.total} 
              color="slate" 
              onClick={() => setActiveFilter('ALL')}
              active={activeFilter === 'ALL'}
            />
            <StatCard 
              label="Verified" 
              value={stats.scanned} 
              color="emerald" 
              onClick={() => setActiveFilter('VERIFIED')}
              active={activeFilter === 'VERIFIED'}
            />
            <StatCard 
              label="Pending" 
              value={stats.remaining} 
              color="rose" 
              onClick={() => setActiveFilter('PENDING')}
              active={activeFilter === 'PENDING'}
            />
            {stats.duplicates > 0 && <StatCard label="Duplicates" value={stats.duplicates} color="amber" />}
          </div>
        </div>

        {/* Live Table Area */}
        <motion.div 
          animate={{ scale: zoomLevel }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ transformOrigin: 'top right' }}
          className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex flex-col h-[700px] will-change-transform"
        >
          <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Active Verification Table</h3>
            {lastScanned && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <p className="text-[10px] font-black text-emerald-600 uppercase">Last Scanned: #{lastScanned}</p>
              </motion.div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase border-b border-slate-50">Invoice Number</th>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase border-b border-slate-50">Customer Name</th>
                  <th className="px-6 py-4 font-black text-slate-400 uppercase border-b border-slate-50 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans">
                {filteredManifest.map((item) => (
                  <tr 
                    key={item.invoiceNumber}
                    id={`invoice-${item.invoiceNumber}`}
                    className={`transition-all duration-300 ${
                      highlightedInvoice === item.invoiceNumber ? 'bg-yellow-200 ring-2 ring-yellow-400 z-10 scale-[1.01] shadow-lg' :
                      item.isDuplicate ? 'bg-amber-50/50' : 
                      item.scanned ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-black ${item.scanned ? 'text-emerald-700' : 'text-slate-900'}`}>
                          #{item.invoiceNumber}
                        </span>
                        {item.isDuplicate && (
                          <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow-sm">
                            Duplicate
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`font-bold uppercase tracking-tight ${item.scanned ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {item.customerName}
                      </p>
                      {item.scanTime && <p className="text-[8px] text-emerald-400 font-bold">Scanned at {item.scanTime}</p>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.scanned ? (
                        <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">
                          Verified
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredManifest.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-32 text-center">
                      <div className="space-y-2 opacity-30">
                        <p className="text-2xl">📋</p>
                        <p className="text-[10px] font-black uppercase tracking-widest">No records found. Paste data above or upload a file.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'slate', onClick, active }: any) {
  const styles: any = {
    slate: active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-900',
    emerald: active ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-50 border-emerald-100 text-emerald-900',
    rose: active ? 'bg-rose-500 border-rose-500 text-white' : 'bg-rose-50 border-rose-100 text-rose-900',
    amber: active ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-50 border-amber-100 text-amber-900'
  };
  return (
    <button 
      onClick={onClick}
      className={`w-full p-6 rounded-3xl border-2 shadow-sm ${styles[color]} flex justify-between items-center transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer group`}
    >
      <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</p>
      <div className="flex items-center gap-3">
        <p className="text-2xl font-black italic tracking-tighter">{value}</p>
        {active && <span className="text-xs">✕</span>}
      </div>
    </button>
  );
}
