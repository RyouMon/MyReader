import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, ScrollView, Text, View } from "@/tw";

import {
  Screen,
  SectionCard,
  SectionHeading,
  SettingsRow,
  Sheet,
  SheetOption,
} from "../components";
import { DownloadButton } from "../sync/DownloadButton";
import type { FileStateRow } from "../sync/file_state";
import {
  runSync,
  useSyncSchedulerStatus,
  type SyncRunReport,
} from "../sync/scheduler";
import { useSyncActions, type SyncTargetInfo } from "../sync/useSyncActions";
import { useLibraryStore } from "../store/library-store";

type TestResult = { kind: "ok" | "err"; text: string } | null;

/**
 * 同步与下载设置页：
 * - 选择书库 → 展示数据源摘要 → 测试连通
 * - 列出 `file_state` 三态，行内带 DownloadButton 做下载/释放/删除
 * - LocalDirect 模式自动隐藏下载/释放，仅保留删除
 */
export default function SyncScreen() {
  const palette = useThemePalette();
  const { libraries, activeLibraryId } = useLibraryStore();
  const actions = useSyncActions();

  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    activeLibraryId ?? libraries[0]?.id ?? null,
  );
  const [librarySheetOpen, setLibrarySheetOpen] = useState(false);
  const [targetInfo, setTargetInfo] = useState<SyncTargetInfo | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);
  const [rows, setRows] = useState<FileStateRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const selectedLibrary = useMemo(
    () => libraries.find((item) => item.id === selectedLibraryId) ?? null,
    [libraries, selectedLibraryId],
  );

  useEffect(() => {
    if (selectedLibraryId) return;
    const fallback = activeLibraryId ?? libraries[0]?.id ?? null;
    if (fallback) setSelectedLibraryId(fallback);
  }, [activeLibraryId, libraries, selectedLibraryId]);

  const refreshTarget = useCallback(
    async (libraryId: string) => {
      setTargetError(null);
      try {
        const info = await actions.getTargetInfo(libraryId);
        setTargetInfo(info);
        return info;
      } catch (err) {
        setTargetInfo(null);
        setTargetError(describeError(err));
        return null;
      }
    },
    [actions],
  );

  const refreshRows = useCallback(
    async (libraryId: string) => {
      setRowsLoading(true);
      setRowsError(null);
      try {
        const list = await actions.listFileStates(libraryId);
        setRows(list);
      } catch (err) {
        setRows([]);
        setRowsError(describeError(err));
      } finally {
        setRowsLoading(false);
      }
    },
    [actions],
  );

  useEffect(() => {
    if (!selectedLibraryId) return;
    setTestResult(null);
    void refreshTarget(selectedLibraryId);
    void refreshRows(selectedLibraryId);
  }, [refreshRows, refreshTarget, selectedLibraryId]);

  const handleTest = useCallback(async () => {
    if (!selectedLibraryId) return;
    setTesting(true);
    setTestResult(null);
    try {
      await actions.testBackend(selectedLibraryId);
      setTestResult({ kind: "ok", text: "数据源连接通过" });
    } catch (err) {
      setTestResult({ kind: "err", text: describeError(err) });
    } finally {
      setTesting(false);
    }
  }, [actions, selectedLibraryId]);

  const handleReconcile = useCallback(async () => {
    if (!selectedLibraryId) return;
    await refreshRows(selectedLibraryId);
  }, [refreshRows, selectedLibraryId]);

  const schedulerStatus = useSyncSchedulerStatus();
  const [manualReport, setManualReport] = useState<SyncRunReport | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const handleRunAll = useCallback(async () => {
    setManualError(null);
    try {
      const report = await runSync("manual");
      setManualReport(report);
      if (selectedLibraryId) await refreshRows(selectedLibraryId);
    } catch (err) {
      setManualError(describeError(err));
    }
  }, [refreshRows, selectedLibraryId]);

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionHeading title="书库与数据源" />
          <SectionCard>
            <SettingsRow
              title="书库"
              detail={selectedLibrary?.name ?? "未选择书库"}
              onPress={() => setLibrarySheetOpen(true)}
            />
            <SettingsRow
              title="数据源"
              detail={
                targetInfo
                  ? targetInfo.summary
                  : targetError
                    ? targetError
                    : "加载中…"
              }
              isLast
            />
          </SectionCard>
        </View>

        <View className="gap-3">
          <SectionHeading title="连接测试" />
          <SectionCard>
            <View className="gap-3 p-4">
              <Pressable
                accessibilityRole="button"
                disabled={testing || !selectedLibraryId}
                onPress={handleTest}
                className="h-11 flex-row items-center justify-center rounded-full px-4"
                style={{
                  backgroundColor: palette.backgroundSecondary,
                  borderColor: palette.border,
                  borderWidth: 1,
                  columnGap: 8,
                  opacity: testing || !selectedLibraryId ? 0.6 : 1,
                }}
              >
                {testing ? (
                  <ActivityIndicator color={palette.text} size="small" />
                ) : null}
                <Text
                  className="text-[14px]"
                  style={{ color: palette.text, fontWeight: "700" }}
                >
                  {testing ? "测试中…" : "测试连通性"}
                </Text>
              </Pressable>

              {testResult ? (
                <Text
                  className="text-[12px]"
                  style={{
                    color:
                      testResult.kind === "ok" ? palette.success : palette.error,
                  }}
                >
                  {testResult.text}
                </Text>
              ) : null}

              {targetInfo?.isLocalDirect ? (
                <Text
                  className="text-[12px]"
                  style={{ color: palette.textMuted }}
                >
                  本地直读数据源：无需数据库同步，文件仅支持「彻底删除」。
                </Text>
              ) : null}
            </View>
          </SectionCard>
        </View>

        <View className="gap-3">
          <SectionHeading
            title="同步调度"
            detail="启动 / 进入前台 / 手动触发的前台调度器"
          />
          <SectionCard>
            <View className="gap-3 p-4">
              <Pressable
                accessibilityRole="button"
                disabled={schedulerStatus.running}
                onPress={handleRunAll}
                className="h-11 flex-row items-center justify-center rounded-full px-4"
                style={{
                  backgroundColor: palette.primary,
                  columnGap: 8,
                  opacity: schedulerStatus.running ? 0.6 : 1,
                }}
              >
                {schedulerStatus.running ? (
                  <ActivityIndicator color={palette.primaryForeground} size="small" />
                ) : null}
                <Text
                  className="text-[14px]"
                  style={{ color: palette.primaryForeground, fontWeight: "700" }}
                >
                  {schedulerStatus.running ? "同步中…" : "立即同步全部书库"}
                </Text>
              </Pressable>

              {manualError ? (
                <Text className="text-[12px]" style={{ color: palette.error }}>
                  {manualError}
                </Text>
              ) : null}

              {manualReport ? (
                <View className="gap-1">
                  <Text
                    className="text-[12px]"
                    style={{ color: palette.textMuted }}
                  >
                    {manualReport.aborted
                      ? "已跳过（冷却中或同步未启用）"
                      : `完成 · 用时 ${manualReport.durationMs} ms · ${manualReport.results.length} 个书库`}
                  </Text>
                  {manualReport.results.map((item) => (
                    <Text
                      key={item.libraryId}
                      className="text-[11px]"
                      style={{
                        color: item.error
                          ? palette.error
                          : item.skipped
                            ? palette.textMuted
                            : palette.success,
                      }}
                      numberOfLines={2}
                    >
                      · {item.libraryName}：
                      {item.error
                        ? `失败 ${item.error}`
                        : item.skipped
                          ? item.skipReason ?? "已跳过"
                          : `同步 ${item.reconciledCount ?? 0} 个条目`}
                    </Text>
                  ))}
                </View>
              ) : schedulerStatus.lastReport ? (
                <Text
                  className="text-[12px]"
                  style={{ color: palette.textMuted }}
                >
                  上次 {describeTrigger(schedulerStatus.lastReport.trigger)} 同步 · {" "}
                  {formatRelative(schedulerStatus.lastReport.finishedAt)}
                </Text>
              ) : (
                <Text
                  className="text-[12px]"
                  style={{ color: palette.textMuted }}
                >
                  应用启动或从后台返回时会自动触发一次同步。
                </Text>
              )}
            </View>
          </SectionCard>
        </View>

        <View className="gap-3">
          <SectionHeading title="文件状态" detail="manifest × 本地副本的当前三态" />
          <SectionCard>
            <View className="gap-2 px-4 pt-4">
              <Pressable
                accessibilityRole="button"
                disabled={rowsLoading || !selectedLibraryId}
                onPress={handleReconcile}
                className="h-9 flex-row items-center justify-center self-start rounded-full px-4"
                style={{
                  backgroundColor: "transparent",
                  borderColor: palette.border,
                  borderWidth: 1,
                  columnGap: 6,
                  opacity: rowsLoading || !selectedLibraryId ? 0.6 : 1,
                }}
              >
                {rowsLoading ? (
                  <ActivityIndicator color={palette.text} size="small" />
                ) : null}
                <Text
                  className="text-[12px]"
                  style={{ color: palette.text, fontWeight: "700" }}
                >
                  {rowsLoading ? "刷新中…" : "刷新"}
                </Text>
              </Pressable>

              {rowsError ? (
                <Text
                  className="text-[12px]"
                  style={{ color: palette.error }}
                >
                  {rowsError}
                </Text>
              ) : null}
            </View>

            {!selectedLibraryId ? (
              <View className="p-4">
                <Text style={{ color: palette.textMuted }}>请选择书库</Text>
              </View>
            ) : rows.length === 0 ? (
              <View className="p-4">
                <Text style={{ color: palette.textMuted }}>
                  {rowsLoading
                    ? "加载中…"
                    : "暂无跟踪的文件（首次下载或推送后将出现在这里）"}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal={Platform.OS === "web"}
                className="max-h-[360px]"
              >
                <View className="gap-0">
                  {rows.map((row, index) => (
                    <FileStateRowView
                      key={row.path}
                      row={row}
                      libraryId={selectedLibraryId}
                      isLocalDirect={targetInfo?.isLocalDirect ?? false}
                      isLast={index === rows.length - 1}
                      onChanged={() => void refreshRows(selectedLibraryId)}
                    />
                  ))}
                </View>
              </ScrollView>
            )}
          </SectionCard>
        </View>
      </Screen>

      <Sheet open={librarySheetOpen} onClose={() => setLibrarySheetOpen(false)}>
        <View className="gap-2">
          <Text
            className="px-1 text-xs font-semibold uppercase tracking-[0.4px]"
            style={{ color: palette.textMuted }}
          >
            选择书库
          </Text>
          <View className="gap-1">
            {libraries.length === 0 ? (
              <Text
                className="px-2 py-4 text-[13px]"
                style={{ color: palette.textMuted }}
              >
                暂无书库，请先在设置中添加。
              </Text>
            ) : (
              libraries.map((library) => (
                <SheetOption
                  key={library.id}
                  label={library.name}
                  active={library.id === selectedLibraryId}
                  onPress={() => {
                    setSelectedLibraryId(library.id);
                    setLibrarySheetOpen(false);
                  }}
                />
              ))
            )}
          </View>
        </View>
      </Sheet>
    </>
  );
}

function FileStateRowView({
  row,
  libraryId,
  isLocalDirect,
  isLast,
  onChanged,
}: {
  row: FileStateRow;
  libraryId: string;
  isLocalDirect: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const palette = useThemePalette();
  return (
    <View
      className="flex-row items-center justify-between gap-3 px-4 py-3"
      style={{
        borderBottomColor: palette.border,
        borderBottomWidth: isLast ? 0 : 1,
      }}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className="text-[12.5px]"
          numberOfLines={1}
          style={{ color: palette.text, fontWeight: "700" }}
        >
          {row.path}
        </Text>
        <Text
          className="text-[11px]"
          numberOfLines={1}
          style={{ color: palette.textMuted }}
        >
          {row.localState}
          {row.localSize != null ? ` · ${formatBytes(row.localSize)}` : ""}
          {row.localBlake3 ? ` · ${row.localBlake3.slice(0, 12)}…` : ""}
        </Text>
      </View>

      <DownloadButton
        libraryId={libraryId}
        relativePath={row.path}
        initialState={row.localState}
        isLocalDirect={isLocalDirect}
        onStateChange={onChanged}
      />
    </View>
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function describeTrigger(trigger: "startup" | "foreground" | "manual"): string {
  if (trigger === "startup") return "启动";
  if (trigger === "foreground") return "返回前台";
  return "手动";
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 30_000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(timestamp).toLocaleString();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
