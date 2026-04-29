import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useForm, useStore } from "@tanstack/react-form";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Alert, TextInput as RNTextInput, StyleSheet } from "react-native";
import { z } from "zod";

import type { DataSource } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { TextInput, View } from "@/tw";

import {
  FormFieldSwitch,
  FormLabeledFieldRow,
  HeaderToolbar,
  Screen,
  type HeaderToolbarAction,
} from "../components";
import { useDataSourceStore } from "../store/data-source-store";

const addWebDavMobileSchema = z
  .object({
    serverUrl: z.string().trim().min(1, "请输入服务器地址。"),
    port: z
      .string()
      .trim()
      .regex(/^\d*$/, "端口必须为数字")
      .refine(
        (value) =>
          value.length === 0 || (Number(value) >= 1 && Number(value) <= 65535),
        "端口范围应为 1-65535",
      ),
    basePath: z.string().trim(),
    username: z.string().trim(),
    password: z.string(),
    useSsl: z.boolean(),
  })
  .transform((data) => {
    const base = data.serverUrl;
    const portTrim = data.port;
    let endpoint = base;

    if (!/^https?:\/\//i.test(endpoint)) {
      endpoint = `${data.useSsl ? "https" : "http"}://${endpoint}`;
    }

    if (portTrim !== "") {
      const matched = endpoint.match(/^(https?:\/\/)([^/?#]*)(.*)$/i);
      if (matched) {
        const [, protocol, authority, suffix] = matched;
        endpoint = `${protocol}${authority.replace(/:\d+$/, "")}:${portTrim}${suffix}`;
      } else {
        endpoint = `${endpoint.replace(/:\d+$/, "")}:${portTrim}`;
      }
    }

    return { ...data, endpoint };
  });

type WebDavFormInput = z.input<typeof addWebDavMobileSchema>;

function deriveWebDavDataSourceName(endpoint: string): string {
  try {
    let normalized = endpoint.trim();
    if (!normalized) {
      return "WebDAV 数据源";
    }
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    const { hostname } = new URL(normalized);
    return hostname || "WebDAV 数据源";
  } catch {
    return "WebDAV 数据源";
  }
}

function buildDraft(values: WebDavFormInput): DataSource {
  const parsed = addWebDavMobileSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "校验失败");
  }
  if (parsed.data === undefined) {
    throw new Error("校验失败");
  }
  const d = parsed.data;
  const rootPath = d.basePath.trim() ? d.basePath.trim() : null;
  return {
    id: "",
    type: "webdav",
    name: deriveWebDavDataSourceName(d.endpoint),
    enabled: true,
    endpoint: d.endpoint,
    username: d.username.trim(),
    password: d.password,
    hasPassword: d.password.length > 0,
    rootPath,
  };
}

// Inline-style equivalent of className "min-h-10 border-0 bg-transparent py-1 text-[15px]"
const rnInputStyle = StyleSheet.create({
  base: { minHeight: 40, borderWidth: 0, backgroundColor: "transparent", paddingVertical: 4, fontSize: 15 },
});

export default function AddWebDavDataSourceScreen() {
  const palette = useThemePalette();
  const { createDataSource, testDataSourceConnection } = useDataSourceStore();
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  const portRef = useRef<RNTextInput>(null);
  const basePathRef = useRef<RNTextInput>(null);
  const usernameRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);

  const form = useForm({
    defaultValues: {
      serverUrl: "",
      port: "",
      basePath: "",
      username: "",
      password: "",
      useSsl: true as boolean,
    } satisfies WebDavFormInput,
    validators: {
      onSubmit: addWebDavMobileSchema,
    },
  });

  const useSsl = useStore(form.store, (s) => s.values.useSsl);

  async function persistDataSource(draft: DataSource) {
    await createDataSource(draft);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings/webdav");
    }
  }

  async function handleSave() {
    if (saving) return;

    const parseResult = addWebDavMobileSchema.safeParse(form.store.state.values);
    if (!parseResult.success) {
      const errors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        const key = String(issue.path[0]);
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      const draft = buildDraft(form.store.state.values);

      const testResult = await testDataSourceConnection(draft);
      if (!testResult.ok) {
        Alert.alert(
          "连接测试失败",
          testResult.message,
          [
            { text: "重新填写", style: "cancel" },
            {
              text: "仍然添加",
              onPress: () => {
                setSaving(true);
                void persistDataSource(draft).finally(() => setSaving(false));
              },
            },
          ],
        );
        return;
      }

      await persistDataSource(draft);
    } catch (caught) {
      Alert.alert("添加失败", caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  const inputClassName = "border-0 bg-transparent py-1 text-[15px]";
  const rightToolbar: HeaderToolbarAction[] = [
    {
      label: saving ? "完成中" : "完成",
      onPress: () => void handleSave(),
      icon: <MaterialIcons name="check" size={18} color={palette.primary} />,
      iosSfSymbol: "checkmark",
      iconOnly: true,
      color: palette.primary,
      loading: saving,
    },
  ];

  function fieldError(name: string): string | undefined {
    return fieldErrors[name];
  }

  return (
    <>
      <HeaderToolbar right={rightToolbar} />

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <form.Field name="serverUrl">
              {(field) => (
                <FormLabeledFieldRow label="服务器地址" required error={fieldError("serverUrl")}>
                  <TextInput
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder="dav.example.com"
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                    returnKeyType="next"
                    onSubmitEditing={() => portRef.current?.focus()}
                    className={inputClassName}
                    style={{ color: palette.text }}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="port">
              {(field) => (
                <FormLabeledFieldRow label="端口号" error={fieldError("port")}>
                  <RNTextInput
                    ref={portRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder={useSsl ? "443" : "80"}
                    placeholderTextColor={palette.textMuted}
                    keyboardType="number-pad"
                    underlineColorAndroid="transparent"
                    returnKeyType="next"
                    onSubmitEditing={() => basePathRef.current?.focus()}
                    style={[rnInputStyle.base, { color: palette.text }]}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="basePath">
              {(field) => (
                <FormLabeledFieldRow label="基础路径" error={fieldError("basePath")}>
                  <RNTextInput
                    ref={basePathRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder="/"
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                    returnKeyType="next"
                    onSubmitEditing={() => usernameRef.current?.focus()}
                    style={[rnInputStyle.base, { color: palette.text }]}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="username">
              {(field) => (
                <FormLabeledFieldRow label="用户名" error={fieldError("username")}>
                  <RNTextInput
                    ref={usernameRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder="请输入用户名"
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    style={[rnInputStyle.base, { color: palette.text }]}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <FormLabeledFieldRow label="密码" error={fieldError("password")}>
                  <RNTextInput
                    ref={passwordRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder="请输入密码"
                    placeholderTextColor={palette.textMuted}
                    secureTextEntry
                    underlineColorAndroid="transparent"
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSave()}
                    style={[rnInputStyle.base, { color: palette.text }]}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="useSsl">
              {(field) => (
                <FormLabeledFieldRow label="使用 SSL">
                  <FormFieldSwitch value={field.state.value} onValueChange={(next) => field.handleChange(next)} />
                </FormLabeledFieldRow>
              )}
            </form.Field>
          </View>
        </Screen>
      </View>
    </>
  );
}
