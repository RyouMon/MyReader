use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// 与前端 `FixedLayoutSettings` 对齐，作为机器本地偏好持久化在 `config.json` 的 `readerUi` 字段。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FixedLayoutSettingsDto {
    #[serde(default = "default_fixed_background")]
    pub background: String,
    #[serde(default = "default_navigation_mode")]
    pub navigation_mode: String,
    #[serde(default = "default_reading_layout")]
    pub reading_layout: String,
    #[serde(default = "default_display_mode")]
    pub display_mode: String,
    #[serde(default = "default_spread_mode")]
    pub spread_mode: String,
    #[serde(default = "default_zoom_mode")]
    pub zoom_mode: String,
    #[serde(default = "default_direction")]
    pub direction: String,
    #[serde(default = "default_brightness")]
    pub brightness: f64,
    #[serde(default = "default_page_gap")]
    pub page_gap: f64,
}

fn default_fixed_background() -> String {
    "auto".into()
}
fn default_navigation_mode() -> String {
    "horizontal".into()
}
fn default_reading_layout() -> String {
    "paginate".into()
}
fn default_display_mode() -> String {
    "single".into()
}
fn default_spread_mode() -> String {
    "auto".into()
}
fn default_zoom_mode() -> String {
    "fit-height".into()
}
fn default_direction() -> String {
    "ltr".into()
}
fn default_brightness() -> f64 {
    100.0
}
fn default_page_gap() -> f64 {
    16.0
}

impl Default for FixedLayoutSettingsDto {
    fn default() -> Self {
        Self {
            background: default_fixed_background(),
            navigation_mode: default_navigation_mode(),
            reading_layout: default_reading_layout(),
            display_mode: default_display_mode(),
            spread_mode: default_spread_mode(),
            zoom_mode: default_zoom_mode(),
            direction: default_direction(),
            brightness: default_brightness(),
            page_gap: default_page_gap(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReaderSettingsDto {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default)]
    pub font_families_by_language: BTreeMap<String, String>,
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    #[serde(default = "default_line_height")]
    pub line_height: f64,
    #[serde(default = "default_padding_x")]
    pub padding_x: f64,
    #[serde(default = "default_reflowable_reading_layout")]
    pub reading_layout: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    #[serde(default = "default_col_count")]
    pub col_count: String,
}

fn default_theme() -> String {
    "paper".into()
}
fn default_font_family() -> String {
    "default".into()
}
fn default_font_size() -> f64 {
    18.0
}
fn default_line_height() -> f64 {
    1.85
}
fn default_padding_x() -> f64 {
    2.5
}
fn default_reflowable_reading_layout() -> String {
    "paginate".into()
}
fn default_text_align() -> String {
    "auto".into()
}
fn default_col_count() -> String {
    "auto".into()
}

impl Default for ReaderSettingsDto {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            font_family: default_font_family(),
            font_families_by_language: BTreeMap::new(),
            font_size: default_font_size(),
            line_height: default_line_height(),
            padding_x: default_padding_x(),
            reading_layout: default_reflowable_reading_layout(),
            text_align: default_text_align(),
            col_count: default_col_count(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReflowTtsDto {
    #[serde(default = "default_tts_config_id")]
    pub tts_config_id: String,
    #[serde(default = "default_tts_speed")]
    pub tts_speed: f64,
}

fn default_tts_config_id() -> String {
    "default".into()
}
fn default_tts_speed() -> f64 {
    1.0
}

impl Default for ReflowTtsDto {
    fn default() -> Self {
        Self {
            tts_config_id: default_tts_config_id(),
            tts_speed: default_tts_speed(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub struct ReflowableReaderPreferencesDto {
    #[serde(default)]
    pub settings: ReaderSettingsDto,
    #[serde(default)]
    pub tts: ReflowTtsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReaderUiPreferences {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_app_theme")]
    pub app_theme: String,
    #[serde(default = "default_library_view_mode")]
    pub library_view_mode: String,
    #[serde(default)]
    pub detail_full_screen: bool,
    #[serde(default)]
    pub fixed_layout: FixedLayoutSettingsDto,
    #[serde(default, alias = "reflow")]
    pub reflowable: ReflowableReaderPreferencesDto,
    #[serde(default)]
    pub cache: CachePreferencesDto,
}

fn default_version() -> u32 {
    5
}

fn default_app_theme() -> String {
    "system".into()
}

fn default_library_view_mode() -> String {
    "grid".into()
}

impl Default for ReaderUiPreferences {
    fn default() -> Self {
        Self {
            version: default_version(),
            app_theme: default_app_theme(),
            library_view_mode: default_library_view_mode(),
            detail_full_screen: false,
            fixed_layout: FixedLayoutSettingsDto::default(),
            reflowable: ReflowableReaderPreferencesDto::default(),
            cache: CachePreferencesDto::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CachePreferencesDto {
    #[serde(default = "default_max_cache_size_mb")]
    pub max_cache_size_mb: i64,
    #[serde(default = "default_auto_cleanup_on_launch")]
    pub auto_cleanup_on_launch: bool,
}

fn default_max_cache_size_mb() -> i64 {
    2048
}

fn default_auto_cleanup_on_launch() -> bool {
    true
}

impl Default for CachePreferencesDto {
    fn default() -> Self {
        Self {
            max_cache_size_mb: default_max_cache_size_mb(),
            auto_cleanup_on_launch: default_auto_cleanup_on_launch(),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::ReaderUiPreferences;

    #[test]
    fn reader_ui_preferences_default_should_disable_detail_full_screen() {
        let prefs = ReaderUiPreferences::default();

        assert!(!prefs.detail_full_screen);
    }

    #[test]
    fn reader_ui_preferences_should_round_trip_detail_full_screen() {
        let prefs: ReaderUiPreferences = serde_json::from_value(json!({
            "version": 5,
            "appTheme": "system",
            "libraryViewMode": "grid",
            "detailFullScreen": true,
            "fixedLayout": {},
            "reflowable": {},
            "cache": {},
        }))
        .expect("preferences should deserialize");

        assert!(prefs.detail_full_screen);
        let serialized = serde_json::to_value(&prefs).expect("preferences should serialize");
        assert_eq!(serialized["detailFullScreen"], json!(true));
    }

    #[test]
    fn reader_ui_preferences_default_should_use_reader_font_key() {
        let prefs = ReaderUiPreferences::default();

        assert_eq!(prefs.reflowable.settings.font_family, "default");
        assert!(prefs
            .reflowable
            .settings
            .font_families_by_language
            .is_empty());
    }

    #[test]
    fn reader_ui_preferences_should_round_trip_language_font_families() {
        let prefs: ReaderUiPreferences = serde_json::from_value(json!({
            "version": 5,
            "appTheme": "system",
            "libraryViewMode": "grid",
            "fixedLayout": {},
            "reflowable": {
                "settings": {
                    "fontFamily": "serif",
                    "fontFamiliesByLanguage": {
                        "zh": "noto-serif-sc"
                    }
                }
            },
            "cache": {},
        }))
        .expect("preferences should deserialize");

        assert_eq!(prefs.reflowable.settings.font_family, "serif");
        assert_eq!(
            prefs
                .reflowable
                .settings
                .font_families_by_language
                .get("zh"),
            Some(&"noto-serif-sc".to_string())
        );

        let serialized = serde_json::to_value(&prefs).expect("preferences should serialize");
        assert_eq!(
            serialized["reflowable"]["settings"]["fontFamiliesByLanguage"]["zh"],
            json!("noto-serif-sc")
        );
    }

    #[test]
    fn reader_ui_preferences_should_round_trip_fixed_layout_settings() {
        let prefs: ReaderUiPreferences = serde_json::from_value(json!({
            "fixedLayout": {
                "background": "black",
                "navigationMode": "vertical",
                "direction": "rtl",
                "spreadMode": "single"
            }
        }))
        .expect("preferences should deserialize");

        assert_eq!(prefs.fixed_layout.background, "black");
        assert_eq!(prefs.fixed_layout.navigation_mode, "vertical");
        assert_eq!(prefs.fixed_layout.direction, "rtl");
        assert_eq!(prefs.fixed_layout.spread_mode, "single");

        let serialized = serde_json::to_value(&prefs).expect("preferences should serialize");
        assert_eq!(serialized["fixedLayout"]["background"], json!("black"));
        assert_eq!(
            serialized["fixedLayout"]["navigationMode"],
            json!("vertical")
        );
    }
}
