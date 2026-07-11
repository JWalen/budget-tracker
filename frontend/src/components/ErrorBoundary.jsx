import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

// Route-level error boundary. A malformed API payload or a render bug in one page
// would otherwise unmount the whole React tree (white screen). This confines the
// failure to the routed content and offers a recovery path.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Page error:', error, info);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Something went wrong on this page</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The rest of the app is still working. Try reloading this page.
            </p>
          </div>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
