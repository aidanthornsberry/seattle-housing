import React, { useEffect, useRef, useState } from 'react';
import { ProcessedRow } from '../utils/classifier';
import { Loader2, AlertTriangle, MapPin, X, FileText, Info, Save, DownloadCloud } from 'lucide-react';
import Papa from 'papaparse';

// Declare Leaflet global
declare const L: any;

interface MapVisualizerProps {
  data: ProcessedRow[];
}

const MapVisualizer: React.FC<MapVisualizerProps> = ({ data }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  // Filter only middle housing for the map
  const mapData = React.useMemo(() => data.filter(d => d.isMiddleHousing), [data]);

  // Initialize with data passed from parent
  const [displayData, setDisplayData] = useState<ProcessedRow[]>(mapData);
  
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isGeocoding, setIsGeocoding] = useState(false);
  const shouldStopGeocoding = useRef(false);

  // State for selected project (Side Panel)
  const [selectedProject, setSelectedProject] = useState<ProcessedRow | null>(null);

  // Load cache from LocalStorage on init
  const getCache = () => {
    try {
        const cache = localStorage.getItem('seattle_permits_geo_cache');
        return cache ? new Map(JSON.parse(cache)) : new Map();
    } catch (e) {
        return new Map();
    }
  };

  const saveCache = (cache: Map<string, any>) => {
    try {
        localStorage.setItem('seattle_permits_geo_cache', JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
        console.warn('LocalStorage full or error', e);
    }
  };

  // Sync displayData when mapData changes (e.g., initial load)
  useEffect(() => {
    setDisplayData(mapData);
  }, [mapData]);

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

  // Trigger Geocoding logic
  useEffect(() => {
    // 1. First, check if we can fill gaps from LocalStorage Cache immediately
    const cache = getCache();
    let hasUpdatesFromCache = false;

    const dataWithCache = mapData.map(d => {
        if (d.location) return d; // Already has location from CSV
        if (d.address && cache.has(d.address)) {
            hasUpdatesFromCache = true;
            return { ...d, location: cache.get(d.address) };
        }
        return d;
    });

    if (hasUpdatesFromCache) {
        setDisplayData(dataWithCache);
    } else {
        setDisplayData(mapData);
    }

    // 2. Identify remaining missing items
    const currentData = hasUpdatesFromCache ? dataWithCache : mapData;
    const missingLocation = currentData.filter(d => !d.location && d.address && d.address.length > 5);

    if (missingLocation.length > 0 && !isGeocoding) {
      startGeocoding(missingLocation, cache);
    }
  }, [mapData]);

  const startGeocoding = async (itemsToGeocode: ProcessedRow[], initialCache: Map<any, any>) => {
    setIsGeocoding(true);
    shouldStopGeocoding.current = false;

    // Identify Unique Addresses to avoid redundant API calls
    const uniqueAddresses = Array.from(new Set(itemsToGeocode.map(d => d.address || ''))) as string[];
    const addressCache = initialCache;
    
    setProgress({ current: 0, total: uniqueAddresses.length });
    let newItemsCount = 0;

    // Helper to process a batch of addresses concurrently
    const processBatch = async (addresses: string[]) => {
        const promises = addresses.map(async (address) => {
            if (shouldStopGeocoding.current) return;
            if (addressCache.has(address)) return;

            const cleanAddress = address.trim();
            // Basic optimization: don't geocode clearly invalid addresses
            if (cleanAddress.length < 5) return;

            const queryAddress = cleanAddress.toLowerCase().includes('seattle') 
                ? cleanAddress
                : `${cleanAddress}, Seattle, WA`;

            try {
                // Photon API (backed by OpenStreetMap)
                // Rate limiting protection: 
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryAddress)}&limit=1`;
                
                const resp = await fetch(url);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.features && json.features.length > 0) {
                        const [lng, lat] = json.features[0].geometry.coordinates;
                        addressCache.set(address, { lat, lng });
                        newItemsCount++;
                        return;
                    }
                }
            } catch (error) {
                // Silently fail or retry logic could go here
            }
            // Mark as null so we don't retry endlessly this session
            addressCache.set(address, null); 
        });

        await Promise.all(promises);
    };

    // Execute in Batches with delay to respect rate limits
    const BATCH_SIZE = 2; // Conservative batch size for free API
    
    for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
        if (shouldStopGeocoding.current) break;
        
        const batch = uniqueAddresses.slice(i, i + BATCH_SIZE);
        await processBatch(batch);

        setProgress({ 
            current: Math.min(i + BATCH_SIZE, uniqueAddresses.length), 
            total: uniqueAddresses.length 
        });

        // Save progress to LocalStorage every few batches
        if (newItemsCount > 0 && i % 10 === 0) {
            saveCache(addressCache);
        }

        // Update display data incrementally with new locations
        setDisplayData(prevData => {
            return prevData.map(row => {
                if (row.location) return row;
                if (row.address && addressCache.has(row.address)) {
                    const loc = addressCache.get(row.address);
                    if (loc) return { ...row, location: loc };
                }
                return row;
            });
        });
        
        // Artificial delay to be nice to the API
        await new Promise(r => setTimeout(r, 600));
    }

    // Final Save
    saveCache(addressCache);
    setIsGeocoding(false);
  };

  const handleExportEnrichedCSV = () => {
      // Merge original data with the discovered coordinates
      const enrichedData = displayData.map(row => {
          return {
              ...row.original,
              'Latitude': row.location?.lat || '',
              'Longitude': row.location?.lng || '',
              'Processed_Category': row.housingType // Optional helpful column
          };
      });

      const csv = Papa.unparse(enrichedData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'permits_with_locations.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Update Markers
  useEffect(() => {
    if (!leafletMap.current || typeof L === 'undefined') return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add markers for all data with locations
    displayData.forEach(row => {
      if (row.location) {
        const color = getHousingTypeColor(row.housingType);
        
        const marker = L.circleMarker([row.location.lat, row.location.lng], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.85
        });

        marker.bindTooltip(`<b>${row.housingType}</b><br/>${row.address}`, { 
            direction: 'top',
            offset: [0, -5],
            className: 'text-xs'
        });

        marker.on('click', () => {
            setSelectedProject(row);
            marker.setStyle({ color: '#000', weight: 3 });
        });

        marker.addTo(leafletMap.current);
        markersRef.current.push(marker);
      }
    });
  }, [displayData]);

  // Reset marker styles when selection changes
  useEffect(() => {
      if (!selectedProject && markersRef.current.length > 0) {
          markersRef.current.forEach(m => m.setStyle({ color: '#fff', weight: 1.5 }));
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex gap-4 items-center flex-wrap text-sm">
            <span className="font-semibold text-slate-700">Legend:</span>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> ULS</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Townhouse</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-violet-500"></span> DADU</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500"></span> Multiplex</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-500"></span> SFR</div>
        </div>

        <div className="flex items-center gap-3">
             {isGeocoding ? (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                    <Loader2 className="animate-spin" size={14} />
                    <span>Processing addresses: {progress.current} / {progress.total}</span>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                    <MapPin size={14} />
                    <span>{displayData.filter(d => d.location).length} mapped</span>
                </div>
            )}
            
            <button 
                onClick={handleExportEnrichedCSV}
                title="Download CSV with added Latitude/Longitude columns to save for everyone"
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
                <Save size={16} />
                <span className="hidden sm:inline">Save Locations</span>
            </button>
        </div>
      </div>

      {/* Map Container Wrapper */}
      <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-slate-300 shadow-inner bg-slate-100 flex">
         
         {/* The Map */}
         <div ref={mapRef} className="flex-grow h-full z-0" />
         
         {!isGeocoding && displayData.filter(d => d.location).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[1000] pointer-events-none backdrop-blur-sm">
                <div className="text-center p-6 max-w-sm">
                    <Loader2 className="w-10 h-10 text-slate-400 animate-spin mx-auto mb-3" />
                    <p className="text-slate-600 font-medium mb-1">Finding Locations...</p>
                    <p className="text-sm text-slate-500">
                        Calculating coordinates from addresses. This happens automatically and is saved to your browser.
                    </p>
                </div>
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

      <div className="text-xs text-slate-500 flex items-start gap-2 max-w-4xl bg-blue-50 p-3 rounded-lg border border-blue-100">
        <DownloadCloud size={16} className="mt-0.5 shrink-0 text-blue-500" />
        <div>
            <p className="font-semibold text-blue-700 mb-1">How to make this map fast for everyone:</p>
            <p>
                The app is currently calculating locations for your browser. 
                Once the "Processing addresses" count finishes, click the <span className="font-bold text-emerald-600">Save Locations</span> button above.
                This will download a new CSV file. Upload that file to your GitHub repository (replacing the old one) to make the map load instantly for all users.
            </p>
        </div>
      </div>
    </div>
  );
};

export default MapVisualizer;
