use chrono::{Datelike, Duration, Local, NaiveDateTime, TimeZone};
use crc32fast::Hasher as Crc32Hasher;
use csv::WriterBuilder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::{
    collections::HashSet,
    fs,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
};
use tauri::AppHandle;

use crate::{commands::timer::{TimeEntry, TIME_ENTRY_SELECT}, db};

const BACKUP_VERSION: u32 = 1;
const BACKUP_EXT: &str = ".tock-backup.zip";
const MANIFEST_NAME: &str = "manifest.json";
const DB_ARCHIVE_PATH: &str = "db/tock.db";
const PENDING_DIR_NAME: &str = "restore-pending";
const PENDING_MARKER_NAME: &str = "READY";
const RESTORED_PDF_DIR_NAME: &str = "restored-pdfs";

const ZIP_LOCAL_SIG: u32 = 0x0403_4b50;
const ZIP_CENTRAL_SIG: u32 = 0x0201_4b50;
const ZIP_END_SIG: u32 = 0x0605_4b50;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableCount {
    pub table: String,
    pub rows: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupPdfEntry {
    pub invoice_id: String,
    pub original_path: String,
    pub archive_path: Option<String>,
    pub file_name: Option<String>,
    pub status: String,
    pub sha256: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BackupManifest {
    pub backup_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub kind: String,
    pub reason: Option<String>,
    pub db_archive_path: String,
    pub db_sha256: String,
    pub table_counts: Vec<TableCount>,
    pub pdfs: Vec<BackupPdfEntry>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupSummary {
    pub backup_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub kind: String,
    pub reason: Option<String>,
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub warnings_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupInspection {
    pub summary: BackupSummary,
    pub table_counts: Vec<TableCount>,
    pub warnings: Vec<String>,
    pub pdfs: Vec<BackupPdfEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RestoreSummary {
    pub backup: BackupSummary,
    pub safety_backup_path: String,
    pub warnings: Vec<String>,
    pub restart_required: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CreateBackupKind {
    Auto,
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BackupKind {
    Auto,
    Manual,
    Safety,
}

impl BackupKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Manual => "manual",
            Self::Safety => "safety",
        }
    }
}

impl From<CreateBackupKind> for BackupKind {
    fn from(value: CreateBackupKind) -> Self {
        match value {
            CreateBackupKind::Auto => Self::Auto,
            CreateBackupKind::Manual => Self::Manual,
        }
    }
}

#[derive(Debug)]
struct ZipSource {
    name: String,
    bytes: Vec<u8>,
}

#[derive(Debug)]
struct ZipCentralRecord {
    name: Vec<u8>,
    crc32: u32,
    size: u32,
    offset: u32,
}

#[derive(Debug)]
struct ZipEntryHeader {
    name: String,
    crc32: u32,
    compressed_size: u32,
    uncompressed_size: u32,
}

#[derive(Debug)]
struct BackupFileInfo {
    summary: BackupSummary,
    path: PathBuf,
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn now_file_stamp() -> String {
    Local::now().format("%Y-%m-%dT%H-%M-%S").to_string()
}

fn sanitize_reason(reason: &str) -> String {
    let cleaned: String = reason
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    cleaned
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn hex_digest(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{:02x}", byte));
    }
    output
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex_digest(&hasher.finalize())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(&hasher.finalize()))
}

fn parse_local_timestamp(value: &str) -> Option<chrono::DateTime<Local>> {
    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").ok()?;
    Local.from_local_datetime(&naive).single()
}

fn file_name_for_archive(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("backup")
        .to_string()
}

fn ensure_clean_dir(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

fn temp_dir(app: &AppHandle, label: &str) -> Result<PathBuf, String> {
    let dir = db::app_data_dir(app)?.join("tmp").join(format!(
        "{}-{}-{}",
        label,
        now_file_stamp(),
        uuid::Uuid::new_v4()
    ));
    ensure_clean_dir(&dir)?;
    Ok(dir)
}

fn pending_restore_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(db::app_data_dir(app)?.join(PENDING_DIR_NAME))
}

fn pending_restore_marker(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(pending_restore_dir(app)?.join(PENDING_MARKER_NAME))
}

fn restored_pdf_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(db::app_data_dir(app)?.join(RESTORED_PDF_DIR_NAME))
}

async fn get_setting_value(pool: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_as::<_, (String,)>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(value,)| value)
}

async fn resolve_backup_directory(pool: &SqlitePool, app: &AppHandle) -> Result<PathBuf, String> {
    let configured = get_setting_value(pool, "backup_directory")
        .await
        .unwrap_or_default();

    let dir = if configured.trim().is_empty() {
        db::app_data_dir(app)?.join("backups")
    } else {
        PathBuf::from(configured)
    };

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn auto_backup_enabled(pool: &SqlitePool) -> bool {
    !matches!(
        get_setting_value(pool, "auto_backup_enabled")
            .await
            .unwrap_or_else(|| "1".to_string())
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "0" | "false" | "off"
    )
}

fn backup_file_name(kind: BackupKind, reason: Option<&str>) -> String {
    let mut name = format!("{}-{}", now_file_stamp(), kind.as_str());
    if let Some(reason) = reason {
        let slug = sanitize_reason(reason);
        if !slug.is_empty() {
            name.push('-');
            name.push_str(&slug);
        }
    }
    name.push_str(BACKUP_EXT);
    name
}

async fn table_counts(pool: &SqlitePool) -> Result<Vec<TableCount>, String> {
    let mut counts = Vec::new();
    for table in [
        "time_entries",
        "entry_tags",
        "clients",
        "invoices",
        "invoice_entry_snapshots",
        "settings",
    ] {
        let sql = format!("SELECT COUNT(*) FROM {}", table);
        let (rows,): (i64,) = sqlx::query_as(&sql)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
        counts.push(TableCount {
            table: table.to_string(),
            rows,
        });
    }
    Ok(counts)
}

async fn snapshot_database(pool: &SqlitePool, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    let escaped = path.display().to_string().replace('\'', "''");
    let sql = format!("VACUUM INTO '{}'", escaped);
    sqlx::query(&sql)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn archive_relative_pdf_path(invoice_id: &str, original_path: &Path) -> String {
    let ext = original_path
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty())
        .unwrap_or("pdf");
    format!("pdfs/{}.{}", invoice_id, ext)
}

async fn collect_pdf_entries(
    pool: &SqlitePool,
    staging_dir: &Path,
) -> Result<(Vec<BackupPdfEntry>, Vec<ZipSource>, Vec<String>), String> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, pdf_path FROM invoices WHERE pdf_path IS NOT NULL AND TRIM(pdf_path) != ''",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut manifest_entries = Vec::new();
    let mut zip_entries = Vec::new();
    let mut warnings = Vec::new();

    for (invoice_id, pdf_path) in rows {
        let Some(pdf_path) = pdf_path else {
            continue;
        };
        let source_path = PathBuf::from(&pdf_path);
        if !source_path.exists() || !source_path.is_file() {
            warnings.push(format!(
                "Invoice {} points to a missing PDF at {}",
                invoice_id, pdf_path
            ));
            manifest_entries.push(BackupPdfEntry {
                invoice_id,
                original_path: pdf_path,
                archive_path: None,
                file_name: None,
                status: "missing".to_string(),
                sha256: None,
                size_bytes: None,
            });
            continue;
        }

        let bytes = fs::read(&source_path).map_err(|e| e.to_string())?;
        let archive_path = archive_relative_pdf_path(&invoice_id, &source_path);
        let file_name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string());
        let target_path = staging_dir.join(&archive_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target_path, &bytes).map_err(|e| e.to_string())?;

        manifest_entries.push(BackupPdfEntry {
            invoice_id,
            original_path: pdf_path,
            archive_path: Some(archive_path.clone()),
            file_name,
            status: "included".to_string(),
            sha256: Some(sha256_bytes(&bytes)),
            size_bytes: Some(bytes.len() as u64),
        });
        zip_entries.push(ZipSource {
            name: archive_path,
            bytes,
        });
    }

    Ok((manifest_entries, zip_entries, warnings))
}

fn backup_summary_from_manifest(
    manifest: &BackupManifest,
    archive_path: &Path,
) -> Result<BackupSummary, String> {
    let metadata = fs::metadata(archive_path).map_err(|e| e.to_string())?;
    Ok(BackupSummary {
        backup_version: manifest.backup_version,
        app_version: manifest.app_version.clone(),
        created_at: manifest.created_at.clone(),
        kind: manifest.kind.clone(),
        reason: manifest.reason.clone(),
        path: archive_path.display().to_string(),
        file_name: file_name_for_archive(archive_path),
        size_bytes: metadata.len(),
        warnings_count: manifest.warnings.len(),
    })
}

fn normalize_archive_path(name: &str) -> Result<PathBuf, String> {
    let path = Path::new(name);
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => output.push(part),
            Component::CurDir => {}
            _ => return Err(format!("Unsupported archive path: {}", name)),
        }
    }
    if output.as_os_str().is_empty() {
        Err("Archive entry must not be empty".into())
    } else {
        Ok(output)
    }
}

fn write_stored_zip(entries: &[ZipSource], dest: &Path) -> Result<(), String> {
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut offset = 0_u32;
    let mut central_records = Vec::new();

    for entry in entries {
        let name = entry.name.as_bytes().to_vec();
        let size = u32::try_from(entry.bytes.len()).map_err(|_| "Backup entry is too large")?;
        let crc32 = {
            let mut hasher = Crc32Hasher::new();
            hasher.update(&entry.bytes);
            hasher.finalize()
        };

        file.write_all(&ZIP_LOCAL_SIG.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&20_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0x0800_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&crc32.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&size.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&size.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&(name.len() as u16).to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&name).map_err(|e| e.to_string())?;
        file.write_all(&entry.bytes).map_err(|e| e.to_string())?;

        central_records.push(ZipCentralRecord {
            name,
            crc32,
            size,
            offset,
        });

        let header_len = 30_u32 + size_of_u16(central_records.last().unwrap().name.len())?;
        offset = offset
            .checked_add(header_len)
            .and_then(|value| value.checked_add(size))
            .ok_or_else(|| "Backup archive is too large".to_string())?;
    }

    let central_offset = offset;

    for record in &central_records {
        file.write_all(&ZIP_CENTRAL_SIG.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&20_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&20_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0x0800_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&record.crc32.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&record.size.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&record.size.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&(record.name.len() as u16).to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u16.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&0_u32.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&record.offset.to_le_bytes())
            .map_err(|e| e.to_string())?;
        file.write_all(&record.name).map_err(|e| e.to_string())?;

        let central_len = 46_u32 + size_of_u16(record.name.len())?;
        offset = offset
            .checked_add(central_len)
            .ok_or_else(|| "Backup archive is too large".to_string())?;
    }

    let central_size = offset
        .checked_sub(central_offset)
        .ok_or_else(|| "Backup archive size underflow".to_string())?;

    file.write_all(&ZIP_END_SIG.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&0_u16.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&0_u16.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&(central_records.len() as u16).to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&(central_records.len() as u16).to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&central_size.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&central_offset.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.write_all(&0_u16.to_le_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn size_of_u16(value: usize) -> Result<u32, String> {
    u32::try_from(value).map_err(|_| "Backup file name is too long".to_string())
}

fn read_zip_entry_header(file: &mut File) -> Result<Option<ZipEntryHeader>, String> {
    let mut sig = [0_u8; 4];
    match file.read_exact(&mut sig) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(err) => return Err(err.to_string()),
    }

    let signature = u32::from_le_bytes(sig);
    if signature == ZIP_CENTRAL_SIG || signature == ZIP_END_SIG {
        return Ok(None);
    }
    if signature != ZIP_LOCAL_SIG {
        return Err("Unsupported backup archive structure".into());
    }

    let mut header = [0_u8; 26];
    file.read_exact(&mut header).map_err(|e| e.to_string())?;

    let flags = u16::from_le_bytes([header[2], header[3]]);
    if flags & 0x0008 != 0 {
        return Err("Unsupported zip data descriptor".into());
    }

    let compression = u16::from_le_bytes([header[4], header[5]]);
    if compression != 0 {
        return Err("Unsupported compressed backup archive".into());
    }

    let crc32 = u32::from_le_bytes([header[10], header[11], header[12], header[13]]);
    let compressed_size = u32::from_le_bytes([header[14], header[15], header[16], header[17]]);
    let uncompressed_size = u32::from_le_bytes([header[18], header[19], header[20], header[21]]);
    let name_len = u16::from_le_bytes([header[22], header[23]]) as usize;
    let extra_len = u16::from_le_bytes([header[24], header[25]]) as usize;

    let mut name = vec![0_u8; name_len];
    file.read_exact(&mut name).map_err(|e| e.to_string())?;
    let name = String::from_utf8(name).map_err(|e| e.to_string())?;

    if extra_len > 0 {
        file.seek(SeekFrom::Current(extra_len as i64))
            .map_err(|e| e.to_string())?;
    }

    Ok(Some(ZipEntryHeader {
        name,
        crc32,
        compressed_size,
        uncompressed_size,
    }))
}

fn read_stored_zip_entry(path: &Path, target_name: &str) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    while let Some(header) = read_zip_entry_header(&mut file)? {
        let size = header.compressed_size as usize;
        if header.name == target_name {
            let mut bytes = vec![0_u8; size];
            file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
            let mut hasher = Crc32Hasher::new();
            hasher.update(&bytes);
            if hasher.finalize() != header.crc32 || bytes.len() as u32 != header.uncompressed_size {
                return Err(format!("Corrupted backup entry: {}", target_name));
            }
            return Ok(bytes);
        }
        file.seek(SeekFrom::Current(size as i64))
            .map_err(|e| e.to_string())?;
    }
    Err(format!("Missing backup entry: {}", target_name))
}

fn extract_stored_zip(path: &Path, dest: &Path) -> Result<(), String> {
    ensure_clean_dir(dest)?;
    let mut file = File::open(path).map_err(|e| e.to_string())?;

    while let Some(header) = read_zip_entry_header(&mut file)? {
        let size = header.compressed_size as usize;
        let mut bytes = vec![0_u8; size];
        file.read_exact(&mut bytes).map_err(|e| e.to_string())?;

        let mut hasher = Crc32Hasher::new();
        hasher.update(&bytes);
        if hasher.finalize() != header.crc32 || bytes.len() as u32 != header.uncompressed_size {
            return Err(format!("Corrupted backup entry: {}", header.name));
        }

        let relative = normalize_archive_path(&header.name)?;
        let output_path = dest.join(relative);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(output_path, bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn manifest_from_bytes(bytes: &[u8]) -> Result<BackupManifest, String> {
    let manifest: BackupManifest = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if manifest.backup_version != BACKUP_VERSION {
        return Err(format!(
            "Unsupported backup version {}",
            manifest.backup_version
        ));
    }
    Ok(manifest)
}

fn inspect_backup_file(path: &Path) -> Result<BackupInspection, String> {
    let manifest_bytes = read_stored_zip_entry(path, MANIFEST_NAME)?;
    let manifest = manifest_from_bytes(&manifest_bytes)?;

    let db_bytes = read_stored_zip_entry(path, &manifest.db_archive_path)?;
    let db_sha = sha256_bytes(&db_bytes);
    if db_sha != manifest.db_sha256 {
        return Err("Backup database checksum mismatch".into());
    }

    for pdf in &manifest.pdfs {
        if pdf.status == "included" {
            let Some(ref archive_path) = pdf.archive_path else {
                return Err(format!("Backup PDF mapping is incomplete for {}", pdf.invoice_id));
            };
            let bytes = read_stored_zip_entry(path, archive_path)?;
            let sha = sha256_bytes(&bytes);
            if pdf.sha256.as_deref() != Some(sha.as_str()) {
                return Err(format!(
                    "Backup PDF checksum mismatch for invoice {}",
                    pdf.invoice_id
                ));
            }
        }
    }

    let summary = backup_summary_from_manifest(&manifest, path)?;
    Ok(BackupInspection {
        summary,
        table_counts: manifest.table_counts.clone(),
        warnings: manifest.warnings.clone(),
        pdfs: manifest.pdfs.clone(),
    })
}

fn sorted_backup_paths(dir: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.ends_with(BACKUP_EXT))
                    .unwrap_or(false)
            {
                paths.push(path);
            }
        }
    }
    paths.sort();
    paths.reverse();
    paths
}

fn prune_auto_backups(dir: &Path) -> Result<(), String> {
    let mut backups = Vec::new();
    for path in sorted_backup_paths(dir) {
        let Ok(inspection) = inspect_backup_file(&path) else {
            continue;
        };
        backups.push(BackupFileInfo {
            summary: inspection.summary,
            path,
        });
    }

    let now = Local::now();
    let recent_cutoff = now - Duration::hours(48);
    let daily_cutoff = now - Duration::days(30);
    let weekly_cutoff = now - Duration::weeks(12);

    let mut keep = HashSet::new();
    let mut daily_keys = HashSet::new();
    let mut weekly_keys = HashSet::new();

    backups.sort_by(|left, right| right.summary.created_at.cmp(&left.summary.created_at));

    for backup in &backups {
        if backup.summary.kind != BackupKind::Auto.as_str() {
            continue;
        }

        let Some(created_at) = parse_local_timestamp(&backup.summary.created_at) else {
            keep.insert(backup.path.clone());
            continue;
        };

        if created_at >= recent_cutoff {
            keep.insert(backup.path.clone());
            continue;
        }

        if created_at >= daily_cutoff {
            let key = created_at.date_naive().to_string();
            if daily_keys.insert(key) {
                keep.insert(backup.path.clone());
            }
            continue;
        }

        if created_at >= weekly_cutoff {
            let iso = created_at.iso_week();
            let key = format!("{}-W{:02}", iso.year(), iso.week());
            if weekly_keys.insert(key) {
                keep.insert(backup.path.clone());
            }
        }
    }

    for backup in backups {
        if backup.summary.kind == BackupKind::Auto.as_str() && !keep.contains(&backup.path) {
            let _ = fs::remove_file(backup.path);
        }
    }

    Ok(())
}

async fn create_backup_internal(
    pool: &SqlitePool,
    app: &AppHandle,
    kind: BackupKind,
    reason: Option<String>,
) -> Result<BackupSummary, String> {
    let backup_dir = resolve_backup_directory(pool, app).await?;
    let staging_dir = temp_dir(app, "backup")?;
    let db_snapshot_path = staging_dir.join(DB_ARCHIVE_PATH);

    let result = async {
        snapshot_database(pool, &db_snapshot_path).await?;
        let db_bytes = fs::read(&db_snapshot_path).map_err(|e| e.to_string())?;
        let db_sha256 = sha256_bytes(&db_bytes);

        let counts = table_counts(pool).await?;
        let (pdfs, mut zip_entries, warnings) = collect_pdf_entries(pool, &staging_dir).await?;

        let manifest = BackupManifest {
            backup_version: BACKUP_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            created_at: now_iso(),
            kind: kind.as_str().to_string(),
            reason: reason.clone(),
            db_archive_path: DB_ARCHIVE_PATH.to_string(),
            db_sha256,
            table_counts: counts,
            pdfs,
            warnings,
        };

        let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        fs::write(staging_dir.join(MANIFEST_NAME), &manifest_bytes).map_err(|e| e.to_string())?;

        let mut entries = Vec::with_capacity(zip_entries.len() + 2);
        entries.push(ZipSource {
            name: MANIFEST_NAME.to_string(),
            bytes: manifest_bytes,
        });
        entries.push(ZipSource {
            name: DB_ARCHIVE_PATH.to_string(),
            bytes: db_bytes,
        });
        entries.append(&mut zip_entries);

        let archive_path = backup_dir.join(backup_file_name(kind, reason.as_deref()));
        write_stored_zip(&entries, &archive_path)?;
        let summary = backup_summary_from_manifest(&manifest, &archive_path)?;
        if kind == BackupKind::Auto {
            let _ = prune_auto_backups(&backup_dir);
        }
        Ok(summary)
    }
    .await;

    let _ = fs::remove_dir_all(&staging_dir);
    result
}

pub async fn run_auto_backup_if_enabled(pool: &SqlitePool, app: &AppHandle, reason: &str) {
    if !auto_backup_enabled(pool).await {
        return;
    }
    if let Err(err) = create_backup_internal(pool, app, BackupKind::Auto, Some(reason.to_string())).await {
        eprintln!("auto backup failed: {}", err);
    }
}

fn apply_extracted_restore(
    app: &AppHandle,
    pending_dir: &Path,
    manifest: &BackupManifest,
) -> Result<(), String> {
    let pending_db = pending_dir.join(&manifest.db_archive_path);
    if !pending_db.exists() {
        return Err("Pending restore database is missing".into());
    }
    if sha256_file(&pending_db)? != manifest.db_sha256 {
        return Err("Pending restore database checksum mismatch".into());
    }

    for pdf in &manifest.pdfs {
        if pdf.status != "included" {
            continue;
        }
        let Some(ref archive_path) = pdf.archive_path else {
            return Err(format!("Pending restore is missing PDF metadata for {}", pdf.invoice_id));
        };
        let pending_pdf = pending_dir.join(archive_path);
        if !pending_pdf.exists() {
            return Err(format!(
                "Pending restore PDF is missing for invoice {}",
                pdf.invoice_id
            ));
        }
        let Some(expected_sha) = pdf.sha256.as_deref() else {
            return Err(format!("Pending restore PDF checksum missing for {}", pdf.invoice_id));
        };
        if sha256_file(&pending_pdf)? != expected_sha {
            return Err(format!(
                "Pending restore PDF checksum mismatch for invoice {}",
                pdf.invoice_id
            ));
        }
    }

    let live_db = db::db_path(app)?;
    if let Some(parent) = live_db.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    for suffix in ["", "-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{}", live_db.display(), suffix));
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    let temp_live_db = live_db.with_extension("restoring");
    if temp_live_db.exists() {
        fs::remove_file(&temp_live_db).map_err(|e| e.to_string())?;
    }
    fs::copy(&pending_db, &temp_live_db).map_err(|e| e.to_string())?;
    fs::rename(&temp_live_db, &live_db).map_err(|e| e.to_string())?;

    let db_url = format!("sqlite://{}?mode=rwc", live_db.display());
    let pool = tauri::async_runtime::block_on(async {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .map_err(|e| e.to_string())
    })?;

    let restore_dir = restored_pdf_root(app)?.join(now_file_stamp());
    fs::create_dir_all(&restore_dir).map_err(|e| e.to_string())?;

    for pdf in &manifest.pdfs {
        if pdf.status == "included" {
            let archive_path = pdf.archive_path.as_ref().expect("validated included archive path");
            let pending_pdf = pending_dir.join(archive_path);
            let file_name = pdf
                .file_name
                .clone()
                .unwrap_or_else(|| file_name_for_archive(&pending_pdf));
            let target_path = restore_dir.join(format!("{}-{}", pdf.invoice_id, file_name));
            fs::copy(&pending_pdf, &target_path).map_err(|e| e.to_string())?;
            tauri::async_runtime::block_on(async {
                sqlx::query("UPDATE invoices SET pdf_path = ? WHERE id = ?")
                    .bind(target_path.display().to_string())
                    .bind(&pdf.invoice_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())
            })?;
        } else {
            tauri::async_runtime::block_on(async {
                sqlx::query("UPDATE invoices SET pdf_path = NULL WHERE id = ?")
                    .bind(&pdf.invoice_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())
            })?;
        }
    }

    tauri::async_runtime::block_on(async { pool.close().await });
    Ok(())
}

pub fn apply_pending_restore(app: &AppHandle) -> Result<(), String> {
    let marker = pending_restore_marker(app)?;
    let pending_dir = pending_restore_dir(app)?;
    if !marker.exists() {
        return Ok(());
    }

    let manifest_path = pending_dir.join(MANIFEST_NAME);
    let manifest_bytes = fs::read(&manifest_path).map_err(|e| e.to_string())?;
    let manifest = manifest_from_bytes(&manifest_bytes)?;

    let result = apply_extracted_restore(app, &pending_dir, &manifest);
    if result.is_ok() {
        let _ = fs::remove_dir_all(&pending_dir);
    }
    result
}

#[tauri::command]
pub async fn create_backup(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    kind: CreateBackupKind,
    reason: Option<String>,
) -> Result<BackupSummary, String> {
    create_backup_internal(pool.inner(), &app, kind.into(), reason).await
}

#[tauri::command]
pub async fn list_backups(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<Vec<BackupSummary>, String> {
    let backup_dir = resolve_backup_directory(pool.inner(), &app).await?;
    let mut summaries = Vec::new();
    for path in sorted_backup_paths(&backup_dir) {
        if let Ok(inspection) = inspect_backup_file(&path) {
            summaries.push(inspection.summary);
        }
    }
    summaries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(summaries)
}

#[tauri::command]
pub async fn inspect_backup(path: String) -> Result<BackupInspection, String> {
    inspect_backup_file(Path::new(&path))
}

#[tauri::command]
pub async fn stage_restore(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    path: String,
) -> Result<RestoreSummary, String> {
    let source = PathBuf::from(&path);
    if !source.exists() || !source.is_file() {
        return Err("Choose a valid backup file".into());
    }

    let inspection = inspect_backup_file(&source)?;
    let safety_backup = create_backup_internal(
        pool.inner(),
        &app,
        BackupKind::Safety,
        Some("pre-restore".to_string()),
    )
    .await?;

    let pending_dir = pending_restore_dir(&app)?;
    ensure_clean_dir(&pending_dir)?;
    extract_stored_zip(&source, &pending_dir)?;
    fs::write(pending_restore_marker(&app)?, b"ready").map_err(|e| e.to_string())?;

    Ok(RestoreSummary {
        backup: inspection.summary,
        safety_backup_path: safety_backup.path,
        warnings: inspection.warnings,
        restart_required: true,
    })
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

pub async fn export_csv_internal(pool: &SqlitePool, app: &AppHandle) -> Result<String, String> {
    let path_setting = get_setting_value(pool, "backup_csv_path")
        .await
        .unwrap_or_default();

    let csv_path = if !path_setting.trim().is_empty() {
        PathBuf::from(path_setting)
    } else {
        db::app_data_dir(app)?.join("tock-hours.csv")
    };

    if let Some(parent) = csv_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let entries: Vec<TimeEntry> = sqlx::query_as(&format!(
        "SELECT {}
         FROM time_entries
         LEFT JOIN entry_tags ON time_entries.tag_id = entry_tags.id
         WHERE time_entries.end_time IS NOT NULL
         ORDER BY time_entries.date ASC, time_entries.start_time ASC",
        TIME_ENTRY_SELECT
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut wtr = WriterBuilder::new().from_path(&csv_path).map_err(|e| e.to_string())?;

    wtr.write_record([
        "id",
        "date",
        "start_time",
        "end_time",
        "duration_minutes",
        "description",
        "tag_id",
        "tag_name",
        "tag_color",
        "invoiced",
        "invoice_id",
    ])
    .map_err(|e| e.to_string())?;

    for entry in &entries {
        wtr.write_record([
            &entry.id,
            &entry.date,
            &entry.start_time,
            &entry.end_time.clone().unwrap_or_default(),
            &entry
                .duration_minutes
                .map(|value| value.to_string())
                .unwrap_or_default(),
            &entry.description,
            &entry.tag_id.clone().unwrap_or_default(),
            &entry.tag_name,
            &entry.tag_color,
            &(if entry.invoiced { "1" } else { "0" }).to_string(),
            &entry.invoice_id.clone().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
    }

    wtr.flush().map_err(|e| e.to_string())?;

    Ok(csv_path.display().to_string())
}

#[tauri::command]
pub async fn export_csv(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    export_csv_internal(pool.inner(), &app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_round_trip_supports_manifest_and_nested_files() {
        let dir = std::env::temp_dir().join(format!("tock-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let archive = dir.join("round-trip.tock-backup.zip");

        let sources = vec![
            ZipSource {
                name: "manifest.json".into(),
                bytes: br#"{"backup_version":1}"#.to_vec(),
            },
            ZipSource {
                name: "db/tock.db".into(),
                bytes: b"sqlite".to_vec(),
            },
            ZipSource {
                name: "pdfs/invoice.pdf".into(),
                bytes: b"%PDF".to_vec(),
            },
        ];

        write_stored_zip(&sources, &archive).expect("write zip");
        let manifest = read_stored_zip_entry(&archive, "manifest.json").expect("read manifest");
        assert_eq!(manifest, br#"{"backup_version":1}"#.to_vec());

        let extracted = dir.join("extract");
        extract_stored_zip(&archive, &extracted).expect("extract zip");
        assert_eq!(
            fs::read(extracted.join("db/tock.db")).expect("read db"),
            b"sqlite".to_vec()
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
