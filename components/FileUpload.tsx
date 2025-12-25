import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileType, AlertCircle } from 'lucide-react';
import { CsvRow } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: CsvRow[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setError(null);
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setError('Please upload a valid CSV file.');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          onDataLoaded(results.data as CsvRow[]);
        } else {
          setError('The CSV file appears to be empty or invalid.');
        }
      },
      error: (err) => {
        setError(`Error parsing CSV: ${err.message}`);
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div 
      className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />
      
      <div className="flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
          <Upload size={32} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            Click to upload or drag and drop
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            CSV files only. We'll auto-detect middle housing projects.
          </p>
        </div>
      </div>

      {error && (
        <div className="absolute -bottom-16 left-0 right-0 mx-auto w-full max-w-md">
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-center gap-2 border border-red-100">
            <AlertCircle size={16} />
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;