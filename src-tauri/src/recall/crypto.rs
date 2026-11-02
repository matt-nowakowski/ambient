//! AES-256-GCM sealing for recall rows. The key lives in the macOS Keychain
//! (swift/ambient_native.swift); other platforms fall back to a 0600 key file
//! until their keystores are wired up (P6).

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

#[cfg(any(not(target_os = "macos"), debug_assertions))]
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
