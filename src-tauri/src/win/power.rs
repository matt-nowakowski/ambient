//! Opting out of Windows' power throttling (EcoQoS), the Windows side of
//! `NSAppSleepDisabled` in macOS's Info.plist.
//!
//! Ambient mostly runs from the tray with no window. Windows treats such a
//! process as background work and may run it on efficiency cores at low
//! clock speed and coalesce its timers, so the agent loop, hands-free and a
//! dictation's transcription would slow down exactly when the user isn't
//! looking at Ambient. Each process (the app and its transcription worker)
//! opts out for itself.

use windows::Win32::System::Threading::{
    GetCurrentProcess, ProcessPowerThrottling, SetProcessInformation,
    PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
    PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION, PROCESS_POWER_THROTTLING_STATE,
};

fn set(control: u32) -> windows::core::Result<()> {
    // A bit in ControlMask with StateMask clear: "never throttle this".
    let state = PROCESS_POWER_THROTTLING_STATE {
        Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        ControlMask: control,
        StateMask: 0,
    };
    unsafe {
        SetProcessInformation(
            GetCurrentProcess(),
            ProcessPowerThrottling,
            &state as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        )
    }
}

/// Run at full speed with timers honoured, window or not. Timer resolution
/// is Windows 11 only; older versions refuse the pair, so speed alone then.
pub fn keep_full_speed() {
    let both =
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED | PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION;
    if set(both).is_ok() {
        return;
    }
    if let Err(e) = set(PROCESS_POWER_THROTTLING_EXECUTION_SPEED) {
        // Logging isn't up yet this early; stderr reaches a debug console.
        eprintln!("couldn't opt out of power throttling: {e}");
    }
}
