//! AES-256-GCM sealing for recall rows. The key lives in the macOS Keychain
//! (swift/ambient_native.swift); on Windows it is sealed with DPAPI for the
//! current user; Linux falls back to a 0600 key file
//! until its keystore is wired up (P6).

use std::path::Path;

use anyhow::{anyhow, Result};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
use ring::hmac;
use ring::rand::{SecureRandom, SystemRandom};

pub struct Sealer {
    key: LessSafeKey,
    dedup: hmac::Key,
    rng: SystemRandom,
}

impl Sealer {
    pub fn load(dir: &Path) -> Result<Self> {
        let raw = load_key(dir)?;
        let key =
            LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &raw).map_err(|_| anyhow!("bad key"))?);
        // Separate key for the dedup digest so it reveals nothing about the cipher key.
        let dedup_key = hmac::sign(
            &hmac::Key::new(hmac::HMAC_SHA256, &raw),
            b"ambient recall dedup v1",
        );
        Ok(Self {
            key,
            dedup: hmac::Key::new(hmac::HMAC_SHA256, dedup_key.as_ref()),
            rng: SystemRandom::new(),
        })
    }

    /// nonce || ciphertext+tag
    pub fn seal(&self, plain: &[u8]) -> Result<Vec<u8>> {
        let mut nonce = [0u8; NONCE_LEN];
        self.rng.fill(&mut nonce).map_err(|_| anyhow!("rng"))?;
        let mut buf = plain.to_vec();
        self.key
            .seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::empty(), &mut buf)
            .map_err(|_| anyhow!("seal"))?;
        let mut out = nonce.to_vec();
        out.extend_from_slice(&buf);
        Ok(out)
    }

    pub fn open(&self, sealed: &[u8]) -> Result<Vec<u8>> {
        if sealed.len() < NONCE_LEN {
            return Err(anyhow!("short"));
        }
        let (nonce, body) = sealed.split_at(NONCE_LEN);
        let nonce = Nonce::try_assume_unique_for_key(nonce).map_err(|_| anyhow!("nonce"))?;
        let mut buf = body.to_vec();
        let plain = self
            .key
            .open_in_place(nonce, Aad::empty(), &mut buf)
            .map_err(|_| anyhow!("open"))?;
        Ok(plain.to_vec())
    }

    pub fn digest(&self, parts: &[&[u8]]) -> Vec<u8> {
        let mut ctx = hmac::Context::with_key(&self.dedup);
        for p in parts {
            ctx.update(&(p.len() as u64).to_le_bytes());
            ctx.update(p);
        }
        ctx.sign().as_ref().to_vec()
    }
}

// Release builds keep the key in the Keychain. Debug builds are unsigned and
// change identity on every rebuild, so the Keychain would ask for the user's
// password each time; they use the 0600 key file instead.
#[cfg(all(target_os = "macos", not(debug_assertions)))]
fn load_key(_dir: &Path) -> Result<[u8; 32]> {
    extern "C" {
        fn ambient_memory_key(service: *const std::ffi::c_char, out: *mut u8) -> bool;
    }
    let service = std::ffi::CString::new(env!("BRAND_IDENTIFIER"))?;
    let mut key = [0u8; 32];
    if unsafe { ambient_memory_key(service.as_ptr(), key.as_mut_ptr()) } {
        Ok(key)
    } else {
        Err(anyhow!(
            "couldn't read or create the memory key in the Keychain"
        ))
    }
}

/// Windows: the key is sealed with DPAPI for the current user
/// (`recall.key.dpapi`). A plain `recall.key` from 0.1.5 is migrated: sealed,
/// written, read back and checked, and only then deleted.
#[cfg(windows)]
fn load_key(dir: &Path) -> Result<[u8; 32]> {
    load_protected_key(dir, dpapi::protect, dpapi::unprotect)
}

/// The DPAPI-sealed key file, and the plain one it replaces.
#[cfg(any(windows, test))]
const PROTECTED_KEY_FILE: &str = "recall.key.dpapi";
#[cfg(any(windows, test))]
const PLAIN_KEY_FILE: &str = "recall.key";

/// Load (or create) the key sealed by `protect`/`unprotect`, migrating a plain
/// key file. Split from the platform calls so the migration is tested
/// everywhere.
#[cfg(any(windows, test))]
fn load_protected_key(
    dir: &Path,
    protect: impl Fn(&[u8]) -> Result<Vec<u8>>,
    unprotect: impl Fn(&[u8]) -> Result<Vec<u8>>,
) -> Result<[u8; 32]> {
    let protected_path = dir.join(PROTECTED_KEY_FILE);
    let plain_path = dir.join(PLAIN_KEY_FILE);
    let plain_key = std::fs::read(&plain_path)
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes.as_slice()).ok());

    if let Ok(blob) = std::fs::read(&protected_path) {
        match unprotect(&blob).and_then(|raw| {
            <[u8; 32]>::try_from(raw.as_slice())
                .map_err(|_| anyhow!("sealed key has the wrong length"))
        }) {
            Ok(key) => {
                // A migration cut off after the write: the plain copy goes now.
                if plain_key == Some(key) {
                    remove_plain_key(&plain_path);
                }
                return Ok(key);
            }
            // The plain key is still there (the sealed one never verified):
            // keep using it and seal it again below.
            Err(e) if plain_key.is_some() => {
                log::warn!("recall: sealed key unreadable ({e}); migrating the plain key again");
            }
            // Never replace a sealed key we can't open: the stored rows
            // depend on it.
            Err(e) => return Err(e.context("couldn't unseal the memory key")),
        }
    }

    let key = match plain_key {
        Some(key) => key,
        None => {
            let mut key = [0u8; 32];
            SystemRandom::new()
                .fill(&mut key)
                .map_err(|_| anyhow!("rng"))?;
            key
        }
    };
    let blob = protect(&key)?;
    let tmp = dir.join(format!("{PROTECTED_KEY_FILE}.tmp"));
    std::fs::write(&tmp, &blob)?;
    std::fs::rename(&tmp, &protected_path)?;

    // Read back what's on disk and open it before trusting it.
    let verified = std::fs::read(&protected_path)
        .ok()
        .and_then(|blob| unprotect(&blob).ok())
        .is_some_and(|raw| raw.as_slice() == key.as_slice());
    if !verified {
        // Keep the plain key (if any) so nothing is lost; next launch retries.
        return if plain_key.is_some() {
            log::warn!("recall: sealed key didn't verify; keeping the plain key for now");
            Ok(key)
        } else {
            Err(anyhow!("the sealed memory key didn't verify"))
        };
    }
    if plain_key.is_some() {
        remove_plain_key(&plain_path);
        log::info!("recall: moved the memory key into DPAPI");
    }
    Ok(key)
}

#[cfg(any(windows, test))]
fn remove_plain_key(path: &Path) {
    if let Err(e) = std::fs::remove_file(path) {
        log::warn!("recall: couldn't delete the plain key file: {e}");
    }
}

#[cfg(windows)]
mod dpapi {
    use anyhow::{anyhow, Result};
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn blob_in(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        }
    }

    /// Copy DPAPI's output and free it.
    fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if out.pbData.is_null() {
            return Vec::new();
        }
        let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
        unsafe {
            let _ = LocalFree(Some(HLOCAL(out.pbData as *mut core::ffi::c_void)));
        }
        bytes
    }

    /// Seal for the current user (no machine scope, no UI).
    pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
        let input = blob_in(data);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &input,
                windows::core::w!("recall memory key"),
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        }
        .map_err(|e| anyhow!("CryptProtectData: {e}"))?;
        Ok(take(out))
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
        let input = blob_in(data);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        }
        .map_err(|e| anyhow!("CryptUnprotectData: {e}"))?;
        Ok(take(out))
    }
}

/// Linux (and macOS debug builds): a 0600 key file.
#[cfg(any(
    all(not(target_os = "macos"), not(windows)),
    all(target_os = "macos", debug_assertions)
))]
fn load_key(dir: &Path) -> Result<[u8; 32]> {
    let path = dir.join("recall.key");
    if let Ok(bytes) = std::fs::read(&path) {
        if let Ok(key) = <[u8; 32]>::try_from(bytes.as_slice()) {
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    SystemRandom::new()
        .fill(&mut key)
        .map_err(|_| anyhow!("rng"))?;
    std::fs::write(&path, key)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A stand-in for DPAPI: reversible, and it refuses blobs it didn't make.
    fn fake_protect(data: &[u8]) -> Result<Vec<u8>> {
        let mut out = b"SEALED".to_vec();
        out.extend(data.iter().map(|b| b ^ 0x5a));
        Ok(out)
    }
    fn fake_unprotect(data: &[u8]) -> Result<Vec<u8>> {
        let body = data
            .strip_prefix(b"SEALED")
            .ok_or_else(|| anyhow!("not sealed by us"))?;
        Ok(body.iter().map(|b| b ^ 0x5a).collect())
    }

    #[test]
    fn creates_a_sealed_key_and_reuses_it() {
        let dir = tempfile::tempdir().unwrap();
        let first = load_protected_key(dir.path(), fake_protect, fake_unprotect).unwrap();
        assert!(dir.path().join(PROTECTED_KEY_FILE).exists());
        assert!(!dir.path().join(PLAIN_KEY_FILE).exists());
        let again = load_protected_key(dir.path(), fake_protect, fake_unprotect).unwrap();
        assert_eq!(first, again);
    }

    #[test]
    fn migrates_a_plain_key_and_deletes_it_after_verifying() {
        let dir = tempfile::tempdir().unwrap();
        let plain = [7u8; 32];
        std::fs::write(dir.path().join(PLAIN_KEY_FILE), plain).unwrap();
        let key = load_protected_key(dir.path(), fake_protect, fake_unprotect).unwrap();
        assert_eq!(key, plain);
        assert!(!dir.path().join(PLAIN_KEY_FILE).exists());
        let blob = std::fs::read(dir.path().join(PROTECTED_KEY_FILE)).unwrap();
        assert_eq!(fake_unprotect(&blob).unwrap(), plain);
    }

    #[test]
    fn keeps_the_plain_key_when_the_sealed_copy_does_not_verify() {
        let dir = tempfile::tempdir().unwrap();
        let plain = [9u8; 32];
        std::fs::write(dir.path().join(PLAIN_KEY_FILE), plain).unwrap();
        let broken_unprotect = |_: &[u8]| -> Result<Vec<u8>> { Err(anyhow!("nope")) };
        let key = load_protected_key(dir.path(), fake_protect, broken_unprotect).unwrap();
        assert_eq!(key, plain);
        assert!(dir.path().join(PLAIN_KEY_FILE).exists());
    }

    #[test]
    fn finishes_an_interrupted_migration() {
        let dir = tempfile::tempdir().unwrap();
        let plain = [3u8; 32];
        std::fs::write(dir.path().join(PLAIN_KEY_FILE), plain).unwrap();
        std::fs::write(
            dir.path().join(PROTECTED_KEY_FILE),
            fake_protect(&plain).unwrap(),
        )
        .unwrap();
        let key = load_protected_key(dir.path(), fake_protect, fake_unprotect).unwrap();
        assert_eq!(key, plain);
        assert!(!dir.path().join(PLAIN_KEY_FILE).exists());
    }

    #[test]
    fn never_replaces_a_sealed_key_it_cannot_open() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(PROTECTED_KEY_FILE), b"garbage").unwrap();
        assert!(load_protected_key(dir.path(), fake_protect, fake_unprotect).is_err());
        assert_eq!(
            std::fs::read(dir.path().join(PROTECTED_KEY_FILE)).unwrap(),
            b"garbage"
        );
    }
}
