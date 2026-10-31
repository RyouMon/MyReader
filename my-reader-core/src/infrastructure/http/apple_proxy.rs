use objc2_cf_network::{
    kCFProxyHostNameKey, kCFProxyPasswordKey, kCFProxyPortNumberKey, kCFProxyTypeHTTP,
    kCFProxyTypeHTTPS, kCFProxyTypeKey, kCFProxyUsernameKey, CFNetworkCopyProxiesForURL,
};
use objc2_core_foundation::{CFArray, CFDictionary, CFNumber, CFRetained, CFString, CFType, CFURL};
use url::Url;

#[cfg(target_os = "ios")]
pub(super) fn system_proxy(url: &Url) -> Option<Url> {
    // The owned dictionary contains CFType keys/values, as required by CFNetwork.
    let settings = unsafe { objc2_cf_network::CFNetworkCopySystemProxySettings() }?;
    proxy_for_url(url, &settings)
}

fn proxy_for_url(url: &Url, settings: &CFDictionary) -> Option<Url> {
    let target = CFURL::from_string(None, &CFString::from_str(url.as_str()), None)?;
    // CFNetwork applies the system's destination-specific bypass rules. Keep
    // its first choice; a direct connection must not fall through to a proxy.
    // The API returns dictionaries with CFString keys and CFType values.
    let proxies = unsafe {
        CFRetained::cast_unchecked::<CFArray<CFDictionary<CFString, CFType>>>(
            CFNetworkCopyProxiesForURL(&target, settings),
        )
    };
    let proxy = proxies.get(0)?;
    // These framework constants are immutable CFStrings.
    let kind = proxy.get(unsafe { kCFProxyTypeKey })?;
    let kind = kind.downcast_ref::<CFString>()?;
    if kind != unsafe { kCFProxyTypeHTTP } && kind != unsafe { kCFProxyTypeHTTPS } {
        return None;
    }
    let host = proxy.get(unsafe { kCFProxyHostNameKey })?;
    let host = host.downcast_ref::<CFString>()?.to_string();
    let port = proxy.get(unsafe { kCFProxyPortNumberKey })?;
    let port = u16::try_from(port.downcast_ref::<CFNumber>()?.as_i32()?).ok()?;
    // CFNetwork's HTTPS proxy type denotes an HTTP CONNECT proxy.
    let mut endpoint = Url::parse("http://localhost").ok()?;
    endpoint.set_host(Some(&host)).ok()?;
    endpoint.set_port(Some(port)).ok()?;
    if let Some(username) = proxy.get(unsafe { kCFProxyUsernameKey }) {
        endpoint
            .set_username(&username.downcast_ref::<CFString>()?.to_string())
            .ok()?;
    }
    if let Some(password) = proxy.get(unsafe { kCFProxyPasswordKey }) {
        endpoint
            .set_password(Some(&password.downcast_ref::<CFString>()?.to_string()))
            .ok()?;
    }
    Some(endpoint)
}

#[cfg(test)]
mod tests;
