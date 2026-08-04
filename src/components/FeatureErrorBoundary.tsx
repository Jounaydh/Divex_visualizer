import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  createRendererErrorReport,
  reloadRenderer,
  reportRendererError,
} from "../app/crashReporting";

export interface CrashRecoveryAction {
  label: string;
  onSelect: () => void;
  primary?: boolean;
}

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  featureName: string;
  resetKey: string;
  recoveryMessage?: string;
  recoveryActions?: readonly CrashRecoveryAction[];
}

interface FeatureErrorBoundaryState {
  error: Error | null;
  incidentId: string | null;
}

function incidentId() {
  return `DX-${Date.now().toString(36).toUpperCase()}`;
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = {
    error: null,
    incidentId: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error, incidentId: incidentId() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRendererError(
      createRendererErrorReport("react-boundary", error, {
        componentStack: errorInfo.componentStack,
        feature: this.props.featureName,
      }),
    );
  }

  componentDidUpdate(previousProps: FeatureErrorBoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.clearError();
    }
  }

  private clearError = () => {
    this.setState({ error: null, incidentId: null });
  };

  private runRecovery = (action: CrashRecoveryAction) => {
    this.clearError();
    action.onSelect();
  };

  render() {
    const { error, incidentId } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="feature-crash" role="alert">
        <div className="feature-crash-icon">
          <AlertTriangle size={24} />
        </div>
        <span className="feature-crash-eyebrow">
          <ShieldCheck size={14} />
          Crash contained
        </span>
        <h2>{this.props.featureName} stopped safely</h2>
        <p>
          {this.props.recoveryMessage ??
            "The rest of Divex is still available and your project files were not changed."}
        </p>
        <details>
          <summary>Technical details</summary>
          <code>{error.message}</code>
          {incidentId && <small>Incident {incidentId}</small>}
        </details>
        <div className="feature-crash-actions">
          <button
            type="button"
            className="primary"
            onClick={this.clearError}
          >
            <RotateCcw size={14} />
            Try again
          </button>
          {this.props.recoveryActions?.map((action) => (
            <button
              type="button"
              className={action.primary ? "primary" : ""}
              key={action.label}
              onClick={() => this.runRecovery(action)}
            >
              <RefreshCcw size={14} />
              {action.label}
            </button>
          ))}
          <button type="button" onClick={() => reloadRenderer(true)}>
            <ShieldCheck size={14} />
            Reload in safe mode
          </button>
        </div>
      </section>
    );
  }
}
