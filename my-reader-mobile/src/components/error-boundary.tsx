import { errorMessage } from "@/src/i18n/error-message"
import React from "react"
import { useTranslation } from "react-i18next"

import { useThemePalette } from "@/src/design/tokens"
import { Pressable, Text, View } from "@/tw"

function ErrorFallback({
  title,
  message,
  error,
  onRetry,
}: {
  title?: string
  message?: string
  error: Error
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()

  return (
    <View
      className="flex-1 items-center justify-center gap-3 px-8 py-8"
      style={{ backgroundColor: palette.background }}
    >
      <Text className="text-base font-semibold" style={{ color: palette.text }}>
        {title ?? t("errorBoundary.defaultTitle")}
      </Text>
      <Text
        className="text-sm text-center"
        style={{ color: palette.textMuted }}
      >
        {message ?? errorMessage(error)}
      </Text>
      <Pressable
        className="mt-2 rounded-lg px-6 py-2.5"
        style={{ backgroundColor: palette.primary }}
        onPress={onRetry}
      >
        <Text
          className="text-base font-semibold"
          style={{ color: palette.textOnPrimary }}
        >
          {t("errorBoundary.retry")}
        </Text>
      </Pressable>
    </View>
  )
}

interface ErrorBoundaryProps {
  title?: string
  message?: string
  onRetry?: () => void
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[ErrorBoundary] 组件渲染崩溃:",
      error.message,
      "\n",
      info.componentStack,
    )
  }

  handleRetry = () => {
    this.props.onRetry?.()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <ErrorFallback
          title={this.props.title}
          message={this.props.message}
          error={error}
          onRetry={this.handleRetry}
        />
      )
    }
    return this.props.children
  }
}
