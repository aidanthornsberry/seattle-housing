import React, { useEffect, useRef, useState } from 'react';
import { ProcessedRow } from '../utils/classifier';
import { Loader2, AlertTriangle, MapPin, X, FileText, Info } from 'lucide-react';

// Declare Leaflet global
declare const L: any;

interface MapVisualizerProps {
  data: ProcessedRow[];
}

const MapVisualizer: React.FC<MapVisualizerProps> = ({ data }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  // State for geocoding progress
  const [geocodedData, setGeocodedData] = useState<ProcessedRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isGeocoding, setIsGeocoding] = useState(false);
  const shouldStopGeocoding = useRef(false);

  // State for selected project (Side Panel)
  const [selectedProject, setSelectedProject] = useState<ProcessedRow | null>(null);

  // Filter only middle housing for the map to save API calls
  const mapData = data.filter(d => d.isMiddleHousing);

  // Initialize Map
  useEffect(() => {
    if (mapRef.current && !leafletMap.current && typeof L !== 'undefined') {
      // Default center: Seattle
      leafletMap.current = L.map(mapRef.current).setView([47.6062, -122.3321], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(leafletMap.current);
    }

    // Fix for map rendering issues when switching tabs (gray tiles)
    if (leafletMap.current) {
        setTimeout(() => {
            leafletMap.current.invalidateSize();
        }, 200);
    }

    return () => {
      shouldStopGeocoding.current = true;
    };
  }, []); // Run once on mount

  // Trigger Geocoding
  useEffect(() => {
    // Only start if we have data and haven't started yet
    if (mapData.length > 0 && !isGeocoding && geocodedData.length === 0) {
      startGeocoding();
    }
  }, [mapData]);

  const startGeocoding = async () => {
    setIsGeocoding(true);
    shouldStopGeocoding.current = false;

    // 1. Identify Unique Addresses to avoid redundant API calls
    const uniqueAddresses = Array.from(new Set(
        mapData
            .map(d => d.address)
            .filter(a => !!a && a.trim().length > 0)
    )) as string[];

    setProgress({ current: 0, total: uniqueAddresses.length });

    const addressCache = new Map<string, { lat: number; lng: number } | null>();
    
    // Helper to process a batch of addresses concurrently
    const processBatch = async (addresses: string[]) => {
        const promises = addresses.map(async (address) => {
            if (shouldStopGeocoding.current) return;
            if (addressCache.has(address)) return;

            const cleanAddress = address.trim();
            // Photon works best with "Address, City, State"
            const queryAddress = cleanAddress.toLowerCase().includes('seattle') 
                ? cleanAddress
                : `${cleanAddress}, Seattle, WA`;

            try {
                // Photon API (backed by OpenStreetMap) - Much faster and CORS friendly
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryAddress)}&limit=1`;
                
                const resp = await fetch(url);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.features && json.features.length > 0) {
                        // GeoJSON format is [lng, lat]
                        const [lng, lat] = json.features[0].geometry.coordinates;
                        addressCache.set(address, { lat, lng });
                        return;
                    }
                }
            } catch (error) {
                // Silently fail
            }
            
            // If failed
            addressCache.set(address, null);
        });

        await Promise.all(promises);
    };

    // 2. Execute in Batches
    // Photon is fast, so we can do larger batches, but let's be polite.
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
        if (shouldStopGeocoding.current) break;
        
        const batch = uniqueAddresses.slice(i, i + BATCH_SIZE);
        await processBatch(batch);

        // Update progress
        setProgress({ 
            current: Math.min(i + BATCH_SIZE, uniqueAddresses.length), 
            total: uniqueAddresses.length 
        });

        // Apply cached locations to the main dataset
        const updatedData = mapData.map(row => {
            if (!row.address) return row;
            const loc = addressCache.get(row.address);
            return loc ? { ...row, location: loc } : row;
        });
        
        setGeocodedData(updatedData);
        
        // Small delay to be polite to the API
        await new Promise(r => setTimeout(r, 150));
    }

    setIsGeocoding(false);
  };

  // Update Markers when geocoded data changes
  useEffect(() => {
    if (!leafletMap.current || typeof L === 'undefined') return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    geocodedData.forEach(row => {
      if (row.location) {
        const color = getHousingTypeColor(row.housingType);
        
        const marker = L.circleMarker([row.location.lat, row.location.lng], {
          radius: 9,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        });

        // We bind a simple tooltip for hover, but use onClick for the full panel
        marker.bindTooltip(`<b>${row.housingType}</b><br/>${row.address}`, { 
            direction: 'top',
            offset: [0, -5],
            className: 'text-xs'
        });

        marker.on('click', () => {
            // Set this row as selected to open the side panel
            setSelectedProject(row);
            
            // Highlight effect (optional reset of others could be added here)
            marker.setStyle({ color: '#000', weight: 3 });
        });

        marker.addTo(leafletMap.current);
        markersRef.current.push(marker);
      }
    });
  }, [geocodedData]);

  // Reset marker styles when selection changes (optional optimization)
  useEffect(() => {
      if (!selectedProject && markersRef.current.length > 0) {
          markersRef.current.forEach(m => m.setStyle({ color: '#fff', weight: 2 }));
      }
  }, [selectedProject]);

  const getHousingTypeColor = (type: string) => {
    if (type.includes('ULS')) return '#10b981'; // Emerald
    if (type.includes('DADU')) return '#8b5cf6'; // Violet
    if (type.includes('Townhouse')) return '#3b82f6'; // Blue
    if (type.includes('Multiplex')) return '#f97316'; // Orange
    if (type.includes('Multifamily')) return '#f97316'; // Orange
    if (type.includes('Single')) return '#06b6d4'; // Cyan
    if (type.includes('AADU')) return '#d946ef'; // Fuchsia
    return '#64748b'; // Slate
  };

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      {/* Map Controls / Legend */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 items-center flex-wrap text-sm">
            <span className="font-semibold text-slate-700">Legend:</span>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> ULS</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Townhouse</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-violet-500"></span> DADU</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500"></span> Multiplex</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-500"></span> SFR</div>
        </div>

        {isGeocoding ? (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                <Loader2 className="animate-spin" size={14} />
                <span>Locating: {progress.current} / {progress.total}</span>
            </div>
        ) : (
             <div className="flex items-center gap-2 text-sm text-slate-500">
                <MapPin size={14} />
                <span>{geocodedData.filter(d => d.location).length} locations found</span>
             </div>
        )}
      </div>

      {/* Map Container Wrapper */}
      <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-slate-300 shadow-inner bg-slate-100 flex">
         
         {/* The Map */}
         <div ref={mapRef} className="flex-grow h-full z-0" />
         
         {!isGeocoding && geocodedData.length === 0 && mapData.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-[1000] pointer-events-none">
                <p className="text-slate-500">Initializing map...</p>
            </div>
         )}

         {/* Side Panel Overlay */}
         {selectedProject && (
             <div className="absolute right-0 top-0 bottom-0 w-full md:w-[450px] bg-white shadow-2xl z-[2000] border-l border-slate-200 flex flex-col transition-transform duration-300 transform">
                 
                 {/* Header */}
                 <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between shrink-0">
                     <div>
                        <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700 mb-2">
                            {selectedProject.housingType}
                        </span>
                        <h2 className="font-bold text-lg text-slate-900 leading-tight">
                            {selectedProject.address}
                        </h2>
                     </div>
                     <button 
                        onClick={() => setSelectedProject(null)}
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                     >
                        <X size={20} />
                     </button>
                 </div>

                 {/* Scrollable Content */}
                 <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                     
                     {/* Match Reason Section */}
                     <div className="mb-6 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                         <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-1">
                             <Info size={16} />
                             Match Reason
                         </div>
                         <p className="text-sm text-emerald-900">{selectedProject.notes}</p>
                     </div>

                     {/* Full Data Table */}
                     <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                         <FileText size={16} />
                         Full Project Details
                     </h3>
                     
                     <div className="space-y-0 text-sm">
                         {selectedProject.original && Object.entries(selectedProject.original).map(([key, value], idx) => (
                             <div key={idx} className="flex flex-col py-2 border-b border-slate-100 last:border-0">
                                 <span className="text-[11px] uppercase font-bold text-slate-500 mb-1">{key}</span>
                                 <span className="text-slate-800 break-words leading-relaxed">
                                     {value ? value : <span className="text-slate-400 italic">Empty</span>}
                                 </span>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
         )}
      </div>

      <div className="text-xs text-slate-500 flex items-start gap-2 max-w-4xl">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
        <p>
            Map uses <strong>Photon API</strong>. Click any colored dot to view full project details in the side panel.
        </p>
      </div>
    </div>
  );
};

export default MapVisualizer;