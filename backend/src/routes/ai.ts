import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import AIAssistant from '../services/aiAssistant';
import { body, query as queryValidator } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Check if AI assistant is available
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const available = await AIAssistant.isAvailable();
    const capabilities = await AIAssistant.detectSystemCapabilities();
    const model = await AIAssistant.getModel();

    res.json({
      available,
      message: available
        ? 'AI Assistant is ready'
        : 'AI Assistant is offline. Please ensure Ollama is running on your system.',
      model,
      capabilities: {
        hasGPU: capabilities.hasGPU,
        gpuName: capabilities.gpuName,
        vram: capabilities.vram ? `${capabilities.vram}GB` : undefined,
        recommendedModel: capabilities.recommendedModel
      }
    });
  } catch (error) {
    console.error('AI status check error:', error);
    res.status(500).json({ error: 'Failed to check AI status' });
  }
});

// Process natural language query
router.post('/query',
  [
    body('query').trim().isLength({ min: 3, max: 1000 }).withMessage('Query must be 3-1000 characters'),
    handleValidationErrors
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { query } = req.body;
      const result = await AIAssistant.processNaturalQuery(req.userId!, query);
      res.json(result);
    } catch (error) {
      console.error('Natural query error:', error);
      res.status(500).json({ error: 'Failed to process query' });
    }
  }
);

// Get spending insights
router.get('/insights/spending',
  [
    queryValidator('month').optional().isInt({ min: 1, max: 12 }),
    queryValidator('year').optional().isInt({ min: 2020, max: 2100 }),
    handleValidationErrors
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;

      const insights = await AIAssistant.analyzeSpending(req.userId!, month, year);
      res.json({ insights });
    } catch (error) {
      console.error('Spending insights error:', error);
      res.status(500).json({ error: 'Failed to generate spending insights' });
    }
  }
);

// Get bill optimization suggestions
router.get('/optimize/bills', async (req: AuthRequest, res: Response) => {
  try {
    const optimization = await AIAssistant.optimizeBillAssignments(req.userId!);
    res.json(optimization);
  } catch (error) {
    console.error('Bill optimization error:', error);
    res.status(500).json({ error: 'Failed to optimize bill assignments' });
  }
});

// Detect anomalies in spending
router.get('/anomalies', async (req: AuthRequest, res: Response) => {
  try {
    const anomalies = await AIAssistant.detectAnomalies(req.userId!);
    res.json({ anomalies });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

// Get budget recommendations
router.get('/recommendations/budget', async (req: AuthRequest, res: Response) => {
  try {
    const recommendations = await AIAssistant.generateBudgetRecommendations(req.userId!);
    res.json({ recommendations });
  } catch (error) {
    console.error('Budget recommendations error:', error);
    res.status(500).json({ error: 'Failed to generate budget recommendations' });
  }
});

// Chat with AI assistant
router.post('/chat',
  [
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
    body('context').optional().isObject(),
    handleValidationErrors
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, context } = req.body;

      // Check if AI is available
      const available = await AIAssistant.isAvailable();
      if (!available) {
        return res.status(503).json({
          error: 'AI Assistant is not available. Please install and run Ollama locally.'
        });
      }

      // Process the message with user context
      const response = await AIAssistant.processNaturalQuery(req.userId!, message);

      res.json({
        response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
);

// Get quick insights dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const [spending, anomalies, recommendations] = await Promise.all([
      AIAssistant.analyzeSpending(req.userId!),
      AIAssistant.detectAnomalies(req.userId!),
      AIAssistant.generateBudgetRecommendations(req.userId!)
    ]);

    // Get top 3 most important insights
    const topInsights = spending
      .filter(i => i.severity === 'critical' || i.severity === 'warning')
      .slice(0, 3);

    // Get top 3 anomalies
    const topAnomalies = anomalies.slice(0, 3);

    // Get top 3 recommendations
    const topRecommendations = recommendations.slice(0, 3);

    res.json({
      insights: topInsights,
      anomalies: topAnomalies,
      recommendations: topRecommendations,
      summary: {
        totalInsights: spending.length,
        criticalCount: spending.filter(i => i.severity === 'critical').length,
        warningCount: spending.filter(i => i.severity === 'warning').length
      }
    });
  } catch (error) {
    console.error('AI dashboard error:', error);
    res.status(500).json({ error: 'Failed to load AI dashboard' });
  }
});

export default router;