//! Zero-dependency encoding helpers for TTS provider payloads and audio framing.

/// Decodes a hexadecimal string (ignoring ASCII whitespace) into raw bytes.
pub(crate) fn decode_hex(input: &str) -> Result<Vec<u8>, &'static str> {
    let hex_bytes: Vec<u8> = input
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    let hex_bytes = hex_bytes.strip_prefix(b"0x").unwrap_or(&hex_bytes);
    if !hex_bytes.len().is_multiple_of(2) {
        return Err("INVALID_HEX_LENGTH");
    }
    let mut output = Vec::with_capacity(hex_bytes.len() / 2);
    for pair in hex_bytes.as_chunks::<2>().0 {
        let high = hex_nibble(pair[0]).ok_or("INVALID_HEX_CHAR")?;
        let low = hex_nibble(pair[1]).ok_or("INVALID_HEX_CHAR")?;
        output.push((high << 4) | low);
    }
    Ok(output)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Decodes standard RFC 4648 base64 (ignoring ASCII whitespace) into raw bytes.
pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, &'static str> {
    let filtered: Vec<u8> = input
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    if filtered.is_empty() {
        return Ok(Vec::new());
    }
    if !filtered.len().is_multiple_of(4) {
        return Err("INVALID_BASE64_LENGTH");
    }
    let mut output = Vec::with_capacity((filtered.len() / 4) * 3);
    let last_chunk_index = filtered.len() / 4 - 1;
    for (chunk_index, chunk) in filtered.as_chunks::<4>().0.iter().enumerate() {
        let padding = chunk.iter().rev().take_while(|&&byte| byte == b'=').count();
        if padding > 2 || (padding > 0 && chunk_index != last_chunk_index) {
            return Err("INVALID_BASE64_PADDING");
        }
        let a = base64_sextet(chunk[0]).ok_or("INVALID_BASE64_CHAR")?;
        let b = base64_sextet(chunk[1]).ok_or("INVALID_BASE64_CHAR")?;
        output.push((a << 2) | (b >> 4));
        if padding < 2 {
            let c = base64_sextet(chunk[2]).ok_or("INVALID_BASE64_CHAR")?;
            output.push((b << 4) | (c >> 2));
            if padding == 0 {
                let d = base64_sextet(chunk[3]).ok_or("INVALID_BASE64_CHAR")?;
                output.push((c << 6) | d);
            }
        }
    }
    Ok(output)
}

fn base64_sextet(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Wraps raw signed 16-bit little-endian linear PCM samples into a RIFF/WAVE container.
pub(crate) fn encode_wav_pcm16(pcm: &[u8], sample_rate: u32, channels: u16) -> Vec<u8> {
    let channels = channels.max(1);
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate
        .saturating_mul(u32::from(channels))
        .saturating_mul(u32::from(bits_per_sample / 8));
    let block_align = channels.saturating_mul(bits_per_sample / 8);
    let data_len = u32::try_from(pcm.len()).unwrap_or(u32::MAX);
    let riff_len = 36_u32.saturating_add(data_len);

    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes()); // PCM fmt chunk size
    wav.extend_from_slice(&1_u16.to_le_bytes()); // AudioFormat = PCM (1)
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_hex_and_rejects_invalid_input() {
        assert_eq!(decode_hex("494433 0a").unwrap(), b"ID3\x0a");
        assert_eq!(decode_hex("0x494433").unwrap(), b"ID3");
        assert!(decode_hex("abc").is_err());
        assert!(decode_hex("zz").is_err());
    }

    #[test]
    fn decodes_base64_with_padding_and_whitespace() {
        assert_eq!(decode_base64("SGVsbG8h").unwrap(), b"Hello!");
        assert_eq!(decode_base64("SGVs\nbG8=").unwrap(), b"Hello");
        assert_eq!(decode_base64("SGVsbA==").unwrap(), b"Hell");
        assert!(decode_base64("abc").is_err());
        assert!(decode_base64("SG=sSGVs").is_err());
    }

    #[test]
    fn frames_pcm16_as_valid_riff_wave() {
        let wav = encode_wav_pcm16(&[0, 1, 2, 3], 24_000, 1);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 24_000);
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 4);
        assert_eq!(&wav[44..], &[0, 1, 2, 3]);
    }
}
