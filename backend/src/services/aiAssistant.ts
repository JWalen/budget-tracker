import { query } from '../config/database';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Ollama configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// GPU Detection and Model Selection
interface SystemCapabilities {
  hasGPU: boolean;
  gpuName?: string;
  vram?: number;
  recommendedModel: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

interface TransactionData {
  id: number;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: Date;
  category?: string;
  account?: string;
}

interface BudgetInsight {
  type: 'overspending' | 'saving' | 'anomaly' | 'optimization' | 'recommendation';
  title: string;
  message: string;
  data?: any;
  severity: 'info' | 'warning' | 'success' | 'critical';
}

export class AIAssistant {
  private static systemCapabilities: SystemCapabilities | null = null;
  private static selectedModel: string | null = null;

  // Detect GPU and system capabilities
  static async detectSystemCapabilities(): Promise<SystemCapabilities> {
    if (this.systemCapabilities) {
      return this.systemCapabilities;
    }

    let hasGPU = false;
    let gpuName: string | undefined;
    let vram: number | undefined;
    let recommendedModel = 'llama3.2:1b'; // Default to smallest model

    try {
      // Try to detect NVIDIA GPU (most common for AI workloads)
      const { stdout: nvidiaOutput } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null').catch(() => ({ stdout: '' }));

      if (nvidiaOutput && nvidiaOutput.trim()) {
        hasGPU = true;
        const [name, memory] = nvidiaOutput.trim().split(',').map(s => s.trim());
        gpuName = name;
        vram = parseInt(memory) / 1024; // Convert MB to GB

        // Select model based on VRAM
        if (vram >= 24) {
          recommendedModel = 'llama3.2:70b'; // Large model for high-end GPUs
        } else if (vram >= 12) {
          recommendedModel = 'llama3.2:13b'; // Medium model
        } else if (vram >= 8) {
          recommendedModel = 'llama3.2:7b'; // Standard model
        } else if (vram >= 4) {
          recommendedModel = 'llama3.2:3b'; // Small model
        } else {
          recommendedModel = 'llama3.2:1b'; // Tiny model for low VRAM
        }
      }

      // If no NVIDIA GPU, try to detect Apple Silicon
      if (!hasGPU) {
        const { stdout: macOutput } = await execAsync('sysctl -n hw.optional.arm64 2>/dev/null').catch(() => ({ stdout: '' }));

        if (macOutput && macOutput.trim() === '1') {
          hasGPU = true;
          gpuName = 'Apple Silicon GPU';

          // Check for unified memory size
          const { stdout: memOutput } = await execAsync('sysctl -n hw.memsize 2>/dev/null').catch(() => ({ stdout: '' }));
          if (memOutput) {
            const totalMemGB = parseInt(memOutput) / (1024 * 1024 * 1024);

            // Apple Silicon uses unified memory
            if (totalMemGB >= 64) {
              recommendedModel = 'llama3.2:13b';
            } else if (totalMemGB >= 32) {
              recommendedModel = 'llama3.2:7b';
            } else if (totalMemGB >= 16) {
              recommendedModel = 'llama3.2:3b';
            } else {
              recommendedModel = 'llama3.2:1b';
            }
          }
        }
      }

      // If still no GPU detected, check if we're in a container environment
      // where we might be talking to a remote Ollama instance (which might have GPU)
      if (!hasGPU) {
         // Check if OLLAMA_BASE_URL is remote/containerized
         const ollamaHost = OLLAMA_BASE_URL.replace('http://', '').split(':')[0];
         if (ollamaHost !== 'localhost' && ollamaHost !== '127.0.0.1') {
           // We are talking to a remote host (e.g. 'ollama' container)
           // We can't verify GPU, but we shouldn't assume CPU only if auto-gpu is enabled
           const settings = await query('SELECT value FROM system_settings WHERE key = $1', ['ai_auto_gpu']);
           if (settings.rows.length > 0 && settings.rows[0].value === 'true') {
             // Assume GPU might be available on remote host
             hasGPU = true;
             gpuName = 'Remote / Containerized (Unknown)';
             recommendedModel = 'llama3.2:3b'; // Safe default for GPU
           }
         }
      }

      // If no GPU detected, check CPU and RAM for CPU inference
      if (!hasGPU) {
        const { stdout: memInfo } = await execAsync("free -g 2>/dev/null | grep Mem | awk '{print $2}'").catch(() => ({ stdout: '' }));

        if (memInfo) {
          const ramGB = parseInt(memInfo.trim());

          if (ramGB >= 32) {
            recommendedModel = 'llama3.2:3b'; // Can handle small models on CPU with enough RAM
          } else if (ramGB >= 16) {
            recommendedModel = 'llama3.2:1b';
          } else {
            recommendedModel = 'llama3.2:1b'; // Smallest model for low-resource systems
          }
        }
      }
    } catch (error) {
      console.log('GPU detection error:', error);
    }

    // Override with environment variable if set
    if (process.env.OLLAMA_MODEL) {
      recommendedModel = process.env.OLLAMA_MODEL;
    }

    this.systemCapabilities = {
      hasGPU,
      gpuName,
      vram,
      recommendedModel
    };

    console.log('System capabilities detected:', this.systemCapabilities);
    return this.systemCapabilities;
  }

  // Check if Ollama is available and get optimal model
  static async isAvailable(): Promise<boolean> {
    try {
      // Check if AI is enabled in settings
      const settings = await query('SELECT value FROM system_settings WHERE key = $1', ['ai_enabled']);
      if (settings.rows.length > 0 && settings.rows[0].value !== 'true') {
        return false;
      }

      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!response.ok) return false;

      // Get system capabilities and select best model
      const capabilities = await this.detectSystemCapabilities();
      const models: any = await response.json();

      // Check if recommended model is available
      const modelExists = models.models?.some((m: any) =>
        m.name.startsWith(capabilities.recommendedModel.split(':')[0])
      );

      if (modelExists) {
        this.selectedModel = capabilities.recommendedModel;
      } else {
        // Fallback to first available model
        this.selectedModel = models.models?.[0]?.name || 'llama3.2:1b';
      }

      console.log(`AI Assistant ready with model: ${this.selectedModel} (GPU: ${capabilities.hasGPU ? capabilities.gpuName : 'None'})`);
      return true;
    } catch (error) {
      console.log('Ollama is not available:', error);
      return false;
    }
  }

  // Pull a model from Ollama library with progress streaming
  static async pullModelStream(modelName: string): Promise<any> {
    try {
      if (!await this.isAvailable()) return null;

      const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true })
      });

      if (!response.ok || !response.body) return null;
      return response.body;
    } catch (error) {
      console.error('Model pull stream error:', error);
      return null;
    }
  }

  // Pull a model from Ollama library
  static async pullModel(modelName: string): Promise<boolean> {
    try {
      if (!await this.isAvailable()) return false;

      const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false })
      });

      return response.ok;
    } catch (error) {
      console.error('Model pull error:', error);
      return false;
    }
  }

  // List available models
  static async listModels(): Promise<string[]> {
    try {
      if (!await this.isAvailable()) return [];

      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      const data = await response.json() as any;
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('List models error:', error);
      return [];
    }
  }

  // Get the selected model
  static async getModel(): Promise<string> {
    if (!this.selectedModel) {
      await this.isAvailable();
    }
    return this.selectedModel || 'llama3.2:1b';
  }

  // Generate response from Ollama
  static async generate(prompt: string, context?: string): Promise<string> {
    try {
      const model = await this.getModel();

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: context ? `${context}\n\n${prompt}` : prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Ollama API error');
      }

      const data = await response.json() as OllamaResponse;
      return data.response;
    } catch (error) {
      console.error('Ollama generation error:', error);
      throw error;
    }
  }

  // Natural language query processor
  static async processNaturalQuery(userId: number, query: string): Promise<any> {
    try {
      // Analyze the query to determine intent
      const intent = await this.analyzeQueryIntent(query);

      switch (intent.type) {
        case 'spending_query':
          return await this.handleSpendingQuery(userId, intent);
        case 'budget_query':
          return await this.handleBudgetQuery(userId, intent);
        case 'transaction_search':
          return await this.handleTransactionSearch(userId, intent);
        case 'insight_request':
          // TODO: Implement generateInsights method
          return { insights: [] };
        default:
          return await this.handleGeneralQuery(userId, query);
      }
    } catch (error) {
      console.error('Natural query processing error:', error);
      throw error;
    }
  }

  // Analyze spending patterns
  static async analyzeSpending(userId: number, month?: number, year?: number): Promise<BudgetInsight[]> {
    const insights: BudgetInsight[] = [];

    const currentDate = new Date();
    const targetMonth = month || currentDate.getMonth() + 1;
    const targetYear = year || currentDate.getFullYear();

    try {
      // Get spending data
      const spending = await query(`
        SELECT
          c.name as category,
          c.type,
          SUM(ABS(t.amount)) as total,
          COUNT(t.id) as count,
          AVG(ABS(t.amount)) as avg_amount,
          b.amount as budget_amount
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN budgets b ON b.category_id = c.id
          AND b.month = $2 AND b.year = $3 AND b.user_id = $1
        WHERE t.user_id = $1
          AND EXTRACT(MONTH FROM t.date) = $2
          AND EXTRACT(YEAR FROM t.date) = $3
          AND t.type = 'expense'
        GROUP BY c.id, c.name, c.type, b.amount
        ORDER BY total DESC
      `, [userId, targetMonth, targetYear]);

      // Analyze overspending
      for (const row of spending.rows) {
        if (row.budget_amount && row.total > row.budget_amount) {
          const overPercent = ((row.total - row.budget_amount) / row.budget_amount * 100).toFixed(1);
          insights.push({
            type: 'overspending',
            title: `Overspending in ${row.category}`,
            message: `You've exceeded your ${row.category} budget by ${overPercent}% ($${(row.total - row.budget_amount).toFixed(2)})`,
            severity: parseFloat(overPercent) > 50 ? 'critical' : 'warning',
            data: { category: row.category, spent: row.total, budget: row.budget_amount }
          });
        }
      }

      // Detect unusual patterns
      const historicalSpending = await query(`
        SELECT
          c.name as category,
          AVG(monthly.total) as avg_monthly,
          STDDEV(monthly.total) as stddev_monthly
        FROM (
          SELECT
            category_id,
            EXTRACT(MONTH FROM date) as month,
            EXTRACT(YEAR FROM date) as year,
            SUM(ABS(amount)) as total
          FROM transactions
          WHERE user_id = $1 AND type = 'expense'
            AND date >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY category_id, EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
        ) monthly
        LEFT JOIN categories c ON monthly.category_id = c.id
        GROUP BY c.id, c.name
      `, [userId]);

      // Compare current spending to historical averages
      for (const current of spending.rows) {
        const historical = historicalSpending.rows.find(h => h.category === current.category);
        if (historical && historical.stddev_monthly) {
          const zScore = (current.total - historical.avg_monthly) / historical.stddev_monthly;

          if (Math.abs(zScore) > 2) {
            insights.push({
              type: 'anomaly',
              title: `Unusual spending in ${current.category}`,
              message: zScore > 0
                ? `Your ${current.category} spending is significantly higher than usual ($${current.total.toFixed(2)} vs average $${historical.avg_monthly.toFixed(2)})`
                : `Your ${current.category} spending is significantly lower than usual ($${current.total.toFixed(2)} vs average $${historical.avg_monthly.toFixed(2)})`,
              severity: 'info',
              data: { category: current.category, current: current.total, average: historical.avg_monthly }
            });
          }
        }
      }

      // Generate AI-powered insights
      if (await this.isAvailable()) {
        const spendingContext = `
          Monthly spending analysis for ${targetMonth}/${targetYear}:
          ${spending.rows.map(r => `- ${r.category}: $${r.total} (${r.count} transactions, avg: $${r.avg_amount})`).join('\n')}
        `;

        const aiInsight = await this.generate(
          'Based on this spending data, provide 2-3 actionable recommendations to improve budget management. Be specific and practical.',
          spendingContext
        );

        insights.push({
          type: 'recommendation',
          title: 'AI Budget Recommendations',
          message: aiInsight,
          severity: 'info'
        });
      }

      return insights;
    } catch (error) {
      console.error('Spending analysis error:', error);
      return insights;
    }
  }

  // Optimize bill assignments to pay periods
  static async optimizeBillAssignments(userId: number): Promise<any> {
    try {
      // Get all bills and pay periods
      const [bills, payPeriods] = await Promise.all([
        query('SELECT * FROM bills WHERE user_id = $1 AND is_active = true ORDER BY due_day', [userId]),
        query('SELECT * FROM pay_periods WHERE user_id = $1 AND is_active = true ORDER BY pay_day', [userId])
      ]);

      if (payPeriods.rows.length === 0) {
        return { error: 'No pay periods configured' };
      }

      // Calculate optimal assignments
      const assignments = [];
      const periodTotals = new Map();

      // Initialize period totals
      for (const period of payPeriods.rows) {
        periodTotals.set(period.id, 0);
      }

      // Sort bills by amount (largest first for better distribution)
      const sortedBills = bills.rows.sort((a, b) => b.amount - a.amount);

      for (const bill of sortedBills) {
        // Find the pay period that comes before the due date with the least current load
        let bestPeriod = null;
        let minLoad = Infinity;

        for (const period of payPeriods.rows) {
          const currentLoad = periodTotals.get(period.id);

          // Check if this pay period comes before the bill due date
          const periodDay = period.pay_day;
          const billDay = bill.due_day;

          // Simple check - in reality, this needs more sophisticated date logic
          const daysBefore = billDay >= periodDay ? billDay - periodDay : 31 - periodDay + billDay;

          if (daysBefore <= 15 && currentLoad < minLoad) {
            bestPeriod = period;
            minLoad = currentLoad;
          }
        }

        if (bestPeriod) {
          assignments.push({
            bill: bill.name,
            amount: bill.amount,
            dueDay: bill.due_day,
            assignedTo: bestPeriod.name,
            payDay: bestPeriod.pay_day
          });
          periodTotals.set(bestPeriod.id, periodTotals.get(bestPeriod.id) + bill.amount);
        }
      }

      // Generate summary
      const summary = {
        assignments,
        periodSummary: Array.from(periodTotals.entries()).map(([periodId, total]) => {
          const period = payPeriods.rows.find(p => p.id === periodId);
          return {
            period: period.name,
            totalAssigned: total,
            remainingIncome: period.amount - total
          };
        })
      };

      // Get AI recommendation if available
      if (await this.isAvailable()) {
        const context = `
          Bill optimization analysis:
          Pay periods: ${payPeriods.rows.map(p => `${p.name}: $${p.amount} on day ${p.pay_day}`).join(', ')}
          Bills: ${bills.rows.map(b => `${b.name}: $${b.amount} due on day ${b.due_day}`).join(', ')}
        `;

        const recommendation = await this.generate(
          'Provide recommendations for optimizing these bill payments across pay periods. Consider due dates, amounts, and cash flow.',
          context
        );

        (summary as any)['aiRecommendation'] = recommendation;
      }

      return summary;
    } catch (error) {
      console.error('Bill optimization error:', error);
      throw error;
    }
  }

  // Detect anomalies in transactions
  static async detectAnomalies(userId: number): Promise<any[]> {
    try {
      const result = await query(`
        WITH transaction_stats AS (
          SELECT
            category_id,
            AVG(ABS(amount)) as avg_amount,
            STDDEV(ABS(amount)) as stddev_amount,
            COUNT(*) as transaction_count
          FROM transactions
          WHERE user_id = $1
            AND date >= CURRENT_DATE - INTERVAL '3 months'
            AND type = 'expense'
          GROUP BY category_id
          HAVING COUNT(*) >= 5
        )
        SELECT
          t.id,
          t.description,
          t.amount,
          t.date,
          c.name as category,
          ts.avg_amount,
          ts.stddev_amount,
          ABS((ABS(t.amount) - ts.avg_amount) / NULLIF(ts.stddev_amount, 0)) as z_score
        FROM transactions t
        JOIN transaction_stats ts ON t.category_id = ts.category_id
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
          AND t.date >= CURRENT_DATE - INTERVAL '30 days'
          AND t.type = 'expense'
          AND ABS((ABS(t.amount) - ts.avg_amount) / NULLIF(ts.stddev_amount, 0)) > 2.5
        ORDER BY z_score DESC
        LIMIT 10
      `, [userId]);

      const anomalies = result.rows.map(row => ({
        id: row.id,
        description: row.description,
        amount: Math.abs(row.amount),
        date: row.date,
        category: row.category,
        severity: row.z_score > 3 ? 'high' : 'medium',
        explanation: `This ${row.category} transaction of $${Math.abs(row.amount).toFixed(2)} is ${row.z_score.toFixed(1)} standard deviations from your typical spending of $${row.avg_amount.toFixed(2)}`
      }));

      return anomalies;
    } catch (error) {
      console.error('Anomaly detection error:', error);
      return [];
    }
  }

  // Budget recommendations based on spending patterns
  static async generateBudgetRecommendations(userId: number): Promise<any> {
    try {
      // Get current spending patterns
      const spending = await query(`
        SELECT
          c.id as category_id,
          c.name as category,
          AVG(monthly.total) as avg_monthly,
          MAX(monthly.total) as max_monthly,
          MIN(monthly.total) as min_monthly,
          b.amount as current_budget
        FROM (
          SELECT
            category_id,
            EXTRACT(MONTH FROM date) as month,
            EXTRACT(YEAR FROM date) as year,
            SUM(ABS(amount)) as total
          FROM transactions
          WHERE user_id = $1
            AND type = 'expense'
            AND date >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY category_id, EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
        ) monthly
        LEFT JOIN categories c ON monthly.category_id = c.id
        LEFT JOIN budgets b ON b.category_id = c.id
          AND b.user_id = $1
          AND b.month = EXTRACT(MONTH FROM CURRENT_DATE)
          AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)
        WHERE c.id IS NOT NULL
        GROUP BY c.id, c.name, b.amount
      `, [userId]);

      const recommendations = [];

      for (const row of spending.rows) {
        const recommended = row.avg_monthly * 1.1; // 10% buffer

        if (!row.current_budget) {
          recommendations.push({
            category: row.category,
            action: 'create',
            currentBudget: 0,
            recommendedBudget: Math.ceil(recommended / 10) * 10, // Round to nearest $10
            reason: `Based on your average spending of $${row.avg_monthly.toFixed(2)}/month`
          });
        } else if (row.current_budget < row.avg_monthly * 0.9) {
          recommendations.push({
            category: row.category,
            action: 'increase',
            currentBudget: row.current_budget,
            recommendedBudget: Math.ceil(recommended / 10) * 10,
            reason: `Your budget is consistently exceeded. Average spending: $${row.avg_monthly.toFixed(2)}`
          });
        } else if (row.current_budget > row.max_monthly * 1.5) {
          recommendations.push({
            category: row.category,
            action: 'decrease',
            currentBudget: row.current_budget,
            recommendedBudget: Math.ceil(row.max_monthly * 1.2 / 10) * 10,
            reason: `Budget is much higher than your maximum spending of $${row.max_monthly.toFixed(2)}`
          });
        }
      }

      return recommendations;
    } catch (error) {
      console.error('Budget recommendation error:', error);
      return [];
    }
  }

  // Private helper methods
  private static async analyzeQueryIntent(query: string): Promise<any> {
    const lowerQuery = query.toLowerCase();

    // Simple intent detection - could be enhanced with AI
    if (lowerQuery.includes('spend') || lowerQuery.includes('spent')) {
      return { type: 'spending_query', timeframe: this.extractTimeframe(lowerQuery) };
    } else if (lowerQuery.includes('budget')) {
      return { type: 'budget_query' };
    } else if (lowerQuery.includes('transaction') || lowerQuery.includes('purchase')) {
      return { type: 'transaction_search', query: lowerQuery };
    } else if (lowerQuery.includes('insight') || lowerQuery.includes('analysis')) {
      return { type: 'insight_request' };
    }

    return { type: 'general' };
  }

  private static extractTimeframe(query: string): any {
    // Extract timeframe from natural language
    const today = new Date();

    if (query.includes('today')) {
      return { start: today, end: today };
    } else if (query.includes('yesterday')) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    } else if (query.includes('this month')) {
      return {
        month: today.getMonth() + 1,
        year: today.getFullYear()
      };
    } else if (query.includes('last month')) {
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return {
        month: lastMonth.getMonth() + 1,
        year: lastMonth.getFullYear()
      };
    }

    return null;
  }

  private static async handleSpendingQuery(userId: number, intent: any): Promise<any> {
    const timeframe = intent.timeframe || {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    };

    const result = await query(`
      SELECT
        SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        COUNT(CASE WHEN type = 'expense' THEN 1 END) as expense_count,
        COUNT(CASE WHEN type = 'income' THEN 1 END) as income_count
      FROM transactions
      WHERE user_id = $1
        ${timeframe.month ? 'AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3' : ''}
    `, timeframe.month ? [userId, timeframe.month, timeframe.year] : [userId]);

    return {
      type: 'spending_summary',
      data: result.rows[0],
      timeframe
    };
  }

  private static async handleBudgetQuery(userId: number, intent: any): Promise<any> {
    const result = await query(`
      SELECT
        c.name as category,
        b.amount as budget,
        COALESCE(SUM(ABS(t.amount)), 0) as spent,
        b.amount - COALESCE(SUM(ABS(t.amount)), 0) as remaining
      FROM budgets b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.user_id = b.user_id
        AND EXTRACT(MONTH FROM t.date) = b.month
        AND EXTRACT(YEAR FROM t.date) = b.year
        AND t.type = 'expense'
      WHERE b.user_id = $1
        AND b.month = EXTRACT(MONTH FROM CURRENT_DATE)
        AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY c.id, c.name, b.amount
      ORDER BY remaining ASC
    `, [userId]);

    return {
      type: 'budget_status',
      data: result.rows
    };
  }

  private static async handleTransactionSearch(userId: number, intent: any): Promise<any> {
    const searchTerms = intent.query.split(' ').filter((term: string) => term.length > 2);

    const result = await query(`
      SELECT
        t.*,
        c.name as category_name,
        ba.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN bank_accounts ba ON t.account_id = ba.id
      WHERE t.user_id = $1
        AND LOWER(t.description) LIKE ANY($2::text[])
      ORDER BY t.date DESC
      LIMIT 20
    `, [userId, searchTerms.map((term: string) => `%${term}%`)]);

    return {
      type: 'transaction_results',
      data: result.rows
    };
  }

  private static async handleGeneralQuery(userId: number, query: string): Promise<any> {
    // For general queries, use AI if available
    if (await this.isAvailable()) {
      // Get some context about the user's budget
      const context = await this.getUserContext(userId);

      const response = await this.generate(
        query,
        `You are Penny, a helpful and witty budget assistant with a good sense of humor. Here's the user's current financial context:\n${context}\n\nAnswer their question concisely, helpfully, and with a touch of humor where appropriate.`
      );

      return {
        type: 'ai_response',
        response
      };
    }

    return {
      type: 'error',
      message: 'AI assistant is not available. Please ensure Ollama is running.'
    };
  }

  private static async getUserContext(userId: number): Promise<string> {
    // Gather relevant context for AI responses
    const [summary] = await Promise.all([
      query(`
        SELECT
          COUNT(DISTINCT t.id) as total_transactions,
          COUNT(DISTINCT c.id) as total_categories,
          COUNT(DISTINCT b.id) as active_budgets,
          SUM(CASE WHEN t.type = 'income' AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', CURRENT_DATE) THEN t.amount ELSE 0 END) as monthly_income,
          SUM(CASE WHEN t.type = 'expense' AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', CURRENT_DATE) THEN ABS(t.amount) ELSE 0 END) as monthly_expenses
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN budgets b ON b.user_id = $1
          AND b.month = EXTRACT(MONTH FROM CURRENT_DATE)
          AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)
        WHERE t.user_id = $1
      `, [userId])
    ]);

    const data = summary.rows[0];
    return `
      Total transactions: ${data.total_transactions}
      Categories used: ${data.total_categories}
      Active budgets: ${data.active_budgets}
      Current month income: $${data.monthly_income?.toFixed(2) || 0}
      Current month expenses: $${data.monthly_expenses?.toFixed(2) || 0}
    `;
  }
}

export default AIAssistant;