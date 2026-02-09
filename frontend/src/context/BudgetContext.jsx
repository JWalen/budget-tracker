import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const BudgetContext = createContext(null);

export const BudgetProvider = ({ children }) => {
  const { user } = useAuth();
  const [activeBudgetOwner, setActiveBudgetOwner] = useState(null);
  const [sharedBudgets, setSharedBudgets] = useState([]);
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    if (user) {
      loadShares();
      const savedOwnerId = localStorage.getItem('budgetOwnerId');
      if (!savedOwnerId || parseInt(savedOwnerId) === user.id) {
        setActiveBudgetOwner(null);
        setIsReadOnly(false);
      }
    }
  }, [user]);

  const loadShares = async () => {
    try {
      const data = await api.getShares();
      setSharedBudgets(data.sharedWithMe || []);

      const savedOwnerId = localStorage.getItem('budgetOwnerId');
      if (savedOwnerId && parseInt(savedOwnerId) !== user?.id) {
        const share = data.sharedWithMe?.find((s) => s.owner_id === parseInt(savedOwnerId));
        if (share) {
          setActiveBudgetOwner({ id: share.owner_id, name: share.owner_name, email: share.owner_email });
          setIsReadOnly(share.role === 'view');
        } else {
          localStorage.removeItem('budgetOwnerId');
          setActiveBudgetOwner(null);
          setIsReadOnly(false);
        }
      }
    } catch (error) {
      console.error('Failed to load shares:', error);
    }
  };

  const switchBudget = (owner) => {
    if (!owner || owner.id === user?.id) {
      localStorage.removeItem('budgetOwnerId');
      setActiveBudgetOwner(null);
      setIsReadOnly(false);
    } else {
      localStorage.setItem('budgetOwnerId', String(owner.id));
      setActiveBudgetOwner(owner);
      const share = sharedBudgets.find((s) => s.owner_id === owner.id);
      setIsReadOnly(share?.role === 'view');
    }
  };

  return (
    <BudgetContext.Provider value={{ activeBudgetOwner, sharedBudgets, isReadOnly, switchBudget, loadShares }}>
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = () => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
};
