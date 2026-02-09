import { useState, useEffect } from 'react';
import { CreditCard, Check, X, Loader2, Crown, Star, Building2 } from 'lucide-react';
import api from '../api/client';

export default function Subscriptions() {
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, subData] = await Promise.all([
        api.getSubscriptionPlans(),
        api.getCurrentSubscription(),
      ]);
      setPlans(plansData);
      setCurrentSubscription(subData);
    } catch (error) {
      console.error('Failed to load subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    try {
      const { url } = await api.createCheckoutSession(planId);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to create checkout:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const handleManageBilling = async () => {
    try {
      const { url } = await api.getBillingPortal();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      alert('Failed to open billing portal. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const getPlanIcon = (name) => {
    if (name.toLowerCase().includes('business')) return <Building2 className="w-8 h-8" />;
    if (name.toLowerCase().includes('pro')) return <Crown className="w-8 h-8" />;
    return <Star className="w-8 h-8" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscription Plans</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Choose the plan that's right for you
        </p>
      </div>

      {currentSubscription && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Current Plan: {currentSubscription.plan_name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Status: <span className="capitalize">{currentSubscription.status}</span>
              </p>
            </div>
            <button
              onClick={handleManageBilling}
              className="btn btn-secondary"
            >
              <CreditCard size={18} />
              Manage Billing
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentSubscription?.plan_id === plan.id;
          const features = plan.features || {};
          
          return (
            <div
              key={plan.id}
              className={`card border-2 transition-all ${
                isCurrentPlan
                  ? 'border-primary-500 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-3">
                  {getPlanIcon(plan.name)}
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {plan.name}
                </h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    ${plan.price}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  {features.transactions_per_month === -1 ? (
                    <>
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Unlimited transactions
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {features.transactions_per_month} transactions/month
                      </span>
                    </>
                  )}
                </li>
                <li className="flex items-start gap-2">
                  {features.budgets === -1 ? (
                    <>
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Unlimited budgets
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {features.budgets} budgets
                      </span>
                    </>
                  )}
                </li>
                <li className="flex items-start gap-2">
                  {features.advanced_analytics ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Advanced analytics
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  {features.multi_currency ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Multi-currency support
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  {features.receipt_upload ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Receipt upload ({features.receipts_per_month || 0}/month)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  {features.team_members > 0 ? (
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {features.team_members > 0 ? `Up to ${features.team_members} team members` : 'No team collaboration'}
                  </span>
                </li>
              </ul>

              {isCurrentPlan ? (
                <button disabled className="btn btn-secondary w-full" disabled>
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan.stripe_price_id)}
                  className="btn btn-primary w-full"
                >
                  {plan.price === 0 ? 'Start Free' : 'Upgrade'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
