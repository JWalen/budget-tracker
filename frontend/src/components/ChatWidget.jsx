import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Brain, Loader, Minimize2, Sparkles } from 'lucide-react';
import { api } from '../api/client';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [isAiAvailable, setIsAiAvailable] = useState(true);

  useEffect(() => {
    // Check if AI is available when mounting
    api.getAIStatus().then(status => {
      setIsAiAvailable(status.available);
    }).catch(() => setIsAiAvailable(false));
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (isAiAvailable) {
        setMessages([{
          type: 'assistant',
          content: 'Hi! I\'m Penny, your AI budget assistant. Ask me about your spending or budget!',
          timestamp: new Date().toISOString()
        }]);
      } else {
        setMessages([{
          type: 'system',
          content: 'AI Assistant is currently offline. Please enable it in Admin settings.',
          timestamp: new Date().toISOString()
        }]);
      }
    }
  }, [isOpen, isAiAvailable]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatAIResponse = (response) => {
    if (typeof response === 'object') {
      if (response.type === 'spending_summary') {
        const { data } = response;
        return `📊 Spending Summary:\n• Expenses: $${data.total_expenses?.toFixed(2)}\n• Income: $${data.total_income?.toFixed(2)}\n• Txns: ${data.expense_count} exp, ${data.income_count} inc`;
      } else if (response.type === 'budget_status') {
        return `📈 Budget Status:\n${response.data.slice(0, 5).map(b =>
          `• ${b.category}: $${b.spent.toFixed(0)}/$${b.budget.toFixed(0)}`
        ).join('\n')}${response.data.length > 5 ? '\n...' : ''}`;
      } else if (response.type === 'ai_response') {
        return response.response;
      } else if (response.type === 'error') {
        return response.message || 'An error occurred';
      }
      return JSON.stringify(response, null, 2);
    }
    return response;
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
      let content = formatAIResponse(response.response);
      const done = (response.actions || []).filter((a) => a && !a.error);
      if (done.length) {
        content += '\n\n' + done.map((a) => {
          const r = a.result || {};
          if (a.tool === 'create_transaction') return `✓ Added ${r.created?.type} “${r.created?.description}” $${Number(r.created?.amount || 0).toFixed(2)}`;
          if (a.tool === 'create_category') return `✓ Created category “${r.category?.name}”`;
          if (a.tool === 'set_budget') return `✓ Budget: ${r.budget?.category} $${Number(r.budget?.amount_limit || 0).toFixed(2)}`;
          if (a.tool === 'categorize_transactions') return `✓ Categorized ${r.updated} as ${r.category}`;
          if (a.tool === 'create_bill') return `✓ Bill “${r.bill?.name}” $${Number(r.bill?.amount || 0).toFixed(2)}`;
          return `✓ ${a.tool}`;
        }).join('\n');
      }
      const assistantMessage = {
        type: 'assistant',
        content,
        timestamp: response.timestamp
      };
      setMessages(prev => [...prev, assistantMessage]);
      if (response.didAct) window.dispatchEvent(new CustomEvent('penny:acted'));
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'error',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isAiAvailable && !isOpen) return null; // Optionally hide if not available, but user might want to see why

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end print:hidden">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 h-[500px] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200">
          {/* Header */}
          <div className="bg-primary-600 p-4 flex justify-between items-center text-white shadow-md">
            <div className="flex items-center gap-2">
              <Brain size={20} className="text-primary-100" />
              <div>
                <h3 className="font-semibold text-sm leading-tight">Penny</h3>
                <p className="text-[10px] text-primary-100 opacity-90">Your Budget Assistant</p>
              </div>
            </div>
            <button aria-label="Minimize chat" 
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
            >
              <Minimize2 size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.type === 'user' 
                    ? 'bg-primary-600 text-white rounded-br-none shadow-sm' 
                    : msg.type === 'system'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 rounded-bl-none'
                    : msg.type === 'error'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 rounded-bl-none'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none shadow-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-none p-3 shadow-sm flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-primary-600" />
                  <span className="text-xs text-gray-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <form onSubmit={handleSendMessage} className="flex gap-2 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about spending..."
                disabled={!isAiAvailable}
                className="flex-1 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-full px-4 py-2.5 focus:ring-2 focus:ring-primary-500 dark:text-white placeholder-gray-400 focus:outline-none transition-shadow"
              />
              <button aria-label="Send message" 
                type="submit"
                disabled={!input.trim() || loading || !isAiAvailable}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 text-white p-1.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow"
              >
                <Send size={16} className={input.trim() ? 'ml-0.5' : ''} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
          isOpen 
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rotate-90' 
            : 'bg-gradient-to-r from-primary-600 to-primary-500 text-white'
        }`}
        aria-label="Toggle AI Assistant"
      >
        {isOpen ? (
          <X size={24} />
        ) : (
          <>
            <Brain size={28} className="animate-pulse-slow" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white dark:border-gray-900"></span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}
