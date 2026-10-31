use super::*;
use objc2_core_foundation::{CFArray, CFRetained};

fn settings(enabled: bool) -> CFRetained<CFDictionary<CFType, CFType>> {
    CFDictionary::from_slices(
        &[
            CFString::from_str("HTTPEnable").as_ref(),
            CFString::from_str("HTTPProxy").as_ref(),
            CFString::from_str("HTTPPort").as_ref(),
            CFString::from_str("HTTPSEnable").as_ref(),
            CFString::from_str("HTTPSProxy").as_ref(),
            CFString::from_str("HTTPSPort").as_ref(),
            CFString::from_str("ExceptionsList").as_ref(),
            CFString::from_str("ExcludeSimpleHostnames").as_ref(),
        ],
        &[
            CFNumber::new_i32(i32::from(enabled)).as_ref(),
            CFString::from_str("127.0.0.1").as_ref(),
            CFNumber::new_i32(8123).as_ref(),
            CFNumber::new_i32(i32::from(enabled)).as_ref(),
            CFString::from_str("127.0.0.1").as_ref(),
            CFNumber::new_i32(8456).as_ref(),
            CFArray::from_objects(&[
                &*CFString::from_str("localhost"),
                &*CFString::from_str("127.0.0.1"),
                &*CFString::from_str("*.local"),
                &*CFString::from_str("10.0.0.0/8"),
            ])
            .as_ref(),
            CFNumber::new_i32(1).as_ref(),
        ],
    )
}

#[test]
fn resolves_http_and_https_proxy_destinations() {
    let settings = settings(true);
    for (target, expected) in [
        ("http://example.com/book", "http://127.0.0.1:8123/"),
        (
            "https://zh.wikipedia.org/w/api.php",
            "http://127.0.0.1:8456/",
        ),
    ] {
        assert_eq!(
            proxy_for_url(&Url::parse(target).unwrap(), settings.as_opaque())
                .unwrap()
                .as_str(),
            expected
        );
    }
}

#[test]
fn honors_system_proxy_bypass_and_disabled_settings() {
    let settings = settings(true);
    for target in [
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "https://nas.local",
        "http://10.1.2.3",
        "http://nas",
    ] {
        assert!(proxy_for_url(&Url::parse(target).unwrap(), settings.as_opaque()).is_none());
    }
    assert!(proxy_for_url(
        &Url::parse("https://zh.wikipedia.org").unwrap(),
        self::settings(false).as_opaque()
    )
    .is_none());
}
