'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { PersonalizedNecklace } from '@/app/lib/db';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';

const EXPORT_SCALE = 10; // 10px/mm

export default function PersonalizedNecklacePage() {
  const [necklaces, setNecklaces] = useState<PersonalizedNecklace[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportGap, setExportGap] = useState(15);
  const [hoveredNecklace, setHoveredNecklace] = useState<PersonalizedNecklace | null>(null);

  useEffect(() => {
    fetchNecklaces();
  }, []);

  const fetchNecklaces = async () => {
    try {
      const response = await fetch('/api/personalized-necklace');
      const data = await response.json();
      setNecklaces(data);
    } catch (error) {
      console.error('Error fetching necklaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const updateStatus = async (id: number, status: string) => {
    await fetch('/api/personalized-necklace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    fetchNecklaces();
  };

  const deleteNecklace = async (id: number) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    await fetch(`/api/personalized-necklace?id=${id}`, { method: 'DELETE' });
    fetchNecklaces();
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return alert('No items selected');
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected orders?`)) return;
    
    await fetch(`/api/personalized-necklace?ids=${selectedIds.join(',')}`, { method: 'DELETE' });
    setSelectedIds([]);
    fetchNecklaces();
  };

  const deleteAll = async () => {
    if (!confirm('WARNING: Are you sure you want to delete ALL orders in the database? This cannot be undone.')) return;
    const pin = prompt('Type "DELETE" to confirm:');
    if (pin !== 'DELETE') return;

    await fetch(`/api/personalized-necklace?clearAll=true`, { method: 'DELETE' });
    setSelectedIds([]);
    fetchNecklaces();
  };

  const selectAll = () => {
    setSelectedIds(necklaces.map(n => n.id!));
  };

  const drawNecklace = async (necklace: PersonalizedNecklace, ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
    const wPx = necklace.width_mm * scale;
    const hPx = necklace.height_mm * scale;
    
    try {
      await document.fonts.load(`${hPx}px "${necklace.font_family}"`);
    } catch (e) {
      console.warn('Font loading failed:', necklace.font_family);
    }

    const fontSize = hPx * 0.9;
    ctx.font = `${fontSize}px "${necklace.font_family}", cursive, serif`;
    ctx.fillStyle = necklace.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(necklace.personalized_name, x + wPx / 2, y + hPx / 2);

    ctx.font = `${3 * scale}px "Share Tech Mono", monospace`;
    ctx.fillStyle = '#888';
    ctx.textBaseline = 'top';
    const label = `${necklace.font_name.toUpperCase()} | ${necklace.width_mm}mm x ${necklace.height_mm}mm | ${necklace.customer_name}`;
    ctx.fillText(label, x + wPx / 2, y + hPx + (1.5 * scale));
  };

  const selectAllPending = () => {
    const pendingIds = necklaces.filter(n => n.status === 'PENDING').map(n => n.id!);
    setSelectedIds(pendingIds);
  };

  const exportSelected = async (format: 'png' | 'jpg' | 'pdf') => {
    if (selectedIds.length === 0) return alert('Select items to export');

    const selectedItems = necklaces.filter(n => selectedIds.includes(n.id!));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paddingMM = 10;
    const totalItemsHeight = selectedItems.reduce((acc, curr) => acc + curr.height_mm + 5, 0);
    const sheetHmm = (paddingMM * 2) + totalItemsHeight + ((selectedItems.length - 1) * exportGap);
    
    canvas.width = 210 * EXPORT_SCALE;
    canvas.height = sheetHmm * EXPORT_SCALE;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentY = paddingMM * EXPORT_SCALE;
    for (const item of selectedItems) {
      await drawNecklace(item, ctx, (canvas.width - item.width_mm * EXPORT_SCALE) / 2, currentY, EXPORT_SCALE);
      currentY += (item.height_mm + 5 + exportGap) * EXPORT_SCALE;
    }

    const dataUrl = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 1.0);
    if (format === 'pdf') {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [210, sheetHmm] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, 210, sheetHmm);
      pdf.save(`workshop-export-${Date.now()}.pdf`);
    } else {
      const link = document.createElement('a');
      link.download = `workshop-export-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    }

    if (confirm(`Mark ${selectedIds.length} orders as COMPLETED?`)) {
      for (const id of selectedIds) await updateStatus(id, 'COMPLETED');
      setSelectedIds([]);
      fetchNecklaces();
    }
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-10 ml-64">
        <div className="max-w-6xl mx-auto">
          
          {/* Header Section */}
          <div className="flex justify-between items-end mb-10">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Artisan Workshop</h1>
              <p className="text-gray-400 font-medium">Precision Jewelry Management</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-6 bg-white p-5 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sheet Spacing</span>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      value={exportGap} 
                      onChange={(e) => setExportGap(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 text-right text-[11px] font-black text-gray-900 bg-gray-50 border border-gray-100 rounded px-1 py-0.5 outline-none focus:border-gray-300"
                    />
                    <span className="text-[10px] font-bold text-gray-400">MM</span>
                  </div>
                </div>
                <input 
                  type="range" min="0" max="100" value={exportGap} 
                  onChange={(e) => setExportGap(parseInt(e.target.value))}
                  className="w-40 accent-gray-900 cursor-pointer"
                />
              </div>
              <div className="h-10 w-px bg-gray-100"></div>
              <div className="flex gap-2">
                {['PNG', 'PDF', 'JPG'].map(fmt => (
                  <button 
                    key={fmt}
                    onClick={() => exportSelected(fmt.toLowerCase() as any)}
                    className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition shadow-lg shadow-gray-200"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Pending', value: necklaces.filter(n => n.status === 'PENDING').length, color: 'text-amber-500' },
              { label: 'Completed', value: necklaces.filter(n => n.status === 'COMPLETED').length, color: 'text-emerald-500' },
              { label: 'Selected', value: selectedIds.length, color: 'text-blue-500' },
              { label: 'Total', value: necklaces.length, color: 'text-gray-900' }
            ].map((stat, i) => (
              <motion.div 
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm"
              >
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</div>
                <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-sm cursor-pointer group">
              <input 
                type="checkbox" 
                checked={necklaces.length > 0 && selectedIds.length === necklaces.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(necklaces.map(n => n.id!));
                  else setSelectedIds([]);
                }}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
              />
              <span className="text-[11px] font-black text-gray-700 uppercase tracking-tight">Select All ({necklaces.length})</span>
            </label>

            <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-amber-50 transition shadow-sm cursor-pointer group">
              <input 
                type="checkbox" 
                checked={necklaces.filter(n => n.status === 'PENDING').length > 0 && necklaces.filter(n => n.status === 'PENDING').every(n => selectedIds.includes(n.id!))}
                onChange={(e) => {
                  const pendingIds = necklaces.filter(n => n.status === 'PENDING').map(n => n.id!);
                  if (e.target.checked) {
                    setSelectedIds(prev => Array.from(new Set([...prev, ...pendingIds])));
                  } else {
                    setSelectedIds(prev => prev.filter(id => !pendingIds.includes(id)));
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-[11px] font-black text-amber-600 uppercase tracking-tight">Select Pending</span>
            </label>

            <div className="h-8 w-px bg-gray-200 self-center mx-1"></div>
            
            <button 
              onClick={deleteSelected} 
              disabled={selectedIds.length === 0}
              className={`px-4 py-2 text-[11px] font-black rounded-xl transition shadow-sm uppercase tracking-tight ${
                selectedIds.length > 0 
                  ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
                  : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
              }`}
            >
              Delete Selected ({selectedIds.length})
            </button>

            <button 
              onClick={deleteAll} 
              className="px-4 py-2 bg-white border border-red-200 text-red-500 text-[11px] font-black rounded-xl hover:bg-red-500 hover:text-white transition shadow-sm ml-auto uppercase tracking-tight"
            >
              Clear Database
            </button>
          </div>

          {/* Workshop Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="w-16 px-6 py-4"></th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Design Preview</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Specifications</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <AnimatePresence mode='popLayout'>
                  {necklaces.map((necklace) => (
                    <motion.tr 
                      key={necklace.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onMouseEnter={() => setHoveredNecklace(necklace)}
                      onMouseLeave={() => setHoveredNecklace(null)}
                      className={`group hover:bg-gray-50/50 transition-colors ${selectedIds.includes(necklace.id!) ? 'bg-blue-50/30' : ''}`}
                    >
                      <td className="px-6 py-6">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(necklace.id!)}
                          onChange={() => toggleSelect(necklace.id!)}
                          className="h-5 w-5 rounded-md border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                      </td>
                      <td className="px-6 py-6">
                        <div className="text-sm font-black text-gray-900">{necklace.customer_name}</div>
                        <div className="text-[10px] font-bold text-gray-400">ORDER #{necklace.id}</div>
                      </td>
                      <td className="px-6 py-6">
                        <motion.div 
                          className="text-3xl origin-left inline-block"
                          animate={{ 
                            scale: hoveredNecklace?.id === necklace.id ? 1.2 : 1,
                            color: necklace.color
                          }}
                          style={{ fontFamily: necklace.font_family }}
                        >
                          {necklace.personalized_name}
                        </motion.div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="text-[11px] font-black text-gray-700">{necklace.font_name.toUpperCase()}</div>
                        <div className="text-[10px] font-bold text-gray-400 tracking-wider">{necklace.width_mm}MM × {necklace.height_mm}MM</div>
                      </td>
                      <td className="px-6 py-6">
                        <select 
                          value={necklace.status} 
                          onChange={(e) => updateStatus(necklace.id!, e.target.value)}
                          className={`text-[10px] font-black rounded-lg px-3 py-1.5 outline-none border transition-all appearance-none ${
                            necklace.status === 'COMPLETED' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : 'bg-amber-50 text-amber-700 border-amber-100'
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <button 
                          onClick={() => deleteNecklace(necklace.id!)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-red-400 hover:text-red-600 tracking-widest"
                        >
                          DISCARD
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Floating Preview Modal */}
        <AnimatePresence>
          {hoveredNecklace && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="fixed bottom-10 right-10 bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 w-80 pointer-events-none z-50"
            >
              <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-4">Precision Preview</div>
              <div 
                className="text-5xl mb-6 text-center leading-tight" 
                style={{ fontFamily: hoveredNecklace.font_family, color: hoveredNecklace.color }}
              >
                {hoveredNecklace.personalized_name}
              </div>
              <div className="space-y-2 pt-4 border-t border-gray-50">
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Material Color</span>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hoveredNecklace.color }}></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Width</span>
                  <span className="text-[10px] font-black text-gray-900">{hoveredNecklace.width_mm}mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Height</span>
                  <span className="text-[10px] font-black text-gray-900">{hoveredNecklace.height_mm}mm</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Alex+Brush&family=Allura&family=Carattere&family=Clicker+Script&family=Dancing+Script:wght@400;700&family=Dr+Sugiyama&family=Euphoria+Script&family=Fleur+De+Leah&family=Great+Vibes&family=Imperial+Script&family=Italianno&family=Lavishly+Yours&family=Licorice&family=Luxurious+Script&family=Meie+Script&family=Monsieur+La+Doulaise&family=Mr+Dafoe&family=Mr+De+Haviland&family=Mrs+Saint+Delafield&family=Mrs+Sheppards&family=Niconne&family=Norican&family=Oooh+Baby&family=Over+the+Rainbow&family=Pacifico&family=Parisienne&family=Passions+Conflict&family=Pinyon+Script&family=Princess+Sofia&family=Ruthie&family=Sacramento&family=Sail&family=Seaweed+Script&family=Send+Flowers&family=Shalimar&family=Sofia&family=Stalemate&family=Tangerine:wght@400;700&family=The+Nautigal:wght@400;700&family=Updock&family=Vibur&family=Waterfall&family=Yellowtail&family=Yesteryear&family=Zeyada&family=Bilbo&family=Bonheur+Royale&family=Charm:wght@400;700&family=Courgette&family=Dawning+of+a+New+Day&family=Eagle+Lake&family=Felipa&family=Fondamento&family=Gwendolyn:wght@400;700&family=Herr+Von+Muellerhoff&family=Hurricane&family=Kaushan+Script&family=Lovers+Quarrel&family=Montez&family=Sevillana&family=Berkshire+Swash&family=Cormorant+Garamond:ital,wght@1,300&display=swap" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/amarillo" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/moyudan" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/bestie-seventy" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/scriptina" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/adine-kirnberg" rel="stylesheet" />
    </div>
  );
}

