// Shared full-height loading spinner. Replaces the ~28 copy-pasted
// `animate-spin rounded-full h-8 w-8 border-b-2` blocks across pages.
export default function PageSpinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center h-64 ${className}`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
