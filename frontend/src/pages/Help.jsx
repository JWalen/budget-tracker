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
  ArrowLeft,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Sparkles,
  Wallet,
  HardDrive,
  Globe,
  Shield,
  Server,
  ArrowLeftRight,
} from 'lucide-react';

// Help content sections
const helpSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Home,
    content: `
Welcome to Budget Tracker! Here's the quickest path to a working budget.

### First launch (desktop app)
On first run you'll pick how the app runs:
- **Standalone** - everything on this computer (most people). Your data stays local.
- **Server** - host your data for other devices on your network.
- **Client** - connect to another computer running in Server mode.

You can change this anytime from **File → Setup**.

### Your first steps
1. **Add your accounts** - Accounts page: add your checking, savings, credit cards.
2. **Set up categories** - Categories page: create your income and expense categories (or create them on the fly while adding a transaction).
3. **Add income & expenses** - Transactions page: record money in and out.
4. **Import your bank statement** - Import page: bring in history in bulk and auto-categorize it.
5. **Create budgets** - set monthly spending limits per category.
6. **Set up bills & pay periods** - track what's due and assign bills to paychecks.

### Getting around
The sidebar is grouped by purpose:
- **Top** - Dashboard, Transactions
- **Finances** - Accounts, Budgets, Bills, Recurring, Debts
- **Planning** - AI Assistant, Reports, Pay Periods, Templates, Analytics
- **Manage** - Categories, Auto-Categorize, Receipts, Import, Currency, Family Members
- **Account** - Households, Backups, Notifications, Settings, Help
- **Admin Console** (admins) - AI setup, users, and the error log
    `
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: PieChart,
    content: `
The Dashboard is your at-a-glance financial summary for the selected month.

### Summary cards
- **Balance / Income / Expenses / Savings** for the month. Transfers between your own accounts are **not** counted as income or expenses.

### Spending by category (pie chart)
Where your money went. Hover for exact amounts; click legend items to show/hide.

### Monthly trend (line graph)
Income vs. expenses over recent months, so you can spot trends early.

### Budget progress
Per-category bars: **green** on track, **yellow** approaching the limit, **red** over.
    `
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: FileText,
    content: `
Transactions are the heart of the app - every dollar in, out, or moved.

### Adding a transaction
1. Click **Add Transaction**.
2. Pick a type: **Expense**, **Income**, or **Transfer**.
3. Enter the amount, pick the account, and (for income/expense) a category.
4. Add an optional description and the date.
5. Save.

Tip: need a category that doesn't exist yet? Choose **"+ Create new category…"** right in the category dropdown - no need to leave the page.

### Searching
Use the **search box** at the top to find transactions by description or category. Search looks across **all dates**, not just the current month - handy for finding that one charge from months ago. Clear it to return to the monthly view.

### Editing & bulk actions
- Click the pencil to edit, the trash to delete.
- **Select** multiple rows to move them to an account or run **AI Categorize** in bulk.

### Transfers
Choose **Transfer** to move money between two of your own accounts (e.g. checking → savings). See the "Accounts & Transfers" section for details.
    `
  },
  {
    id: 'accounts-transfers',
    title: 'Accounts & Transfers',
    icon: Wallet,
    content: `
### Accounts
Add each place your money lives - checking, savings, credit cards, cash - on the **Accounts** page. Assign each a name, type, and color. Transactions can be tagged to an account so you can see activity per account.

### Transfers (moving money between accounts)
When you move money between your own accounts, record it as a **Transfer** (the third option next to Expense/Income), not as an expense + income:
1. Add Transaction → **Transfer**.
2. Choose a **From account** and a **To account**.
3. Enter the amount and date.

Why it matters: transfers are **excluded from your income and expense totals** everywhere - dashboard, reports, budgets. Moving $500 to savings isn't spending or earning, so it won't skew your numbers. Transfers show in the list as \`From → To\` with a transfer icon.
    `
  },
  {
    id: 'categories',
    title: 'Categories',
    icon: Tag,
    content: `
Categories organize your spending and power budgets and reports.

### Good category habits
- **10-20 categories** is usually the sweet spot - specific enough to be useful, not so many it's noise.
- Match your actual life and give them colors that make sense at a glance.

### Exclude from income
On income categories, toggle **"Exclude from income"** for one-off money (gifts, windfalls) so your monthly income stays realistic.

### Create on the fly
You can add a category directly from the transaction form via **"+ Create new category…"**.

### Managing
Edit name/color/icon anytime. You can delete a category once nothing uses it.
    `
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant & Auto-Categorization',
    icon: Sparkles,
    content: `
Budget Tracker can use AI (Claude or OpenAI) to categorize transactions and answer questions - and it **learns** so you stop needing it for the same merchants.

### Turn it on (admin)
Go to **Admin → AI Configuration**:
1. Toggle AI on and pick a provider (Claude or OpenAI).
2. Paste your API key (encrypted at rest, never shown again).
3. Click **Fetch available** to load the models your key can use, then pick one.

You supply your own API key, so usage is billed by your provider. Faster models (Claude Haiku/Sonnet, GPT-4o mini) are cheaper and rarely hit rate limits.

### Categorize transactions
On the Transactions page, select some (or use **AI Categorize** for all uncategorized this month). Review the AI's suggestions, adjust any, and apply.

### It learns (auto-rules)
When you apply AI suggestions, keep **"Save as auto-categorization rules"** checked. The app remembers the merchant → category so **future imports of the same vendor are categorized automatically - no AI call needed.** Manage these under Import → Match Rules.

### Chat
The AI Assistant page lets you ask about your finances; it can also take simple actions (create a transaction, category, budget, etc.) on your behalf.

### If you see "rate limited"
That's your AI provider pushing back. Wait ~30 seconds or switch to a faster model in Admin → AI Configuration.
    `
  },
  {
    id: 'import',
    title: 'Bank Import',
    icon: Download,
    content: `
Bring in history in bulk instead of typing it all.

### How it works
1. **Import** page → upload a CSV or bank statement file.
2. Map the columns (date, description, amount) if needed.
3. The app matches rows against your **auto-categorization rules** and bills.
4. Review the proposed categories and matches, fix anything, and confirm.

### Auto-categorization
Rows are matched by merchant text against your **Match Rules** (Import → Match Rules). Rules are created automatically when you accept AI suggestions, or you can add them by hand. The more you import and confirm, the more gets categorized for you next time.

### Duplicates
The importer flags likely duplicates so you don't double-count transactions you already have.
    `
  },
  {
    id: 'match-rules',
    title: 'Match Rules',
    icon: Tag,
    content: `
Match Rules auto-assign a category (or link a bill/debt) based on a snippet of the transaction description.

### Where they come from
- **Automatically** when you apply AI categorizations (with "Save as auto-rules" on).
- **Manually** on the Import → Match Rules page.

### How they work
Each rule has a **pattern** (e.g. \`AMZN Mktp\`) and a target category. On import, any transaction whose description contains the pattern gets that category. You can also apply rules to existing transactions.

### Tips
- Keep patterns short and distinctive (the merchant name, not the whole line).
- Delete or edit a rule anytime if it's too broad.
    `
  },
  {
    id: 'bills-recurring',
    title: 'Bills vs Recurring',
    icon: Receipt,
    content: `
Two related-but-different tools.

### Bills (Bills page)
Things that need your attention and get **marked paid**: rent, utilities, subscriptions with variable amounts. Track due dates, see what's upcoming/overdue, and record payments (which can create the matching transaction).

### Recurring transactions (Recurring page)
Fixed, automatic entries: salary, a flat subscription, a set savings transfer. These generate transactions on schedule and affect your balance automatically.

### Which to use?
- Need reminders and to mark things paid? → **Bill**.
- Same amount, hands-off, should just post itself? → **Recurring**.
    `
  },
  {
    id: 'pay-periods',
    title: 'Pay Periods',
    icon: Clock,
    content: `
Pay periods help you plan which paycheck covers which bills.

### Setup
Add your income events (paychecks) with amount and date on the **Pay Periods** page, then assign bills to each period.

### Why
It answers "can this paycheck cover these bills?" and helps avoid the end-of-month squeeze by spreading obligations across paychecks.
    `
  },
  {
    id: 'budgets',
    title: 'Budgets',
    icon: Target,
    content: `
Budgets set a monthly spending limit per category and track your progress.

### Setup
On the **Budgets** page, set a limit for each category you want to cap. The dashboard and budgets page show progress bars (green/yellow/red).

### Templates
Start from a strategy like **50/30/20**, **Zero-based**, or **Envelope** and tweak from there.

### Tip
Base limits on what you actually spend (check Reports first), then tighten gradually - unrealistic budgets get ignored.
    `
  },
  {
    id: 'debts',
    title: 'Debts & Loans',
    icon: CreditCard,
    content: `
Track loans and credit-card balances and watch them shrink.

### Setup
Add each debt with its balance, interest rate, and minimum payment on the **Debts** page.

### Payoff
Log payments to update the balance. Use Reports to see progress over time. Focus extra payments on the highest-interest debt (avalanche) or the smallest balance (snowball) - your call.
    `
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    icon: TrendingUp,
    content: `
Understand your money beyond a single month.

### Reports
- **Spending by category**, **budget performance**, **cash flow**, and **monthly/weekly** breakdowns.
- Transfers are excluded so income/expense/net figures stay accurate.

### Analytics
Deeper charts - trends, savings rate, category comparisons over time.

### Export
Download your data as CSV to use in a spreadsheet.
    `
  },
  {
    id: 'calendar',
    title: 'Calendar View',
    icon: Calendar,
    content: `
See your finances on a calendar: transactions and upcoming bills by day. Useful for spotting heavy spending days and planning around due dates.
    `
  },
  {
    id: 'receipts-currency',
    title: 'Receipts & Multi-Currency',
    icon: Globe,
    content: `
### Receipts
Attach a receipt image to a transaction so you have a record. Stored locally with the app (or S3 if configured).

### Multi-currency
Set your currency in Settings. The app supports 20 currencies with live exchange rates. If live rates aren't available, it tells you rather than silently converting at the wrong rate.
    `
  },
  {
    id: 'households',
    title: 'Households (Sharing)',
    icon: Users,
    content: `
Share a budget with family or a partner via **Households** (Organizations).

### How it works
- Create a household and invite members by email.
- Roles: **Owner / Admin** (manage members), **Member** (edit), **Viewer** (read-only).
- When you view a shared budget, you're working in that owner's data; view-only members can't make changes.

Switch between your own budget and shared ones from the budget switcher in the top bar.
    `
  },
  {
    id: 'backups',
    title: 'Backups & Restore',
    icon: HardDrive,
    content: `
Everything backup-related lives on the **Backups** page (one place - Settings and Admin just link here).

### Back up
- **Back Up Now** - creates a backup and keeps it in your history (restorable later).
- **Download a copy** - saves a \`.json\` file you can keep offline or move to another computer/your server.

### Restore
On the Backups page → **Restore Data**, choose a backup \`.json\` file. Restore **replaces** your current data and rebuilds everything - accounts, transactions, categories, budgets, bills, debts, family members, and their links.

### Automatic backups
Use **Schedule** to run backups automatically and keep the last N per your retention setting.

### Good habit
Download a copy periodically and keep it somewhere safe (another drive or your server). That's your insurance.
    `
  },
  {
    id: 'settings-updates',
    title: 'Settings, Security & Updates',
    icon: Shield,
    content: `
### Profile & security (Settings)
- Change your password.
- Enable **two-factor authentication (MFA)** with an authenticator app for extra protection.

### Updates
The desktop app checks GitHub for new versions automatically on launch. You can also check manually:
- **File → Check for Updates…** (menu bar), or
- **Settings → About → Check for Updates**.

If a newer version exists, it opens the download page - grab the new installer and (on Mac) drag it into Applications, replacing the old copy.

### Deployment mode
Change Standalone / Server / Client anytime via **File → Setup**.
    `
  },
  {
    id: 'tips',
    title: 'Tips & Best Practices',
    icon: HelpCircle,
    content: `
Get the most from your budget with light, consistent habits.

### Daily (2 min)
- Add cash expenses right away.
- Glance at the dashboard.

### Weekly (10 min)
- Categorize new transactions (let AI + rules do the heavy lifting).
- Check budget progress and mark bills paid.

### Monthly (30 min)
1. Import your bank statement.
2. Review for accuracy.
3. Read the reports.
4. Adjust next month's budgets.
5. Check debt progress.
6. **Download a backup.**

### Avoid these
- Too many categories (keep it under ~20).
- Forgetting cash spending.
- Unrealistic budgets - base them on real spending.
- Never reviewing - a budget you ignore doesn't help.
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