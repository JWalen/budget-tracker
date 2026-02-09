import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';
import {
  Upload,
  FileText,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CreditCard,
} from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const STEPS = ['Upload', 'Column Mapping', 'Review & Match', 'Confirm'];

const ACCEPTED_TYPES = ['.csv', '.ofx', '.qfx'];

const COLUMN_OPTIONS = [
  { value: '', label: '-- Skip --' },
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'description', label: 'Description' },
  { value: 'type', label: 'Type (optional)' },
];

export default function Import() {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // Account selection
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Upload response
  const [importId, setImportId] = useState(null);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);

  // Column mapping
  const [columnMapping, setColumnMapping] = useState({});

  // Review data
  const [transactions, setTransactions] = useState([]);
  const [selectedRows, setSelectedRows] = useState({});

  // Confirm results
  const [confirmResult, setConfirmResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      const activeAccounts = data.filter(a => a.is_active);
      setAccounts(activeAccounts);
      // Set first account as default if available
      if (activeAccounts.length > 0) {
        setSelectedAccountId(activeAccounts[0].id.toString());
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  // --- Step 1: Upload ---

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setError(null);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const ext = '.' + droppedFile.name.split('.').pop().toLowerCase();
      if (ACCEPTED_TYPES.includes(ext)) {
        setFile(droppedFile);
      } else {
        setError('Unsupported file type. Please use .csv, .ofx, or .qfx files.');
      }
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    setError(null);
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
    }
  }, []);

  const handleUpload = async (mappingOverride = null) => {
    if (!file) return;

    // Check if account is selected
    if (!selectedAccountId) {
      setError('Please select an account to import transactions into');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('account_id', selectedAccountId);

      if (mappingOverride) {
        formData.append('columnMapping', JSON.stringify(mappingOverride));
      }

      const result = await api.uploadImport(formData);

      if (result.needsMapping && !mappingOverride) {
        setNeedsMapping(true);
        setCsvHeaders(result.headers || []);
        setCsvPreviewRows(result.previewRows || []);

        // Auto-guess column mapping from header names
        const autoMap = {};
        (result.headers || []).forEach((header, idx) => {
          const h = header.toLowerCase().trim();
          if (h.includes('date')) autoMap[idx] = 'date';
          else if (h.includes('amount') || h.includes('total') || h.includes('sum')) autoMap[idx] = 'amount';
          else if (h.includes('desc') || h.includes('memo') || h.includes('name') || h.includes('payee')) autoMap[idx] = 'description';
          else if (h.includes('type') || h.includes('category')) autoMap[idx] = 'type';
        });
        setColumnMapping(autoMap);

        setCurrentStep(1);
      } else {
        // No mapping needed (OFX/QFX or re-upload with mapping)
        setNeedsMapping(false);
        const txns = result.transactions || [];
        setTransactions(txns);

        // Initialize selection: deselect duplicates, select everything else
        const sel = {};
        txns.forEach((tx, idx) => {
          sel[idx] = !tx.isDuplicate;
        });
        setSelectedRows(sel);

        setCurrentStep(2);
      }
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // --- Step 2: Column Mapping ---

  const handleMappingChange = (colIndex, value) => {
    setColumnMapping((prev) => {
      const updated = { ...prev };
      if (value) {
        // Remove any other column that was mapped to the same field
        Object.keys(updated).forEach((key) => {
          if (updated[key] === value) delete updated[key];
        });
        updated[colIndex] = value;
      } else {
        delete updated[colIndex];
      }
      return updated;
    });
  };

  const isMappingValid = () => {
    const mapped = Object.values(columnMapping);
    return mapped.includes('date') && mapped.includes('amount') && mapped.includes('description');
  };

  const handleMappingSubmit = () => {
    if (!isMappingValid()) {
      setError('Please map at least Date, Amount, and Description columns.');
      return;
    }
    setError(null);
    handleUpload(columnMapping);
  };

  // --- Step 3: Review & Match ---

  const toggleRow = (idx) => {
    setSelectedRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleAllRows = () => {
    const nonDuplicateIdxs = transactions
      .map((tx, idx) => (!tx.isDuplicate ? idx : null))
      .filter((idx) => idx !== null);
    const allSelected = nonDuplicateIdxs.every((idx) => selectedRows[idx]);

    const updated = { ...selectedRows };
    nonDuplicateIdxs.forEach((idx) => {
      updated[idx] = !allSelected;
    });
    setSelectedRows(updated);
  };

  const confirmMatch = (txIdx) => {
    setTransactions((prev) =>
      prev.map((tx, idx) =>
        idx === txIdx && tx.suggestedMatch
          ? { ...tx, match: tx.suggestedMatch, matchConfidence: 'confirmed', suggestedMatch: null }
          : tx
      )
    );
  };

  const dismissMatch = (txIdx) => {
    setTransactions((prev) =>
      prev.map((tx, idx) =>
        idx === txIdx ? { ...tx, suggestedMatch: null } : tx
      )
    );
  };

  const clearMatch = (txIdx) => {
    setTransactions((prev) =>
      prev.map((tx, idx) =>
        idx === txIdx ? { ...tx, match: null, matchConfidence: null } : tx
      )
    );
  };

  const getReviewSummary = () => {
    const selected = transactions.filter((_, idx) => selectedRows[idx]);
    const duplicates = transactions.filter((tx) => tx.isDuplicate);
    const billMatches = selected.filter(
      (tx) => tx.match && tx.match.type === 'bill'
    );
    const debtPayments = selected.filter(
      (tx) => tx.match && tx.match.type === 'debt'
    );

    return {
      total: transactions.length,
      toImport: selected.length,
      duplicates: duplicates.length,
      billMatches: billMatches.length,
      debtPayments: debtPayments.length,
      skipped: transactions.length - selected.length - duplicates.length,
    };
  };

  // --- Step 4: Confirm ---

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);

    try {
      const toImport = transactions
        .map((tx, idx) => (selectedRows[idx] ? { ...tx, index: idx } : null))
        .filter(Boolean)
        .map((tx) => ({
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          type: tx.type || 'expense',
          matchId: tx.match?.id || null,
          matchType: tx.match?.type || null,
        }));

      const result = await api.confirmImport({
        transactions: toImport,
        account_id: parseInt(selectedAccountId),
      });

      setConfirmResult(result);
    } catch (err) {
      setError(err.message || 'Import failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setFile(null);
    setDragOver(false);
    setUploading(false);
    setError(null);
    setImportId(null);
    setNeedsMapping(false);
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setColumnMapping({});
    setTransactions([]);
    setSelectedRows({});
    setConfirmResult(null);
    setConfirming(false);
  };

  // Determine which steps to show
  const visibleSteps = needsMapping
    ? STEPS
    : [STEPS[0], STEPS[2], STEPS[3]];

  const getVisibleStepIndex = () => {
    if (needsMapping) return currentStep;
    if (currentStep === 0) return 0;
    if (currentStep === 2) return 1;
    if (currentStep === 3) return 2;
    return 0;
  };

  const summary = getReviewSummary();

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Transactions</h1>
        {currentStep > 0 && !confirmResult && (
          <button onClick={resetWizard} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Start Over
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {visibleSteps.map((step, idx) => {
          const isActive = idx === getVisibleStepIndex();
          const isCompleted = idx < getVisibleStepIndex();

          return (
            <div key={step} className="flex items-center gap-2 shrink-0">
              {idx > 0 && (
                <div
                  className={`w-8 h-px ${
                    isCompleted
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {isCompleted ? <Check size={16} /> : idx + 1}
                </div>
                <span
                  className={`text-sm whitespace-nowrap ${
                    isActive
                      ? 'font-medium text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {step}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        {/* ======================== STEP 1: Upload ======================== */}
        {currentStep === 0 && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Upload Statement File
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Import transactions from your bank or credit card statement. Supports CSV, OFX, and QFX formats.
              </p>
            </div>

            {/* Account Selection */}
            <div>
              <label className="label flex items-center gap-2">
                <CreditCard size={16} />
                Import into Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="input w-full"
                required
              >
                <option value="">Select an account...</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.account_type}) - {account.institution || 'No institution'}
                  </option>
                ))}
              </select>
              {accounts.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                  No accounts found. Please create an account first in the Accounts page.
                </p>
              )}
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-dashed border-2 rounded-xl p-12 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : file
                  ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/10'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.ofx,.qfx"
                onChange={handleFileSelect}
                className="hidden"
              />

              {file ? (
                <div className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      Drop your file here, or click to browse
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Accepted formats: .csv, .ofx, .qfx
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex justify-end">
              <button
                onClick={() => handleUpload()}
                disabled={!file || uploading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>Upload & Process</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================== STEP 2: Column Mapping (CSV only) ======================== */}
        {currentStep === 1 && needsMapping && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Map Columns
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tell us which columns in your CSV correspond to each field. Date, Amount, and Description are required.
              </p>
            </div>

            {/* Column Mapping Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {csvHeaders.map((header, idx) => (
                <div key={idx}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {header}
                  </label>
                  <select
                    value={columnMapping[idx] || ''}
                    onChange={(e) => handleMappingChange(idx, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {COLUMN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview Table */}
            {csvPreviewRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Preview (first 5 rows)
                </h3>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        {csvHeaders.map((header, idx) => (
                          <th
                            key={idx}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            <div>{header}</div>
                            {columnMapping[idx] && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold uppercase">
                                {columnMapping[idx]}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {csvPreviewRows.slice(0, 5).map((row, rowIdx) => (
                        <tr key={rowIdx} className="text-sm text-gray-900 dark:text-gray-100">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="px-4 py-2 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setCurrentStep(0);
                  setError(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <button
                onClick={handleMappingSubmit}
                disabled={!isMappingValid() || uploading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================== STEP 3: Review & Match ======================== */}
        {currentStep === 2 && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Review & Match Transactions
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Review imported transactions, confirm or dismiss matches, and select which rows to import.
              </p>
            </div>

            {/* Row Count Summary */}
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {summary.total} total rows
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                <Check size={14} />
                {summary.toImport} to import
              </span>
              {summary.duplicates > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {summary.duplicates} duplicates
                </span>
              )}
              {summary.billMatches > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  {summary.billMatches} bill matches
                </span>
              )}
              {summary.debtPayments > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  {summary.debtPayments} debt payments
                </span>
              )}
            </div>

            {/* Review Table */}
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={
                          transactions.filter((tx) => !tx.isDuplicate).length > 0 &&
                          transactions
                            .filter((tx) => !tx.isDuplicate)
                            .every((_, idx) => {
                              const realIdx = transactions.findIndex(
                                (tx, i) => !tx.isDuplicate && transactions.slice(0, i + 1).filter((t) => !t.isDuplicate).length === idx + 1
                              );
                              return selectedRows[realIdx];
                            })
                        }
                        onChange={toggleAllRows}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Match
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {transactions.map((tx, idx) => (
                    <tr
                      key={idx}
                      className={
                        tx.isDuplicate
                          ? 'bg-gray-50 dark:bg-gray-900/30 opacity-60'
                          : selectedRows[idx]
                          ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          : 'bg-gray-50/50 dark:bg-gray-900/20 opacity-70'
                      }
                    >
                      <td className="px-4 py-3">
                        {tx.isDuplicate ? (
                          <span className="inline-block px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-[10px] font-medium uppercase whitespace-nowrap">
                            Already imported
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={!!selectedRows[idx]}
                            onChange={() => toggleRow(idx)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-[250px] truncate">
                        {tx.description}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
                          tx.type === 'income'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">
                        {tx.type || 'expense'}
                      </td>
                      <td className="px-4 py-3">
                        {tx.isDuplicate ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">--</span>
                        ) : tx.match ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                tx.matchConfidence === 'confirmed' || tx.matchConfidence === 'high'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              }`}
                            >
                              <Check size={12} />
                              {tx.match.name}
                              {tx.matchConfidence && tx.matchConfidence !== 'confirmed' && (
                                <span className="text-[10px] opacity-70">({tx.matchConfidence})</span>
                              )}
                            </span>
                            <button
                              onClick={() => clearMatch(idx)}
                              className="p-0.5 text-gray-400 hover:text-red-500"
                              title="Clear match"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : tx.suggestedMatch ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                              <AlertCircle size={12} />
                              {tx.suggestedMatch.name}
                              {tx.suggestedMatch.confidence && (
                                <span className="text-[10px] opacity-70">({tx.suggestedMatch.confidence})</span>
                              )}
                            </span>
                            <button
                              onClick={() => confirmMatch(idx)}
                              className="p-0.5 text-green-500 hover:text-green-700 dark:hover:text-green-300"
                              title="Confirm match"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => dismissMatch(idx)}
                              className="p-0.5 text-gray-400 hover:text-red-500"
                              title="Dismiss match"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">No match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        No transactions found in the uploaded file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setCurrentStep(needsMapping ? 1 : 0);
                  setError(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setCurrentStep(3);
                }}
                disabled={summary.toImport === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue to Confirm</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ======================== STEP 4: Confirm ======================== */}
        {currentStep === 3 && (
          <div className="p-6 space-y-6">
            {!confirmResult ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Confirm Import
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Review the import summary below and confirm to add these transactions to your account.
                  </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-center">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{summary.toImport}</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">Transactions to import</p>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-center">
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{summary.billMatches}</p>
                    <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">Bill matches</p>
                  </div>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{summary.debtPayments}</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">Debt payments</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl text-center">
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{summary.duplicates}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Duplicates to skip</p>
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex justify-between">
                  <button
                    onClick={() => {
                      setCurrentStep(2);
                      setError(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={16} />
                    Back to Review
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirming ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Check size={18} />
                        <span>Confirm Import</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Success State */
              <div className="text-center py-8 space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Import Successful
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    Your transactions have been imported.
                  </p>
                </div>

                {/* Result Stats */}
                <div className="inline-flex flex-col gap-2 text-left bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  {confirmResult.imported != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={14} className="text-green-500" />
                      <span className="text-gray-900 dark:text-gray-100">
                        {confirmResult.imported} transactions imported
                      </span>
                    </div>
                  )}
                  {confirmResult.billsMatched != null && confirmResult.billsMatched > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={14} className="text-purple-500" />
                      <span className="text-gray-900 dark:text-gray-100">
                        {confirmResult.billsMatched} bills matched & marked paid
                      </span>
                    </div>
                  )}
                  {confirmResult.debtPayments != null && confirmResult.debtPayments > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={14} className="text-amber-500" />
                      <span className="text-gray-900 dark:text-gray-100">
                        {confirmResult.debtPayments} debt payments recorded
                      </span>
                    </div>
                  )}
                  {confirmResult.skipped != null && confirmResult.skipped > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <X size={14} className="text-gray-400" />
                      <span className="text-gray-500 dark:text-gray-400">
                        {confirmResult.skipped} duplicates skipped
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center gap-4">
                  <a
                    href="/transactions"
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <FileText size={18} />
                    View Transactions
                  </a>
                  <button
                    onClick={resetWizard}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
