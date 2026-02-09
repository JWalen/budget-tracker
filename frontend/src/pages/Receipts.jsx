import { useState, useEffect } from 'react';
import { Receipt, Upload, X, Image, FileText, Download, Tag } from 'lucide-react';
import api from '../api/client';

export default function Receipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      const data = await api.getReceipts();
      setReceipts(data);
    } catch (error) {
      console.error('Failed to load receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      await api.uploadReceipt(formData);
      await loadReceipts();
    } catch (error) {
      console.error('Failed to upload receipt:', error);
      alert('Failed to upload receipt.');
    } finally {
      setUploading(false);
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
        <label className="btn btn-primary cursor-pointer">
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
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Upload receipt images to keep track of your expenses
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
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
                  {new Date(receipt.created_at).toLocaleDateString()}
                </p>
                {receipt.amount && (
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    ${Number(receipt.amount).toFixed(2)}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-secondary text-sm flex-1">
                    <Download size={14} />
                    Download
                  </button>
                  <button className="btn btn-outline text-sm">
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
