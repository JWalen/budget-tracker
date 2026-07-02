import { useState, useEffect } from 'react';
import { Receipt, Upload, X, FileText, Download } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatDateOnly, formatCurrency } from '../utils/format';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/', 'application/pdf'];

export default function Receipts() {
  const toast = useToast();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      const data = await api.getReceipts();
      setReceipts(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // Validate file type and size before uploading
    if (!ALLOWED_TYPES.some((t) => file.type.startsWith(t))) {
      toast.error('Unsupported file type. Please upload an image or PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 10 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      await api.uploadReceipt(formData);
      toast.success('Receipt uploaded');
      await loadReceipts();
    } catch (err) {
      toast.error(err.message || 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (receipt) => {
    setDownloadingId(receipt.id);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/file`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) {
        throw new Error('Failed to download receipt');
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.url) {
          window.open(data.url, '_blank', 'noopener');
          return;
        }
        throw new Error('Receipt file not available');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = receipt.file_name || receipt.description || `receipt-${receipt.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || 'Failed to download receipt');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (receipt) => {
    if (!window.confirm('Delete this receipt? This cannot be undone.')) return;
    setDeletingId(receipt.id);
    try {
      await api.deleteReceipt(receipt.id);
      toast.success('Receipt deleted');
      await loadReceipts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete receipt');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Receipts</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Upload and manage your receipt images
          </p>
        </div>
        <label className={`btn btn-primary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={18} />
          {uploading ? 'Uploading...' : 'Upload Receipt'}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {receipts.length === 0 ? (
        <div className="card text-center py-12">
          <Receipt className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Receipts Yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Upload receipt images to keep track of your expenses
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="card p-0 overflow-hidden">
              <div className="aspect-video bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {receipt.file_type?.startsWith('image/') ? (
                  <img
                    src={receipt.file_url}
                    alt="Receipt"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-16 h-16 text-gray-400" />
                )}
              </div>
              <div className="p-4">
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {receipt.description || 'Untitled Receipt'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {formatDateOnly(receipt.created_at)}
                </p>
                {receipt.amount && (
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(receipt.amount)}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleDownload(receipt)}
                    disabled={downloadingId === receipt.id}
                    className="btn btn-secondary text-sm flex-1"
                  >
                    <Download size={14} />
                    {downloadingId === receipt.id ? 'Downloading...' : 'Download'}
                  </button>
                  <button
                    onClick={() => handleDelete(receipt)}
                    disabled={deletingId === receipt.id}
                    className="btn btn-outline text-sm"
                    aria-label="Delete receipt"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
