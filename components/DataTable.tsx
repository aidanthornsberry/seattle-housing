import React, { useState, useMemo } from 'react';
import { ProcessedRow } from '../utils/classifier';
import { Download, Filter, Home, XCircle, CheckCircle, ChevronDown } from 'lucide-react';
import Papa from 'papaparse';

interface DataTableProps {
  data: ProcessedRow[];
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [filter, setFilter] = useState<'ALL' | 'YES' | 'NO'>('YES');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;

  // Extract unique housing types for the dropdown
  const housingTypes = useMemo(() => {
    const types = new Set(data.filter(d => d.isMiddleHousing).map(d => d.housingType));
    return Array.from(types).sort();
  }, [data]);

  const filteredData = data.filter(row => {
    // 1. Primary Status Filter
    let matchesStatus = true;
    if (filter === 'YES') matchesStatus = row.isMiddleHousing;
    if (filter === 'NO') matchesStatus = !row.isMiddleHousing;

    // 2. Specific Type Filter (only applies if looking at Middle Housing or ALL)
    let matchesType = true;
    if (typeFilter !== 'ALL') {
        matchesType = row.housingType === typeFilter;
    }

    return matchesStatus && matchesType;
  });

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = filteredData.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const handleDownload = () => {
    // Prepare data for export - merge original with new columns
    const exportData = filteredData.map(row => ({
      ...row.original,
      'Is Middle Housing': row.isMiddleHousing ? 'Yes' : 'No',
      'Housing Type': row.housingType,
      'Match Reason': row.notes
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'middle_housing_filtered.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = {
    total: data.length,
    middleHousing: data.filter(d => d.isMiddleHousing).length,
    excluded: data.filter(d => !d.isMiddleHousing).length
  };

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [filter, typeFilter]);

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Filter size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Records</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Home size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Middle Housing Found</p>
            <p className="text-2xl font-bold text-slate-900">{stats.middleHousing}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-lg">
            <XCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Excluded / Other</p>
            <p className="text-2xl font-bold text-slate-900">{stats.excluded}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-4 z-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {/* Status Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                onClick={() => setFilter('ALL')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filter === 'ALL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                All
                </button>
                <button
                onClick={() => setFilter('YES')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filter === 'YES' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                Housing Only
                </button>
                <button
                onClick={() => setFilter('NO')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filter === 'NO' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                Excluded
                </button>
            </div>

            {/* Specific Type Filter (Only visible if not Excluded) */}
            {filter !== 'NO' && (
                <div className="relative">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="ALL">All Housing Types</option>
                        {housingTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                </div>
            )}
            </div>

            <div className="flex gap-3 w-full md:w-auto justify-end">
            <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap"
            >
                <Download size={16} />
                Export CSV
            </button>
            </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 w-16">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700 w-48">Housing Type</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Project Description</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length > 0 ? (
                paginatedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      {row.isMiddleHousing ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <CheckCircle size={12} />
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <XCircle size={12} />
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`font-medium ${row.isMiddleHousing ? 'text-blue-700' : 'text-slate-500'}`}>
                            {row.housingType}
                        </span>
                        {row.notes && (
                            <span className="text-[10px] text-slate-400 mt-0.5">{row.notes}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-md truncate" title={row.original['Description']}>
                      {row.original['Description']}
                    </td>
                    <td className="px-6 py-4 text-slate-600 truncate max-w-xs">
                      {row.original['Address']}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No results found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;
