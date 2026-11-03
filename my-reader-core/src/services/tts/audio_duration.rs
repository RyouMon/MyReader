use std::{fs::File, path::Path};

use symphonia::core::{
    formats::FormatOptions, io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};

/// Inspect packet timestamps without decoding PCM or allocating a second audio buffer.
pub(super) fn milliseconds(path: &Path) -> Option<u64> {
    let source = MediaSourceStream::new(Box::new(File::open(path).ok()?), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|v| v.to_str()) {
        hint.with_extension(extension);
    }
    let mut reader = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?
        .format;
    let track = reader.default_track()?;
    let id = track.id;
    let time_base = track.codec_params.time_base.or_else(|| {
        track
            .codec_params
            .sample_rate
            .map(|rate| symphonia::core::units::TimeBase::new(1, rate))
    })?;
    let start = track.codec_params.start_ts;
    let mut end = start;
    while let Ok(packet) = reader.next_packet() {
        if packet.track_id() == id {
            end = end.max(packet.ts.saturating_add(packet.dur));
        }
    }
    let time = time_base.calc_time(end.checked_sub(start)?);
    let ms = time.seconds.saturating_mul(1000) + (time.frac * 1000.0).round() as u64;
    (ms > 0).then_some(ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_pcm_duration_and_rejects_non_audio() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.wav");
        let mut wav = b"RIFF".to_vec();
        wav.extend_from_slice(&(36_u32 + 32000).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt \x10\0\0\0\x01\0\x01\0");
        wav.extend_from_slice(&16000_u32.to_le_bytes());
        wav.extend_from_slice(&32000_u32.to_le_bytes());
        wav.extend_from_slice(b"\x02\0\x10\0data");
        wav.extend_from_slice(&32000_u32.to_le_bytes());
        wav.resize(44 + 32000, 0);
        std::fs::write(&path, wav).unwrap();
        assert_eq!(milliseconds(&path), Some(1000));
        std::fs::write(&path, b"not audio").unwrap();
        assert_eq!(milliseconds(&path), None);
        assert_eq!(milliseconds(&directory.path().join("missing.mp3")), None);
    }
}
