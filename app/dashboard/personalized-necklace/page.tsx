'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { PersonalizedNecklace } from '@/app/lib/db';
import { jsPDF } from 'jspdf';
import Head from 'next/head';

const EXPORT_SCALE = 10; // 10px/mm

export default function PersonalizedNecklacePage() {
  const [necklaces, setNecklaces] = useState<PersonalizedNecklace[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const drawNecklace = async (necklace: PersonalizedNecklace, ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
    const wPx = necklace.width_mm * scale;
    const hPx = necklace.height_mm * scale;
    
    // Ensure font is loaded before drawing
    try {
      await document.fonts.load(`${hPx}px "${necklace.font_family}"`);
    } catch (e) {
      console.warn('Font loading failed:', necklace.font_family);
    }

    const fontSize = hPx * 0.8;
    ctx.font = `${fontSize}px "${necklace.font_family}", cursive, serif`;
    ctx.fillStyle = necklace.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(necklace.personalized_name, x + wPx / 2, y + hPx / 2);

    // Format label under the name
    ctx.font = `${4 * scale}px "Share Tech Mono", monospace`;
    ctx.fillStyle = '#666';
    ctx.textBaseline = 'top';
    const label = `${necklace.font_name}, ${necklace.width_mm}mm x ${necklace.height_mm}mm height`;
    ctx.fillText(label, x + wPx / 2, y + hPx + (2 * scale));
  };

  const exportSelected = async (format: 'png' | 'jpg' | 'pdf' | 'svg') => {
    if (selectedIds.length === 0) {
      alert('Please select at least one necklace to export');
      return;
    }
    if (selectedIds.length > 10) {
      alert('Maximum 10 names can be exported at once');
      return;
    }

    const selectedItems = necklaces.filter(n => selectedIds.includes(n.id!));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paddingMM = 15;
    const itemGapMM = 20;
    const sheetWmm = 210; // A4 width
    const sheetHmm = paddingMM * 2 + selectedItems.length * (30 + itemGapMM);
    
    canvas.width = sheetWmm * EXPORT_SCALE;
    canvas.height = sheetHmm * EXPORT_SCALE;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentY = paddingMM * EXPORT_SCALE;
    for (const item of selectedItems) {
      await drawNecklace(item, ctx, (sheetWmm * EXPORT_SCALE - item.width_mm * EXPORT_SCALE) / 2, currentY, EXPORT_SCALE);
      currentY += (item.height_mm + itemGapMM) * EXPORT_SCALE;
    }

    if (format === 'png' || format === 'jpg') {
      const dataUrl = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`, 0.9);
      const link = document.createElement('a');
      link.download = `necklaces-export.${format}`;
      link.href = dataUrl;
      link.click();
    } else if (format === 'pdf') {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [sheetWmm, sheetHmm]
      });
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, sheetWmm, sheetHmm);
      pdf.save('necklaces-export.pdf');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Alex+Brush&family=Allura&family=Carattere&family=Clicker+Script&family=Dancing+Script:wght@400;700&family=Dr+Sugiyama&family=Euphoria+Script&family=Fleur+De+Leah&family=Great+Vibes&family=Imperial+Script&family=Italianno&family=Lavishly+Yours&family=Licorice&family=Luxurious+Script&family=Meie+Script&family=Monsieur+La+Doulaise&family=Mr+Dafoe&family=Mr+De+Haviland&family=Mrs+Saint+Delafield&family=Mrs+Sheppards&family=Niconne&family=Norican&family=Oooh+Baby&family=Over+the+Rainbow&family=Pacifico&family=Parisienne&family=Passions+Conflict&family=Pinyon+Script&family=Princess+Sofia&family=Ruthie&family=Sacramento&family=Sail&family=Seaweed+Script&family=Send+Flowers&family=Shalimar&family=Sofia&family=Stalemate&family=Tangerine:wght@400;700&family=The+Nautigal:wght@400;700&family=Updock&family=Vibur&family=Waterfall&family=Yellowtail&family=Yesteryear&family=Zeyada&family=Bilbo&family=Bonheur+Royale&family=Charm:wght@400;700&family=Courgette&family=Dawning+of+a+New+Day&family=Eagle+Lake&family=Felipa&family=Fondamento&family=Gwendolyn:wght@400;700&family=Herr+Von+Muellerhoff&family=Hurricane&family=Kaushan+Script&family=Lovers+Quarrel&family=Montez&family=Sevillana&family=Berkshire+Swash&family=Cormorant+Garamond:ital,wght@1,300&display=swap" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/amarillo" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/moyudan" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/bestie-seventy" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/scriptina" rel="stylesheet" />
      <link href="https://fonts.cdnfonts.com/css/adine-kirnberg" rel="stylesheet" />
      
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 ml-64">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">Personalized Necklace Orders</h1>
            <div className="flex gap-2">
              <button onClick={() => exportSelected('png')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Export PNG</button>
              <button onClick={() => exportSelected('pdf')} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">Export PDF</button>
              <button onClick={() => exportSelected('jpg')} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">Export JPG</button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading orders...</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Select</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Font</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {necklaces.map((necklace) => (
                    <tr key={necklace.id} className={selectedIds.includes(necklace.id!) ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(necklace.id!)}
                          onChange={() => toggleSelect(necklace.id!)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{necklace.customer_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic" style={{ fontFamily: necklace.font_family }}>{necklace.personalized_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{necklace.font_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{necklace.width_mm}mm x {necklace.height_mm}mm</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select 
                          value={necklace.status} 
                          onChange={(e) => updateStatus(necklace.id!, e.target.value)}
                          className={`text-xs font-semibold rounded-full px-2 py-1 outline-none ${
                            necklace.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => deleteNecklace(necklace.id!)} className="text-red-600 hover:text-red-900 ml-4">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {necklaces.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No orders found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
