import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Check, X, Loader } from 'lucide-react';

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [inviteDetails, setInviteDetails] = useState(null);

  useEffect(() => {
    if (!user) {
      // Store the token in sessionStorage so we can accept after login
      sessionStorage.setItem('pendingInviteToken', token);
      navigate('/login');
      return;
    }

    checkInvite();
  }, [user, token]);

  const checkInvite = async () => {
    try {
      // Get pending invites to check if this one is for the current user
      const pendingInvites = await api.getPendingInvites();
      const thisInvite = pendingInvites.find(inv => inv.invite_token === token);

      if (thisInvite) {
        setInviteDetails(thisInvite);
      } else {
        setError('This invitation is not valid or has already been accepted.');
      }
    } catch (err) {
      setError('Failed to load invitation details');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.acceptInvite(token);
      setSuccess(true);
      setTimeout(() => {
        navigate('/sharing');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to accept invitation');
      setLoading(false);
    }
  };

  const handleDecline = () => {
    navigate('/dashboard');
  };

  if (loading && !inviteDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin h-12 w-12 text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full p-6">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-6 text-center">
            <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-700 dark:text-red-300 mb-2">
              Invalid Invitation
            </h2>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full p-6">
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-6 text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-green-700 dark:text-green-300 mb-2">
              Invitation Accepted!
            </h2>
            <p className="text-green-600 dark:text-green-400">
              You now have access to the shared budget. Redirecting...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="card">
          <div className="text-center mb-6">
            <UserPlus className="h-12 w-12 text-primary-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Budget Share Invitation
            </h1>
          </div>

          {inviteDetails && (
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">From:</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {inviteDetails.owner_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {inviteDetails.owner_email}
                </p>
              </div>

              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                <p className="text-sm text-primary-700 dark:text-primary-300 mb-2">
                  You're being invited to {inviteDetails.role === 'edit' ? 'collaborate on' : 'view'} this budget
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {inviteDetails.role === 'edit' ? (
                    <ul className="list-disc list-inside space-y-1">
                      <li>Add and edit transactions</li>
                      <li>Create and manage budgets</li>
                      <li>View all financial reports</li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-1">
                      <li>View all transactions</li>
                      <li>See budget progress</li>
                      <li>Access financial reports (read-only)</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDecline}
              disabled={loading}
              className="flex-1 btn-secondary"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={loading}
              className="flex-1 btn-primary"
            >
              {loading ? 'Accepting...' : 'Accept Invitation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}