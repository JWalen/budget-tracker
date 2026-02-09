import { useState, useEffect } from 'react';
import {
  BookOpen,
  DollarSign,
  Calendar,
  TrendingUp,
  CreditCard,
  Users,
  Download,
  Moon,
  HelpCircle,
  ChevronRight,
  Search,
  Home,
  FileText,
  Tag,
  Receipt,
  Clock,
  Target,
  PieChart,
  Share2,
  ArrowLeft
} from 'lucide-react';

// Help content sections
const helpSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Home,
    content: `
### Your First Steps
1. **Set up categories** - Go to Categories page and create your income/expense categories
2. **Add your income** - Enter your salary or income sources
3. **Track expenses** - Start adding your daily expenses
4. **Set up bills** - Add your recurring monthly bills
5. **Create budgets** - Set spending limits for each category

### Understanding the Navigation
The sidebar menu is organized into logical groups:
- **Main** - Dashboard and Transactions (your daily use pages)
- **Planning** - Categories, Budgets, Bills, Pay Periods (setup and planning)
- **Tracking** - Debts, Reports, Calendar (monitoring and analysis)
- **Tools** - Bank Import and Settings
    `
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    icon: PieChart,
    content: `
The Dashboard is your financial command center, showing everything at a glance.

### Summary Cards (Top)
- **Current Balance** - Your total available money (all income minus all expenses)
- **Monthly Income** - Total income for the current month
- **Monthly Expenses** - Total spending for the current month
- **Monthly Savings** - The difference between income and expenses

### Recent Transactions
Shows your last 5 transactions with description, category, amount, and date.

### Spending by Category (Pie Chart)
Visual breakdown of where your money is going:
- Hover over sections to see exact amounts
- Click legends to show/hide categories
- Helps identify your biggest expense areas

### Monthly Trend (Line Graph)
Track your financial health over the past 6 months:
- **Green line** - Income trend
- **Red line** - Expense trend
- Quickly spot if expenses are growing faster than income

### Budget Progress Bars
For each category with a budget limit:
- **Green** (0-75%) - You're on track
- **Yellow** (75-90%) - Caution, approaching limit
- **Red** (90%+) - Over or very close to limit
    `
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: FileText,
    content: `
Transactions are the core of your budget - every penny in or out.

### Adding Transactions
1. Choose **Income** or **Expense** tab
2. Enter amount
3. Select category
4. Add description (optional but recommended)
5. Choose date (defaults to today)
6. Click "Add Transaction"

### What Makes a Good Description?
- Be specific: "Grocery shopping at Walmart" not just "Shopping"
- Include vendor: "Shell Gas Station on Main St"
- Add context: "Birthday dinner with friends"

### Managing Existing Transactions
- **Filter** by type, category, or date range
- **Search** by description
- **Edit** any transaction
- **Delete** when needed
- **Bulk select** for mass operations

### Recurring Transactions
For automatic, fixed-amount transactions:
- **Salary/wages** - Automatically record your paycheck
- **Subscriptions** - Netflix, Spotify, gym membership
- **Fixed bills** - Insurance, loan payments
- **Savings transfers** - Weekly/monthly savings deposits

Important: Recurring transactions create entries automatically and immediately affect your balance.
    `
  },
  {
    id: 'categories',
    title: 'Categories',
    icon: Tag,
    content: `
Categories organize and track your spending patterns.

### Creating Custom Categories
**Best Practices:**
- **Not too many** - 10-15 categories is usually enough
- **Not too few** - Be specific enough to track meaningfully
- **Match your life** - Create categories for YOUR spending patterns
- **Use colors** - Assign colors that make visual sense

### Income Categories Special Feature
Toggle "Exclude from income" for non-regular income:
- One-time windfalls
- Gifts
- Transfers between accounts
- Helps keep monthly income realistic

### Managing Categories
- **Edit** - Change name, color, or icon anytime
- **Delete** - Only if no transactions use it
- **Merge** - Move all transactions to another category before deleting
    `
  },
  {
    id: 'bills-vs-recurring',
    title: 'Bills vs Recurring',
    icon: Receipt,
    content: `
Understanding the difference is key to effective tracking.

## Bills (Bills Page)
**Purpose:** Track and manage payments that need your attention

### Use Bills When:
- **Amount varies** - Electricity, water, credit cards
- **Manual payment** - You write a check or initiate transfer
- **Need reminders** - Track what's paid and what's due
- **Want to assign to paychecks** - Pay specific bills from specific checks
- **Track payment status** - Know what's paid/unpaid/overdue

### How Bills Work:
1. Set up the bill with name, amount, due date
2. Each month bill appears as "unpaid"
3. Mark as paid when you pay (creates transaction or links)
4. Track status: Green (paid), Yellow (due), Red (overdue)

## Recurring Transactions
**Purpose:** Automatically create transactions for fixed, regular payments

### Use Recurring When:
- **Same amount always** - $1,500 rent, $50 internet
- **Automatic payment** - Auto-debit from your account
- **Income** - Salary, pension, regular deposits
- **Set and forget** - Don't want monthly interaction

### Can I Use Both?
Yes! Example:
- **Electric Bill**: As Bill (varies monthly, manual pay)
- **Netflix**: As Recurring ($15.99 auto-debit)
- **Rent**: Both - Bill for tracking, Recurring if auto-paid
    `
  },
  {
    id: 'pay-periods',
    title: 'Pay Periods',
    icon: Clock,
    content: `
Pay Periods help you plan which bills to pay with which paycheck.

### What Are Pay Periods?
Think of them as "income buckets" - each paycheck is a bucket, and you assign bills to each bucket.

### Setting Up Pay Periods
1. Navigate to Pay Periods page
2. Add your income sources:
   - Name: "Main Job Paycheck"
   - Amount: Your take-home pay
   - Date: When you receive it
   - Recurring: Toggle on for regular paychecks

### Recurring Options:
- **Weekly** - Every 7 days
- **Biweekly** - Every 14 days
- **Semi-monthly** - 1st and 15th
- **Monthly** - Same day each month

### Assigning Bills
1. Click "+ Assign Bill" on any pay period
2. Select the bill from dropdown
3. System tracks remaining money

### Smart Assignment Strategy:
- **1st paycheck**: Rent, car payment (big fixed)
- **2nd paycheck**: Utilities, credit cards (variable)
- **Spread evenly**: Don't overload one paycheck

### What You'll See:
- **Total Income**: The paycheck amount
- **Total Assigned**: Bills assigned
- **Remaining**: What's left
- **Color coding**: Green (good), Red (overassigned)
    `
  },
  {
    id: 'budgets',
    title: 'Budgets',
    icon: Target,
    content: `
Budgets are spending limits for each category - your financial guardrails.

### Creating Budgets
1. Go to Budgets page
2. Select month and year
3. Set limits for each category:
   - Look at past spending for guidance
   - Start with necessities
   - Then add discretionary

### Budget Strategies

**50/30/20 Rule:**
- 50% - Needs (housing, utilities, food)
- 30% - Wants (entertainment, dining out)
- 20% - Savings and debt payment

**Zero-Based Budget:**
- Every dollar has a job
- Income minus all budgets = 0
- Forces intentional spending

### Monitoring Progress
- **Dashboard** shows progress bars
- **Colors** indicate status:
  - Green (0-75%) - On track
  - Yellow (75-90%) - Caution
  - Red (90%+) - Over/near limit

### When Over Budget
1. **Adjust** if unrealistic
2. **Reduce** spending in that category
3. **Transfer** from another category
4. **Accept** and plan better next month
    `
  },
  {
    id: 'debts',
    title: 'Debts & Loans',
    icon: CreditCard,
    content: `
Track what you owe and what's owed to you.

### Types to Track

**Money You Owe:**
- Credit cards
- Loans (personal, auto, student)
- Mortgage
- Personal debts to family/friends

**Money Owed to You:**
- Personal loans you've given
- Business receivables
- Pending reimbursements

### Setting Up Debts
Required information:
- **Name** - "Chase Visa" or "Car Loan"
- **Type** - Owe/Owed/Loan/Credit Card
- **Current Balance** - What's owed now
- **Original Amount** - Starting balance
- **Interest Rate** - For cost calculation
- **Minimum Payment** - Monthly obligation
- **Due Date** - Day of month due

### Payoff Strategies

**Avalanche Method:**
1. Pay minimums on all
2. Extra to highest interest rate
3. Saves most money long-term

**Snowball Method:**
1. Pay minimums on all
2. Extra to smallest balance
3. Quick wins for motivation
    `
  },
  {
    id: 'calendar',
    title: 'Calendar View',
    icon: Calendar,
    content: `
Visual timeline of your financial life.

### What Shows on Calendar

**Daily Indicators:**
- **Blue (⊕)** - Expected income (pay periods)
- **Green (+)** - Actual income received
- **Red (−)** - Expenses
- **Colored dots** - Bill status:
  - 🟢 Green - Bill paid
  - 🔴 Red - Bill unpaid
  - 🟡 Amber - Debt payment due

### Using Calendar Effectively
- See when paychecks arrive
- Know when bills are due
- Spot cash flow crunches
- Plan large purchases

### Click Any Day
View details for that day:
- All transactions
- Bills due
- Expected income
- Running balance
    `
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    icon: TrendingUp,
    content: `
Turn your data into insights.

### Available Reports

**Income vs Expenses:**
- Bar chart comparing monthly totals
- Trend lines showing direction
- Surplus/deficit for each month

**Category Breakdown:**
- Pie chart of spending distribution
- Top spending categories ranked
- Percentage of total spending

**Trends Over Time:**
- 6-month view of patterns
- Seasonal variations
- Growth rate analysis

### Using Reports

**Monthly Review:**
1. Check income vs expenses
2. Review category spending
3. Compare to budgets
4. Identify problem areas
5. Plan next month

**Quarterly Review:**
1. Look at trends
2. Adjust budgets
3. Review debt progress
4. Update financial goals
    `
  },
  {
    id: 'sharing',
    title: 'Budget Sharing',
    icon: Share2,
    content: `
Share your budget with family or advisors.

### Sharing Levels

**View Only:**
- Can see all financial data
- Cannot make changes
- Perfect for: Accountant, financial advisor

**Edit Access:**
- Can add/edit transactions
- Can manage bills and budgets
- Perfect for: Spouse managing together

### How to Share
1. Go to Settings → Sharing
2. Enter email address
3. Choose permission level
4. They receive invitation
5. Once accepted, they can switch between budgets

### Managing Access
- **Revoke** anytime instantly
- **Change** permissions as needed
- **See** all shared users
- **Control** what each person can do
    `
  },
  {
    id: 'import',
    title: 'Bank Import',
    icon: Download,
    content: `
Import transactions from your bank.

### Supported Formats
- **CSV** - Most common, all banks
- **QFX/OFX** - Quicken format
- **QIF** - Older Quicken format

### Export from Your Bank
1. Log into online banking
2. Find "Download" or "Export"
3. Select date range
4. Choose CSV format
5. Save file

### Import Process
1. Go to Bank Import page
2. Upload your file
3. Map columns (date, description, amount)
4. Review transactions
5. Auto-match to bills/categories
6. Manually categorize remaining
7. Import to add to budget

### Tips
- Set up categories first
- Create match rules for common transactions
- System prevents exact duplicates
- Review before importing
    `
  },
  {
    id: 'tips',
    title: 'Tips & Best Practices',
    icon: HelpCircle,
    content: `
Get the most from your budget tracking.

### Daily Habits (2 minutes)
- Add cash expenses immediately
- Check dashboard summary
- Review overdue bills

### Weekly Routine (10 minutes)
- Review and categorize transactions
- Check budget progress
- Mark bills as paid
- Reconcile with bank

### Monthly Process (30 minutes)
1. Import bank transactions
2. Review for accuracy
3. Analyze reports
4. Adjust next month's budgets
5. Set up new bills
6. Check debt progress
7. Plan upcoming expenses

### Common Mistakes to Avoid
❌ **Too many categories** - Keep under 15-20
❌ **Forgetting cash** - Track immediately
❌ **Unrealistic budgets** - Base on actual spending
❌ **Ignoring it** - Check regularly
❌ **Missing small expenses** - They add up!

### Advanced Strategies

**Digital Envelope Method:**
- Category for each "envelope"
- Strict budgets per envelope
- When it's gone, it's gone

**Sinking Funds:**
- Categories for future expenses
- Save monthly for annual costs
- Christmas, vacation, car maintenance

**Emergency Fund:**
- Track as separate category
- Set goal amount
- Monitor progress
    `
  }
];

export default function Help() {
  const [selectedSection, setSelectedSection] = useState('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSections, setFilteredSections] = useState(helpSections);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const filtered = helpSections.filter(section =>
        section.title.toLowerCase().includes(query) ||
        section.content.toLowerCase().includes(query)
      );
      setFilteredSections(filtered);
    } else {
      setFilteredSections(helpSections);
    }
  }, [searchQuery]);

  const currentSection = helpSections.find(s => s.id === selectedSection) || helpSections[0];

  // Convert markdown-style content to JSX
  const renderContent = (content) => {
    const lines = content.trim().split('\n');
    const elements = [];
    let currentList = [];
    let listType = null;

    lines.forEach((line, index) => {
      // Headers
      if (line.startsWith('### ')) {
        if (currentList.length > 0) {
          elements.push(
            <ul key={`list-${index}`} className={listType === 'ordered' ? 'list-decimal' : 'list-disc'}>
              {currentList}
            </ul>
          );
          currentList = [];
          listType = null;
        }
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">
            {line.substring(4)}
          </h3>
        );
      }
      else if (line.startsWith('## ')) {
        if (currentList.length > 0) {
          elements.push(
            <ul key={`list-${index}`} className={listType === 'ordered' ? 'list-decimal' : 'list-disc'}>
              {currentList}
            </ul>
          );
          currentList = [];
          listType = null;
        }
        elements.push(
          <h2 key={index} className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-3">
            {line.substring(3)}
          </h2>
        );
      }
      // Bold text
      else if (line.includes('**')) {
        if (currentList.length > 0) {
          elements.push(
            <ul key={`list-${index}`} className={listType === 'ordered' ? 'list-decimal' : 'list-disc'}>
              {currentList}
            </ul>
          );
          currentList = [];
          listType = null;
        }
        const parts = line.split(/\*\*(.*?)\*\*/g);
        elements.push(
          <p key={index} className="text-gray-700 dark:text-gray-300 mb-2">
            {parts.map((part, i) =>
              i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part}</strong> : part
            )}
          </p>
        );
      }
      // List items
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        currentList.push(
          <li key={`li-${index}`} className="ml-6 mb-1 text-gray-700 dark:text-gray-300">
            {line.substring(2).split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part}</strong> : part
            )}
          </li>
        );
        listType = 'unordered';
      }
      else if (/^\d+\.\s/.test(line)) {
        currentList.push(
          <li key={`li-${index}`} className="ml-6 mb-1 text-gray-700 dark:text-gray-300">
            {line.replace(/^\d+\.\s/, '').split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part}</strong> : part
            )}
          </li>
        );
        listType = 'ordered';
      }
      // Regular text
      else if (line.trim()) {
        if (currentList.length > 0) {
          elements.push(
            <ul key={`list-${index}`} className={listType === 'ordered' ? 'list-decimal' : 'list-disc'}>
              {currentList}
            </ul>
          );
          currentList = [];
          listType = null;
        }
        elements.push(
          <p key={index} className="text-gray-700 dark:text-gray-300 mb-2">
            {line}
          </p>
        );
      }
    });

    // Add any remaining list items
    if (currentList.length > 0) {
      elements.push(
        <ul key="list-final" className={listType === 'ordered' ? 'list-decimal' : 'list-disc'}>
          {currentList}
        </ul>
      );
    }

    return elements;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sticky top-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <BookOpen size={20} />
              Help Topics
            </h2>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 text-sm"
              />
            </div>

            {/* Topics List */}
            <nav className="space-y-1">
              {filteredSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedSection === section.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-left">{section.title}</span>
                    {selectedSection === section.id && (
                      <ChevronRight size={16} className="ml-auto" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              {currentSection.icon && <currentSection.icon className="text-primary-600 dark:text-primary-400" size={24} />}
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {currentSection.title}
              </h1>
            </div>

            <div className="prose prose-sm max-w-none">
              {renderContent(currentSection.content)}
            </div>

            {/* Quick Tips Box */}
            {selectedSection === 'getting-started' && (
              <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  <HelpCircle size={18} />
                  Quick Start Checklist
                </h3>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <li>✓ Create your expense categories</li>
                  <li>✓ Add your first income transaction</li>
                  <li>✓ Record today's expenses</li>
                  <li>✓ Set up your monthly bills</li>
                  <li>✓ Create your first budget</li>
                </ul>
              </div>
            )}

            {/* Keyboard Shortcuts */}
            {selectedSection === 'tips' && (
              <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Keyboard Shortcuts
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">
                    <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">N</kbd>
                    <span className="ml-2">New transaction</span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">D</kbd>
                    <span className="ml-2">Dashboard</span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">T</kbd>
                    <span className="ml-2">Transactions</span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">ESC</kbd>
                    <span className="ml-2">Close modal</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}