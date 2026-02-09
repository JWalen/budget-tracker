import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Budget Tracker API',
      version: '1.2.0',
      description: 'Personal finance management and budget tracking API',
      contact: {
        name: 'API Support',
        email: 'support@budgetapp.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5050/api',
        description: 'Development server',
      },
      {
        url: 'https://budget.yourdomain.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            name: {
              type: 'string',
              description: 'User full name',
            },
            mfa_enabled: {
              type: 'boolean',
              description: 'Whether MFA is enabled',
            },
            is_admin: {
              type: 'boolean',
              description: 'Whether user has admin privileges',
            },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Transaction ID',
            },
            user_id: {
              type: 'integer',
              description: 'User ID who owns this transaction',
            },
            category_id: {
              type: 'integer',
              description: 'Category ID',
            },
            amount: {
              type: 'number',
              format: 'decimal',
              description: 'Transaction amount',
            },
            description: {
              type: 'string',
              description: 'Transaction description',
            },
            date: {
              type: 'string',
              format: 'date',
              description: 'Transaction date (YYYY-MM-DD)',
            },
            type: {
              type: 'string',
              enum: ['income', 'expense'],
              description: 'Transaction type',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'When transaction was created',
            },
          },
        },
        Budget: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Budget ID',
            },
            user_id: {
              type: 'integer',
              description: 'User ID who owns this budget',
            },
            category_id: {
              type: 'integer',
              description: 'Category ID this budget applies to',
            },
            amount: {
              type: 'number',
              format: 'decimal',
              description: 'Budget amount limit',
            },
            period: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly', 'yearly'],
              description: 'Budget period',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'When budget was created',
            },
          },
        },
        Category: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Category ID',
            },
            user_id: {
              type: 'integer',
              description: 'User ID who owns this category',
            },
            name: {
              type: 'string',
              description: 'Category name',
            },
            type: {
              type: 'string',
              enum: ['income', 'expense'],
              description: 'Category type',
            },
            color: {
              type: 'string',
              pattern: '^#[0-9A-Fa-f]{6}$',
              description: 'Category color (hex)',
            },
            icon: {
              type: 'string',
              description: 'Lucide icon name',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
