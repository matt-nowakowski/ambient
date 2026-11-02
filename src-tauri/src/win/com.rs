//! COM plumbing for the Windows integrations: per-thread initialisation and
//! late-bound `IDispatch` calls (Outlook, the Windows Search ADO provider).

use std::cell::Cell;
use std::mem::ManuallyDrop;

use windows::core::{Interface, BSTR, GUID, HSTRING, PCWSTR};
use windows::Win32::System::Com::{
    CLSIDFromProgID, CoCreateInstance, CoInitializeEx, IDispatch, CLSCTX_INPROC_SERVER,
    CLSCTX_LOCAL_SERVER, COINIT_MULTITHREADED, DISPATCH_FLAGS, DISPATCH_METHOD,
    DISPATCH_PROPERTYGET, DISPATCH_PROPERTYPUT, DISPPARAMS,
};
use windows::Win32::System::Ole::{GetActiveObject, DISPID_PROPERTYPUT};
use windows::Win32::System::Variant::{
    VariantChangeType, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VAR_CHANGE_FLAGS, VT_BSTR,
    VT_DATE, VT_DISPATCH, VT_EMPTY, VT_NULL,
};

const LOCALE_USER_DEFAULT: u32 = 0x0400;

thread_local! {
    static INITIALISED: Cell<bool> = const { Cell::new(false) };
}

/// Initialise COM on this thread once (multithreaded apartment). A thread
/// already in a single-threaded apartment keeps it; COM works there too.
/// Never uninitialised: the threads that use it are long-lived workers.
pub fn ensure_init() {
    INITIALISED.with(|done| {
        if !done.get() {
            // S_OK, S_FALSE or RPC_E_CHANGED_MODE: COM is usable in each case.
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            done.set(true);
        }
    });
}

/// A late-bound COM object.
#[derive(Clone)]
pub struct Dispatch(IDispatch);

impl Dispatch {
    /// A new instance of `progid` (in-process or local server).
    pub fn create(progid: &str) -> windows::core::Result<Self> {
        ensure_init();
        let clsid = unsafe { CLSIDFromProgID(&HSTRING::from(progid)) }?;
        let object: IDispatch =
            unsafe { CoCreateInstance(&clsid, None, CLSCTX_INPROC_SERVER | CLSCTX_LOCAL_SERVER) }?;
        Ok(Self(object))
    }

    /// The running instance of `progid`, if the app is open (never starts it).
    pub fn running(progid: &str) -> windows::core::Result<Self> {
        ensure_init();
        let clsid = unsafe { CLSIDFromProgID(&HSTRING::from(progid)) }?;
        let mut unknown = None;
        unsafe { GetActiveObject(&clsid, None, &mut unknown) }?;
        let unknown = unknown.ok_or_else(windows::core::Error::empty)?;
        Ok(Self(unknown.cast()?))
    }

    fn invoke(
        &self,
        name: &str,
        flags: DISPATCH_FLAGS,
        args: &[VARIANT],
    ) -> windows::core::Result<VARIANT> {
        let wide = HSTRING::from(name);
        let names = [PCWSTR(wide.as_ptr())];
        let mut id = 0i32;
        unsafe {
            self.0.GetIDsOfNames(
                &GUID::zeroed(),
                names.as_ptr(),
                1,
                LOCALE_USER_DEFAULT,
                &mut id,
            )
        }?;
        // DISPPARAMS takes arguments last-first.
        let mut reversed: Vec<VARIANT> = args.iter().rev().cloned().collect();
        let mut named = DISPID_PROPERTYPUT;
        let mut params = DISPPARAMS {
            rgvarg: if reversed.is_empty() {
                std::ptr::null_mut()
            } else {
                reversed.as_mut_ptr()
            },
            cArgs: reversed.len() as u32,
            ..Default::default()
        };
        if flags == DISPATCH_PROPERTYPUT {
            params.rgdispidNamedArgs = &mut named;
            params.cNamedArgs = 1;
        }
        let mut result = VARIANT::default();
        unsafe {
            self.0.Invoke(
                id,
                &GUID::zeroed(),
                LOCALE_USER_DEFAULT,
                flags,
                &params,
                Some(&mut result),
                None,
                None,
            )
        }?;
        Ok(result)
    }

    /// Call a method or read a property (with arguments, e.g. `Item(1)`).
    pub fn call(&self, name: &str, args: &[VARIANT]) -> windows::core::Result<VARIANT> {
        self.invoke(name, DISPATCH_METHOD | DISPATCH_PROPERTYGET, args)
    }

    /// Read a property.
    pub fn get(&self, name: &str) -> windows::core::Result<VARIANT> {
        self.call(name, &[])
    }

    /// Set a property.
    pub fn put(&self, name: &str, value: VARIANT) -> windows::core::Result<()> {
        self.invoke(name, DISPATCH_PROPERTYPUT, &[value])
            .map(|_| ())
    }

    /// A property or call result that is itself an object.
    pub fn object(&self, name: &str, args: &[VARIANT]) -> Option<Dispatch> {
        as_object(&self.call(name, args).ok()?)
    }

    /// A property as text ("" when missing or not text).
    pub fn text(&self, name: &str) -> String {
        self.get(name).map(|v| as_text(&v)).unwrap_or_default()
    }
}

/// The object a VARIANT holds, if any.
pub fn as_object(v: &VARIANT) -> Option<Dispatch> {
    if v.vt() != VT_DISPATCH {
        return None;
    }
    IDispatch::try_from(v).ok().map(Dispatch)
}

/// A VARIANT as text, converting numbers and dates; "" for empty or null.
pub fn as_text(v: &VARIANT) -> String {
    let vt = v.vt();
    if vt == VT_EMPTY || vt == VT_NULL {
        return String::new();
    }
    if vt == VT_BSTR {
        return BSTR::try_from(v).map(|b| b.to_string()).unwrap_or_default();
    }
    let mut out = VARIANT::default();
    match unsafe { VariantChangeType(&mut out, v, VAR_CHANGE_FLAGS(0), VT_BSTR) } {
        Ok(()) => BSTR::try_from(&out)
            .map(|b| b.to_string())
            .unwrap_or_default(),
        Err(_) => String::new(),
    }
}

/// A VT_DATE VARIANT's OLE date.
pub fn as_date(v: &VARIANT) -> Option<f64> {
    (v.vt() == VT_DATE).then(|| unsafe { v.Anonymous.Anonymous.Anonymous.date })
}

/// A VT_DATE VARIANT holding an OLE date.
pub fn date(value: f64) -> VARIANT {
    VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                vt: VT_DATE,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: VARIANT_0_0_0 { date: value },
            }),
        },
    }
}
