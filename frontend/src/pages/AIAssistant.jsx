import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import {
  Brain, Send, AlertCircle, TrendingUp, TrendingDown,
  Lightbulb, Loader, Check, X, Sparkles, MessageSquare,
  BarChart3, AlertTriangle, DollarSign, Target, Trash2
} from 'lucide-react';

export default function AIAssistant() {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [insights, setInsights] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [billOptimization, setBillOptimization] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    checkAIStatus();
    loadDashboard();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkAIStatus = async () => {
    try {
      const status = await api.getAIStatus();
      setAiStatus(status);

      if (!status.available) {
        setMessages([{
          type: 'system',
          content: 'AI Assistant is offline. An administrator needs to enable it and add an API key in Admin → AI Configuration.',
          timestamp: new Date().toISOString()
        }]);
        return;
      }

      // Load persisted chat history so the conversation survives refreshes.
      let history = [];
      try {
        const res = await api.getAIHistory();
        history = res.messages || [];
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }

      if (history.length > 0) {
        setMessages(history.map((m) => ({
          type: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          timestamp: m.created_at
        })));
      } else {
        setMessages([{
          type: 'assistant',
          content: 'Hello! I\'m your AI budget assistant. I can help you analyze spending, detect anomalies, optimize bills, and answer questions about your finances. How can I help you today?',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Failed to check AI status:', error);
      toast.error(error.message || 'Failed to check AI status.');
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.clearAIHistory();
      setMessages([{
        type: 'assistant',
        content: 'History cleared. How can I help you today?',
        timestamp: new Date().toISOString()
      }]);
      toast.success('Chat history cleared');
    } catch (error) {
      toast.error(error.message || 'Failed to clear history');
    }
  };

  const loadDashboard = async () => {
    try {
      const [dashboardData, anomalyData, budgetRecs] = await Promise.all([
        api.getAIInsights(),
        api.getAIAnomalies(),
        api.getAIBudgetRecommendations()
      ]);

      setInsights(dashboardData.insights);
      setAnomalies(anomalyData.anomalies);
      setRecommendations(budgetRecs.recommendations);
    } catch (error) {
      console.error('Failed to load AI dashboard:', error);
      toast.error(error.message || 'Failed to load AI dashboard.');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = {
      type: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.sendAIChat(input);

      const assistantMessage = {
        type: 'assistant',
        content: formatAIResponse(response.response),
        timestamp: response.timestamp
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        type: 'error',
        content: 'Failed to get response. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const formatAIResponse = (response) => {
    if (typeof response === 'object') {
      if (response.type === 'spending_summary') {
        const { data } = response;
        return `📊 Spending Summary:\n• Total Expenses: $${Number(data.total_expenses || 0).toFixed(2)}\n• Total Income: $${Number(data.total_income || 0).toFixed(2)}\n• Transactions: ${data.expense_count} expenses, ${data.income_count} income`;
      } else if (response.type === 'budget_status') {
        return `📈 Budget Status:\n${response.data.map(b =>
          `• ${b.category}: $${Number(b.spent || 0).toFixed(2)}/$${Number(b.budget || 0).toFixed(2)} (${Number(b.remaining || 0) > 0 ? `$${Number(b.remaining || 0).toFixed(2)} left` : `$${Math.abs(Number(b.remaining || 0)).toFixed(2)} over`})`
        ).join('\n')}`;
      } else if (response.type === 'ai_response') {
        return response.response;
      }
      return JSON.stringify(response, null, 2);
    }
    return response;
  };

  const loadBillOptimization = async () => {
    setLoading(true);
    try {
      const optimization = await api.getAIBillOptimization();
      setBillOptimization(optimization);
    } catch (error) {
      console.error('Failed to optimize bills:', error);
      toast.error(error.message || 'Failed to optimize bills.');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="text-red-500" size={20} />;
      case 'warning': return <AlertTriangle className="text-yellow-500" size={20} />;
      case 'success': return <Check className="text-green-500" size={20} />;
      default: return <Lightbulb className="text-blue-500" size={20} />;
    }
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700';
      case 'success': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700';
      default: return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700';
    }
  };

  const quickActions = [
    { label: 'How much did I spend this month?', query: 'How much did I spend this month?' },
    { label: 'Show budget status', query: 'What is my budget status?' },
    { label: 'Find unusual spending', query: 'Are there any unusual transactions?' },
    { label: 'Optimize my bills', query: 'How should I optimize my bill payments?' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Budget Assistant</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Remembers your conversation • Ask about spending, budgets, and bills
            </p>
          </div>
        </div>
        {aiStatus && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            aiStatus.available
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${aiStatus.available ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            {aiStatus.available ? 'Online' : 'Offline'}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {['chat', 'insights', 'anomalies', 'optimize'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'optimize' && !billOptimization) {
                loadBillOptimization();
              }
            }}
            className={`px-4 py-2 font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {tab === 'chat' && <MessageSquare className="inline w-4 h-4 mr-1" />}
            {tab === 'insights' && <Sparkles className="inline w-4 h-4 mr-1" />}
            {tab === 'anomalies' && <AlertTriangle className="inline w-4 h-4 mr-1" />}
            {tab === 'optimize' && <Target className="inline w-4 h-4 mr-1" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="card p-0 flex flex-col h-[600px]">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Conversation</span>
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400"
              title="Clear chat history"
            >
              <Trash2 size={14} /> Clear history
            </button>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] rounded-lg p-3 ${
                  msg.type === 'user'
                    ? 'bg-primary-600 text-white'
                    : msg.type === 'error'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                  <Loader className="animate-spin w-5 h-5 text-primary-600" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(action.query)}
                  className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 whitespace-nowrap"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything about your budget..."
                className="flex-1 input"
                disabled={loading || !aiStatus?.available}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || !aiStatus?.available}
                className="btn-primary px-4"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          {insights && insights.length > 0 ? (
            insights.map((insight, idx) => (
              <div key={idx} className={`card border ${getSeverityClass(insight.severity)}`}>
                <div className="flex items-start gap-3">
                  {getSeverityIcon(insight.severity)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {insight.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {insight.message}
                    </p>
                    {insight.data && (
                      <div className="mt-2 text-xs bg-white dark:bg-gray-800 p-2 rounded">
                        <code>{JSON.stringify(insight.data, null, 2)}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card text-center py-8">
              <Sparkles className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No insights available yet.</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Start adding transactions to get personalized insights.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Anomalies Tab */}
      {activeTab === 'anomalies' && (
        <div className="space-y-4">
          {anomalies.length > 0 ? (
            anomalies.map((anomaly, idx) => (
              <div key={idx} className="card border border-yellow-200 dark:border-yellow-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-yellow-500 mt-1" size={20} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {anomaly.description}
                      </h3>
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        anomaly.severity === 'high'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {anomaly.severity}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      ${Number(anomaly.amount || 0).toFixed(2)} • {anomaly.category} • {new Date(anomaly.date).toLocaleDateString()}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {anomaly.explanation}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card text-center py-8">
              <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No unusual transactions detected.</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Your spending patterns look normal!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Optimize Tab */}
      {activeTab === 'optimize' && (
        <div className="space-y-4">
          {loading ? (
            <div className="card text-center py-8">
              <Loader className="animate-spin w-8 h-8 text-primary-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Analyzing your bills...</p>
            </div>
          ) : billOptimization ? (
            <>
              {/* Bill Assignments */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Optimized Bill Assignments
                </h3>
                <div className="space-y-2">
                  {billOptimization.assignments?.map((assignment, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                      <div className="flex-1">
                        <span className="font-medium">{assignment.bill}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                          Due: Day {assignment.dueDay}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${Number(assignment.amount || 0).toFixed(2)}</div>
                        <div className="text-xs text-primary-600">→ {assignment.assignedTo}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Period Summary */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Pay Period Summary
                </h3>
                <div className="space-y-3">
                  {billOptimization.periodSummary?.map((period, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{period.period}</span>
                        <span className={`text-sm ${
                          period.remainingIncome > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {period.remainingIncome > 0 ? '+' : ''}${Number(period.remainingIncome || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Bills: ${Number(period.totalAssigned || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Recommendation */}
              {billOptimization.aiRecommendation && (
                <div className="card border border-primary-200 dark:border-primary-700">
                  <div className="flex items-start gap-3">
                    <Brain className="text-primary-600 mt-1" size={20} />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        AI Recommendation
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {billOptimization.aiRecommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-8">
              <Target className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No bill optimization data available.</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Add bills and pay periods to get optimization suggestions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Budget Recommendations */}
      {activeTab === 'insights' && recommendations && recommendations.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Target size={20} />
            Budget Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                <div className="flex-1">
                  <div className="font-medium">{rec.category}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{rec.reason}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    rec.action === 'increase' ? 'text-yellow-600' :
                    rec.action === 'decrease' ? 'text-blue-600' :
                    'text-green-600'
                  }`}>
                    {rec.action === 'create' ? 'Create' :
                     rec.action === 'increase' ? '↑ Increase' : '↓ Decrease'}
                  </div>
                  <div className="text-sm">
                    ${Number(rec.currentBudget || 0).toFixed(2)} → ${Number(rec.recommendedBudget || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}