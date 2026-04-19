import { useForm, useStore } from "@tanstack/react-form";
import { router } from "expo-router";
import { useState } from "react";
import { z } from "zod";

import type { DataSource } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Text, TextInput, View } from "@/tw";

import {
  FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS,
  FormFieldSwitch,
  FormLabeledFieldRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
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
    username: z.string().trim().min(1, "请输入用户名"),
    password: z.string().min(1, "请输入密码或应用专用密码"),
    useSsl: z.boolean(),
  })
  .transform((data) => {
    const base = data.serverUrl;
    const portTrim = data.port;

    const urlIssue = (): never => {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "服务器地址格式不正确。",
          path: ["serverUrl"],
        },
      ]);
    };

    if (portTrim === "") {
      if (/^https?:\/\//i.test(base)) {
        try {
          new URL(base);
          return { ...data, endpoint: base };
        } catch {
          urlIssue();
        }
      }
      try {
        const scheme = data.useSsl ? "https" : "http";
        const url = new URL(`${scheme}://${base}`);
        const href = url.toString();
        return {
          ...data,
          endpoint: href.endsWith("/") && url.pathname === "/" ? href.slice(0, -1) : href,
        };
      } catch {
        urlIssue();
      }
    }

    const portNum = Number.parseInt(portTrim, 10);
    let normalized = base;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `${data.useSsl ? "https" : "http"}://${normalized}`;
    }
    try {
      const url = new URL(normalized);
      url.port = String(portNum);
      const href = url.toString();
      return {
        ...data,
        endpoint: href.endsWith("/") && url.pathname === "/" ? href.slice(0, -1) : href,
      };
    } catch {
      urlIssue();
    }
  });

type WebDavFormInput = z.input<typeof addWebDavMobileSchema>;

/**
 * 从 endpoint URL 推断数据源显示名称（通常为 hostname）。
 */
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

export default function AddWebDavDataSourceScreen() {
  const palette = useThemePalette();
  const { createDataSource, testDataSourceConnection } = useDataSourceStore();
  const [error, setError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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
    listeners: {
      onChange: () => {
        setError(null);
        setTestOk(false);
      },
    },
  });

  const useSsl = useStore(form.store, (s) => s.values.useSsl);

  async function handleTest() {
    setTesting(true);
    setError(null);
    setTestOk(false);
    try {
      await form.validateAllFields("submit");
      if (!form.store.state.isValid) {
        return;
      }
      await testDataSourceConnection(buildDraft(form.store.state.values));
      setTestOk(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接到 WebDAV 服务。");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setTestOk(false);
    try {
      await form.validateAllFields("submit");
      if (!form.store.state.isValid) {
        return;
      }
      const draft = buildDraft(form.store.state.values);
      await testDataSourceConnection(draft);
      const created = await createDataSource(draft);
      router.replace({ pathname: "/settings/add-library/webdav-browser", params: { dataSourceId: created.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接到 WebDAV 服务。");
    } finally {
      setSaving(false);
    }
  }

  const inputClassName = `${FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS} border-0 bg-transparent py-1 text-[15px]`;

  return (
    <Screen>
      <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
        <form.Field name="serverUrl">
          {(field) => (
            <View className="gap-1">
              <FormLabeledFieldRow label="服务器地址">
                <TextInput
                  value={field.state.value}
                  onChangeText={(t) => {
                    field.handleChange(t);
                  }}
                  placeholder="dav.example.com"
                  placeholderTextColor={palette.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  className={inputClassName}
                  style={{ color: palette.text }}
                />
              </FormLabeledFieldRow>
              {!field.state.meta.isValid && field.state.meta.errors.length > 0 ? (
                <Text className="pl-1 text-xs leading-5" style={{ color: palette.error }}>
                  {field.state.meta.errors.map(String).join("，")}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Field name="port">
          {(field) => (
            <View className="gap-1">
              <FormLabeledFieldRow label="端口号">
                <TextInput
                  value={field.state.value}
                  onChangeText={(t) => {
                    field.handleChange(t);
                  }}
                  placeholder={useSsl ? "443" : "80"}
                  placeholderTextColor={palette.textMuted}
                  keyboardType="number-pad"
                  underlineColorAndroid="transparent"
                  className={inputClassName}
                  style={{ color: palette.text }}
                />
              </FormLabeledFieldRow>
              {!field.state.meta.isValid && field.state.meta.errors.length > 0 ? (
                <Text className="pl-1 text-xs leading-5" style={{ color: palette.error }}>
                  {field.state.meta.errors.map(String).join("，")}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Field name="basePath">
          {(field) => (
            <View className="gap-1">
              <FormLabeledFieldRow label="基础路径">
                <TextInput
                  value={field.state.value}
                  onChangeText={(t) => {
                    field.handleChange(t);
                  }}
                  placeholder="/"
                  placeholderTextColor={palette.textMuted}
                  underlineColorAndroid="transparent"
                  className={inputClassName}
                  style={{ color: palette.text }}
                />
              </FormLabeledFieldRow>
              {!field.state.meta.isValid && field.state.meta.errors.length > 0 ? (
                <Text className="pl-1 text-xs leading-5" style={{ color: palette.error }}>
                  {field.state.meta.errors.map(String).join("，")}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Field name="username">
          {(field) => (
            <View className="gap-1">
              <FormLabeledFieldRow label="用户名">
                <TextInput
                  value={field.state.value}
                  onChangeText={(t) => {
                    field.handleChange(t);
                  }}
                  placeholder="reader"
                  placeholderTextColor={palette.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  className={inputClassName}
                  style={{ color: palette.text }}
                />
              </FormLabeledFieldRow>
              {!field.state.meta.isValid && field.state.meta.errors.length > 0 ? (
                <Text className="pl-1 text-xs leading-5" style={{ color: palette.error }}>
                  {field.state.meta.errors.map(String).join("，")}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <View className="gap-1">
              <FormLabeledFieldRow label="密码">
                <TextInput
                  value={field.state.value}
                  onChangeText={(t) => {
                    field.handleChange(t);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry
                  underlineColorAndroid="transparent"
                  className={inputClassName}
                  style={{ color: palette.text }}
                />
              </FormLabeledFieldRow>
              {!field.state.meta.isValid && field.state.meta.errors.length > 0 ? (
                <Text className="pl-1 text-xs leading-5" style={{ color: palette.error }}>
                  {field.state.meta.errors.map(String).join("，")}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Field name="useSsl">
          {(field) => (
            <FormLabeledFieldRow label="使用 SSL">
              <FormFieldSwitch value={field.state.value} onValueChange={(next) => field.handleChange(next)} />
            </FormLabeledFieldRow>
          )}
        </form.Field>

        {error ? (
          <Text className="text-sm leading-6" style={{ color: palette.error }}>{error}</Text>
        ) : null}
        {testOk && !error ? (
          <Text className="text-sm leading-6" style={{ color: palette.success }}>连接成功</Text>
        ) : null}

        <View className="flex-row gap-2">
          <SecondaryButton
            title={testing ? "测试中…" : "测试连接"}
            onPress={saving || testing ? undefined : () => void handleTest()}
          />
          <PrimaryButton
            title={saving ? "保存中…" : "保存并继续"}
            onPress={saving || testing ? undefined : () => void handleSave()}
          />
        </View>
      </View>
    </Screen>
  );
}
