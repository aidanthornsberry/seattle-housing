import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import MapVisualizer from './components/MapVisualizer';
import { CsvRow } from './types';
import { classifyProject, ProcessedRow } from './utils/classifier';
import { Building2, Map as MapIcon, Table as TableIcon, Loader2 } from 'lucide-react';
import Papa from 'papaparse';

const App: React.FC = () => {
  const [data, setData] = useState<ProcessedRow[] | null>(null);
  // Default to 'map' view since we want immediate visualization
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');
  const [isLoading, setIsLoading] = useState(false);

  const handleDataLoaded = (rawData: CsvRow[]) => {
    const processed = rawData.map(row => {
      // Assuming keys from user's sample: Description is Column G
      // We look for 'Description' key specifically, or attempt to find it
      const descriptionKey = Object.keys(row).find(k => k.toLowerCase().includes('description')) || 'Description';
      const projectKey = Object.keys(row).find(k => k.toLowerCase().includes('project name')) || 'Property/Project Name';
      const addressKey = Object.keys(row).find(k => k.toLowerCase().includes('address')) || 'Address';
      
      const desc = row[descriptionKey] || '';
      const proj = row[projectKey] || '';
      const address = row[addressKey] || '';
      
      const classification = classifyProject(desc, proj, address);
      
      return {
        ...classification, // Spread classification properties first
        original: row      // Then assign original row to ensure it's not overwritten by an empty object
      };
    });
    
    setData(processed);
  };

  const handleReset = () => {
    setData(null);
    setViewMode('list');
  };

  // Effect to load default CSV if available
  useEffect(() => {
    const loadDefaultData = async () => {
      try {
        // Looks for 'permits.csv' in the public folder or root
        const response = await fetch('./permits.csv');
        
        if (response.ok) {
          setIsLoading(true);
          const csvText = await response.text();
          
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              if (results.data && results.data.length > 0) {
                handleDataLoaded(results.data as CsvRow[]);
              }
              setIsLoading(false);
            },
            error: (err) => {
              console.error("Error parsing default CSV:", err);
              setIsLoading(false);
            }
          });
        }
      } catch (error) {
        // Silently fail if file doesn't exist, user sees Upload screen
        console.log("No default 'permits.csv' found, waiting for user upload.");
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

          {data && !isLoading && (
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
          ) : !data ? (
            <div className="w-full max-w-xl animate-fade-in">
              <FileUpload onDataLoaded={handleDataLoaded} />
              
              {/* Instructions / Info */}
              <div className="mt-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-3">How it works</h3>
                <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside">
                  <li>Detects <strong>ULS, DADU, AADU, Townhomes, and Multiplexes</strong>.</li>
                  <li>Identifies <strong>new construction Single Family Residences</strong>.</li>
                  <li>Filters out simple renovations, repairs, and commercial TIs.</li>
                  <li><strong>Map View:</strong> Automatically looks up coordinates for Seattle addresses.</li>
                  <li>Processing happens entirely in your browser.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="w-full">
                {viewMode === 'list' ? (
                    <DataTable data={data} onReset={handleReset} />
                ) : (
                    <MapVisualizer data={data} />
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
