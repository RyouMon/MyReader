import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ErrorBoundaryProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] 组件渲染崩溃:", error.message, "\n", info.componentStack);
  }

  handleRetry = () => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{this.props.title ?? "页面遇到了意外错误"}</Text>
          <Text style={styles.message}>{this.props.message ?? error.message}</Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>重试</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
    backgroundColor: "#FAF8F5",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1917",
  },
  message: {
    fontSize: 14,
    color: "#78716C",
    textAlign: "center",
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#C4622D",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});
