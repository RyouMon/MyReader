import { useForm, useStore } from "@tanstack/react-form";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, TextInput as RNTextInput } from "react-native";
import { z } from "zod";

import { useThemePalette } from "@/src/design/tokens";
import { TextInput, View } from "@/tw";
import type { DataSourceWebdav } from "@my-reader/tools/types/data-source";

import {
  FormFieldSwitch,
  FormLabeledFieldRow,
  Screen,
} from "@/src/components";
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions";
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header";
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers";

const addWebDavMobileSchema = z
  .object({
    serverUrl: z.string().trim().min(1, "webdav.add.enterServerUrl"),
    port: z
      .string()
      .trim()
      .regex(/^\d*$/, "webdav.add.portMustBeNumber")
      .refine(
        (value) =>
          value.length === 0 || (Number(value) >= 1 && Number(value) <= 65535),
        "webdav.add.portRange",
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
        endpoint = `${protocol}${authority!.replace(/:\d+$/, "")}:${portTrim}${suffix}`;
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
      return "WebDAV Source";
    }
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    const { hostname } = new URL(normalized);
    return hostname || "WebDAV Source";
  } catch {
    return "WebDAV Source";
  }
}

function buildDraft(values: WebDavFormInput): { ds: DataSourceWebdav; password: string } {
  const parsed = addWebDavMobileSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "webdav.add.validationFailed");
  }
  if (parsed.data === undefined) {
    throw new Error("webdav.add.validationFailed");
  }
  const d = parsed.data;
  const rootPath = d.basePath.trim() ? d.basePath.trim() : null;
  return {
    ds: {
      id: "",
      type: "webdav",
      name: deriveWebDavDataSourceName(d.endpoint),
      enabled: true,
      endpoint: d.endpoint,
      username: d.username.trim(),
      hasPassword: d.password.length > 0,
      rootPath,
    },
    password: d.password,
  };
}

export default function AddWebDavDataSourceScreen() {
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const palette = useThemePalette();
  const { createDataSource, testDataSourceConnection } = useDataSourceActions();
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

  async function persistDataSource(ds: DataSourceWebdav, password: string) {
    await createDataSource(ds, { type: "webdav", password });
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
        if (!errors[key]) errors[key] = t(issue.message);
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      const { ds, password } = buildDraft(form.store.state.values);

      const testResult = await testDataSourceConnection(ds, { type: "webdav", password });
      if (!testResult.ok) {
        Alert.alert(
          t("webdav.add.connectionTestFailed"),
          testResult.message,
          [
            { text: t("webdav.add.reEnter"), style: "cancel" },
            {
              text: t("webdav.add.addAnyway"),
              onPress: () => {
                setSaving(true);
                void persistDataSource(ds, password).finally(() => setSaving(false));
              },
            },
          ],
        );
        return;
      }

      await persistDataSource(ds, password);
    } catch (caught) {
      Alert.alert(t("webdav.add.addFailed"), caught instanceof Error ? caught.message : t("webdav.add.addFailedMessage"));
    } finally {
      setSaving(false);
    }
  }

  const inputClassName = "border-0 bg-transparent py-1 text-[15px]";

  const isAddLibraryFlow = from === "add-library";

  const { options, toolbar } = useScreenHeader({
    title: t("webdav.addSource"),
    backTitle: t("back"),
    ...(isAddLibraryFlow
      ? { close: { target: "/settings/add-library", dismissTo: true, variant: "layout" } }
      : {}),
    right: [
      createSaveAction({
        label: saving ? t("webdav.add.completing") : t("webdav.add.complete"),
        onPress: () => void handleSave(),
        loading: saving,
        color: palette.primary,
      }),
    ],
  });

  function fieldError(name: string): string | undefined {
    const raw = fieldErrors[name];
    return raw ? t(raw) : undefined;
  }

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <form.Field name="serverUrl">
              {(field) => (
                <FormLabeledFieldRow label={t("webdav.add.serverAddressLabel")} required error={fieldError("serverUrl")}>
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
                <FormLabeledFieldRow label={t("webdav.add.portLabel")} error={fieldError("port")}>
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
                    className="min-h-10 border-0 bg-transparent py-1 text-[15px]"
                    style={{ color: palette.text }}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="basePath">
              {(field) => (
                <FormLabeledFieldRow label={t("webdav.add.basePathLabel")} error={fieldError("basePath")}>
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
                    className="min-h-10 border-0 bg-transparent py-1 text-[15px]"
                    style={{ color: palette.text }}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="username">
              {(field) => (
                <FormLabeledFieldRow label={t("webdav.add.usernameLabel")} error={fieldError("username")}>
                  <RNTextInput
                    ref={usernameRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder={t("webdav.add.usernamePlaceholder")}
                    placeholderTextColor={palette.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    className="min-h-10 border-0 bg-transparent py-1 text-[15px]"
                    style={{ color: palette.text }}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <FormLabeledFieldRow label={t("webdav.add.passwordLabel")} error={fieldError("password")}>
                  <RNTextInput
                    ref={passwordRef}
                    value={field.state.value}
                    onChangeText={(t) => field.handleChange(t)}
                    onBlur={field.handleBlur}
                    placeholder={t("webdav.add.passwordPlaceholder")}
                    placeholderTextColor={palette.textMuted}
                    secureTextEntry
                    underlineColorAndroid="transparent"
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSave()}
                    className="min-h-10 border-0 bg-transparent py-1 text-[15px]"
                    style={{ color: palette.text }}
                  />
                </FormLabeledFieldRow>
              )}
            </form.Field>

            <form.Field name="useSsl">
              {(field) => (
                <FormLabeledFieldRow label={t("webdav.add.useSSL")}>
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
