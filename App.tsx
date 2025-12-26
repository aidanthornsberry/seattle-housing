import React, { useState, useEffect } from 'react';
import DataTable from './components/DataTable';
import MapVisualizer from './components/MapVisualizer';
import { CsvRow } from './types';
import { classifyProject, ProcessedRow } from './utils/classifier';
import { Building2, Map as MapIcon, Table as TableIcon, Loader2, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

const App: React.FC = () => {
  const [data, setData] = useState<ProcessedRow[] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDataLoaded = (rawData: CsvRow[]) => {
    console.log(`Processing ${rawData.length} rows...`);
    let loadedCoordsCount = 0;

    const processed = rawData.map(row => {
      // 1. Column Identification with loose matching (trim whitespace, ignore case)
      const keys = Object.keys(row);
      const findKey = (target: string) => keys.find(k => k.trim().toLowerCase() === target.toLowerCase());
      const findKeyIncludes = (target: string) => keys.find(k => k.trim().toLowerCase().includes(target.toLowerCase()));

      const descriptionKey = findKeyIncludes('description') || 'Description';
      const projectKey = findKeyIncludes('project name') || 'Property/Project Name';
      const addressKey = findKeyIncludes('address') || 'Address';
      
      // Strict matching for coords to avoid false positives, but allow case variance
      const latKey = findKey('latitude') || 'Latitude';
      const lngKey = findKey('longitude') || 'Longitude';

      const desc = row[descriptionKey] || '';
      const proj = row[projectKey] || '';
      const address = row[addressKey] || '';
      
      // 2. Classification
      const classification = classifyProject(desc, proj, address);
      
      // 3. Coordinate Extraction (Instant Map Loading)
      let location = undefined;
      const latStr = row[latKey];
      const lngStr = row[lngKey];

      if (latStr && lngStr) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Basic bounds check for Seattle area (broadened slightly to ensure we don't miss valid points)
        // Seattle roughly: 47.6, -122.3. Bounds: 47-48, -123 to -121
        if (!isNaN(lat) && !isNaN(lng) && lat > 46.5 && lat < 48.5 && lng > -123.5 && lng < -121.5) {
            location = { lat, lng };
            loadedCoordsCount++;
        }
      }

      return {
        ...classification, 
        location: location, // Attach pre-existing location if available
        original: row      
      };
    });
    
    console.log(`Successfully loaded coordinates for ${loadedCoordsCount} rows.`);
    setData(processed);
  };

  // Effect to load default CSV
  useEffect(() => {
    const loadDefaultData = async () => {
      try {
        console.log("Attempting to fetch ./permits.csv...");
        // Add timestamp to query string to bypass browser caching of the old CSV file
        // This is critical when the user updates the file on the server/disk.
        const response = await fetch(`./permits.csv?t=${Date.now()}`);
        
        if (!response.ok) {
          throw new Error(`Could not find 'permits.csv' (Status: ${response.status}). Please ensure the file exists in the public folder.`);
        }

        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.data && results.data.length > 0) {
              handleDataLoaded(results.data as CsvRow[]);
            } else {
              setError("The loaded 'permits.csv' file appears to be empty.");
            }
            setIsLoading(false);
          },
          error: (err) => {
            console.error("Error parsing CSV:", err);
            setError(`Error parsing 'permits.csv': ${err.message}`);
            setIsLoading(false);
          }
        });
      } catch (err: any) {
        console.error("Error loading CSV:", err);
        setError(err.message || "Unknown error loading data.");
        setIsLoading(false);
      }
    };

    loadDefaultData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl shadow-lg">
              <Building2 className="text-white h-8 w-8" />
            </div>
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    Middle Housing Filter
                </h1>
                <p className="text-sm text-slate-500">Seattle Construction Permit Analyzer</p>
            </div>
          </div>

          {data && !isLoading && !error && (
             <div className="flex bg-slate-200 p-1 rounded-lg">
                <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <TableIcon size={16} />
                    List View
                </button>
                <button
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'map' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <MapIcon size={16} />
                    Map View
                </button>
             </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col items-center justify-center w-full min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-600 font-medium">Loading project data...</p>
            </div>
          ) : error ? (
            <div className="w-full max-w-lg bg-red-50 border border-red-100 rounded-xl p-8 text-center animate-fade-in">
              <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to load data</h3>
              <p className="text-red-600 mb-6">{error}</p>
              <div className="text-sm text-red-500 bg-white p-4 rounded-lg border border-red-100 text-left">
                <strong>Troubleshooting:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Ensure <code>permits.csv</code> is in the <code>public</code> folder.</li>
                    <li>Check that the file name matches exactly (lowercase).</li>
                    <li>If testing locally, ensure your dev server is running.</li>
                </ul>
              </div>
            </div>
          ) : data ? (
            <div className="w-full">
                {viewMode === 'list' ? (
                    <DataTable data={data} />
                ) : (
                    <MapVisualizer data={data} />
                )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default App;
