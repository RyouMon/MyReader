use serde::{Deserialize, Serialize};

/// 与前端 `FixedLayoutSettings` 对齐，写入 `reader_ui_preferences.json`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedLayoutSettingsDto {
    #[serde(default = "default_reading_layout")]
    pub reading_layout: String,
    #[serde(default = "default_display_mode")]
    pub display_mode: String,
    #[serde(default = "default_zoom_mode")]
    pub zoom_mode: String,
    #[serde(default = "default_direction")]
    pub direction: String,
    #[serde(default = "default_brightness")]
    pub brightness: f64,
    #[serde(default = "default_page_gap")]
    pub page_gap: f64,
}

fn default_reading_layout() -> String {
    "paginate".into()
}
fn default_display_mode() -> String {
    "single".into()
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
            reading_layout: default_reading_layout(),
            display_mode: default_display_mode(),
            zoom_mode: default_zoom_mode(),
            direction: default_direction(),
            brightness: default_brightness(),
            page_gap: default_page_gap(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderSettingsDto {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: f64,
    #[serde(default = "default_line_height")]
    pub line_height: f64,
    #[serde(default = "default_padding_x")]
    pub padding_x: f64,
    #[serde(default = "default_reflowable_reading_layout")]
    pub reading_layout: String,
}

fn default_theme() -> String {
    "paper".into()
}
fn default_font_family() -> String {
    "'Lora', 'Noto Serif SC', serif".into()
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

impl Default for ReaderSettingsDto {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            line_height: default_line_height(),
            padding_x: default_padding_x(),
            reading_layout: default_reflowable_reading_layout(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflowableReaderPreferencesDto {
    #[serde(default)]
    pub settings: ReaderSettingsDto,
    #[serde(default)]
    pub tts: ReflowTtsDto,
}

impl Default for ReflowableReaderPreferencesDto {
    fn default() -> Self {
        Self {
            settings: ReaderSettingsDto::default(),
            tts: ReflowTtsDto::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderUiPreferences {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub fixed_layout: FixedLayoutSettingsDto,
    #[serde(default, alias = "reflow")]
    pub reflowable: ReflowableReaderPreferencesDto,
}

fn default_version() -> u32 {
    1
}

impl Default for ReaderUiPreferences {
    fn default() -> Self {
        Self {
            version: default_version(),
            fixed_layout: FixedLayoutSettingsDto::default(),
            reflowable: ReflowableReaderPreferencesDto::default(),
        }
    }
}

