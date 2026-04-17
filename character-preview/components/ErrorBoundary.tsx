"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  onError?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, errorMessage: "3D scene failed to render." };
  }

  componentDidCatch(error: Error) {
    console.error("[3D Error]", error.message);
    this.setState({ errorMessage: error.message || "3D scene failed to render." });
    this.props.onError?.();
  }

  private reset = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#070E1A",
            color: "#C8D0DC",
            fontFamily: "Georgia, serif",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#D4A843" }}>
            3D Scene Error
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, maxWidth: 320, textAlign: "center" }}>
            {this.state.errorMessage}
          </div>
          <button
            onClick={this.reset}
            style={{
              marginTop: 6,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid rgba(212,168,67,0.45)",
              background: "rgba(212,168,67,0.12)",
              color: "#D4A843",
              cursor: "pointer",
            }}
          >
            Retry 3D
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
