use std::path::Path;

use ring::digest::{Context, SHA256};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::{models::FileDigest, CoreError};

const BUFFER_SIZE: usize = 64 * 1024;

pub(crate) async fn sha256_file(path: &Path) -> Result<FileDigest, CoreError> {
    let source = tokio::fs::File::open(path).await?;
    copy_and_digest(source, tokio::io::sink()).await
}

pub(crate) async fn copy_file_with_sha256(
    source: &Path,
    destination: &Path,
) -> Result<FileDigest, CoreError> {
    let source = tokio::fs::File::open(source).await?;
    let mut destination = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .await?;
    let digest = copy_and_digest(source, &mut destination).await?;
    destination.sync_all().await?;
    Ok(digest)
}

pub(crate) async fn consume_file_with_sha256(
    source: &Path,
    destination: &Path,
) -> Result<FileDigest, CoreError> {
    if tokio::fs::rename(source, destination).await.is_ok() {
        return sha256_file(destination).await;
    }

    let digest = copy_file_with_sha256(source, destination).await?;
    tokio::fs::remove_file(source).await?;
    Ok(digest)
}

async fn copy_and_digest<R, W>(mut source: R, mut destination: W) -> Result<FileDigest, CoreError>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut hasher = Context::new(&SHA256);
    let mut size = 0_u64;
    let mut buffer = vec![0; BUFFER_SIZE];
    loop {
        let read = source.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        destination.write_all(&buffer[..read]).await?;
        hasher.update(&buffer[..read]);
        size = size
            .checked_add(read as u64)
            .ok_or_else(|| CoreError::DataIntegrity("BOOK_FILE_SIZE_OVERFLOW".into()))?;
    }
    destination.flush().await?;
    Ok(FileDigest {
        size: i64::try_from(size)
            .map_err(|_| CoreError::DataIntegrity("BOOK_FILE_TOO_LARGE".into()))?,
        sha256: hex_digest(hasher.finish().as_ref()),
    })
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[usize::from(byte >> 4)] as char);
        output.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn should_stream_copy_and_sha256_when_file_exceeds_one_buffer() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.epub");
        let destination = directory.path().join("destination.epub");
        let bytes = vec![b'a'; BUFFER_SIZE + 1];
        tokio::fs::write(&source, &bytes).await.unwrap();

        let copied = copy_file_with_sha256(&source, &destination).await.unwrap();
        let hashed = sha256_file(&destination).await.unwrap();

        assert_eq!(copied, hashed);
        assert_eq!(copied.size, i64::try_from(bytes.len()).unwrap());
        assert_eq!(tokio::fs::read(destination).await.unwrap(), bytes);
    }

    #[tokio::test]
    async fn should_move_staged_file_when_source_can_be_consumed() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.epub");
        let destination = directory.path().join("destination.epub");
        tokio::fs::write(&source, b"epub-content").await.unwrap();

        let digest = consume_file_with_sha256(&source, &destination)
            .await
            .unwrap();

        assert!(!source.exists());
        assert_eq!(tokio::fs::read(destination).await.unwrap(), b"epub-content");
        assert_eq!(digest.size, 12);
    }
}
