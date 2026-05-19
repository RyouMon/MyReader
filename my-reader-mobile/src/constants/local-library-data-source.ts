import i18n from "@/src/i18n";

/** 本机书库在关联字段中使用的逻辑 id，与添加书库页的静态「本地存储」项一致 */
export const LOCAL_LIBRARY_DATA_SOURCE_ID: string = "builtin-local-storage"

export const LOCAL_LIBRARY_DATA_SOURCE_NAME = i18n.t("common.localStorage")
