use serde_json::Value;

fn csp_directive<'a>(csp: &'a str, name: &str) -> Option<&'a str> {
    csp.split(';')
        .map(str::trim)
        .find(|directive| directive.split_whitespace().next() == Some(name))
}

#[test]
fn asset_protocol_csp_should_allow_windows_reader_urls() {
    let config: Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
        .expect("tauri.conf.json should be valid JSON");
    let csp = config["app"]["security"]["csp"]
        .as_str()
        .expect("Tauri CSP should be a string");

    for name in ["connect-src", "img-src", "media-src"] {
        let directive =
            csp_directive(csp, name).unwrap_or_else(|| panic!("Tauri CSP should define {name}"));
        assert!(
            directive
                .split_whitespace()
                .any(|source| source == "http://asset.localhost"),
            "{name} should allow Tauri asset URLs on Windows"
        );
    }
}
