# Rust dependency licences

Every crate the desktop app (`src-tauri`) builds with, on every platform, and the
licences it is offered under (a crate listed with several can be used under any
one of them). Generated from `Cargo.lock` with:

```bash
cd src-tauri && cargo deny list --format json --layout crate
```

CI enforces the policy in `src-tauri/deny.toml` (permissive licences only; no GPL,
LGPL or AGPL) with `cargo deny check licenses`. For the full licence texts,
`cargo about generate` (cargo-about) can render them from the same lockfile.
Notices for code, fonts and models we vendor or ship are in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

820 crates. Licences offered, by number of crates: MIT (743), Apache-2.0 (545), Zlib (33), MPL-2.0 (24), Unicode-3.0 (19), BSD-3-Clause (11), ISC (9), Apache-2.0 WITH LLVM-exception (9), Unlicense (8), BSD-2-Clause (4), BSL-1.0 (3), 0BSD (2), CDLA-Permissive-2.0 (2), CC0-1.0 (1), MIT-0 (1), LGPL-2.1-or-later (1).

| Crate                            | Version                        | Licence                                             | Source                                 |
| -------------------------------- | ------------------------------ | --------------------------------------------------- | -------------------------------------- |
| adler2                           | 2.0.1                          | 0BSD OR MIT OR Apache-2.0                           | crates.io                              |
| ahash                            | 0.8.12                         | MIT OR Apache-2.0                                   | crates.io                              |
| aho-corasick                     | 1.1.4                          | Unlicense OR MIT                                    | crates.io                              |
| alloc-no-stdlib                  | 2.0.4                          | BSD-3-Clause                                        | crates.io                              |
| alloc-stdlib                     | 0.2.2                          | BSD-3-Clause                                        | crates.io                              |
| allocator-api2                   | 0.2.21                         | MIT OR Apache-2.0                                   | crates.io                              |
| alsa                             | 0.11.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| alsa-sys                         | 0.4.0                          | MIT                                                 | crates.io                              |
| ambient-cpal                     | 0.18.2                         | Apache-2.0                                          | vendored (src-tauri/vendor)            |
| ambient-keys                     | 0.3.4                          | MIT                                                 | vendored (src-tauri/vendor)            |
| ambient-recorder                 | 0.1.0                          | MIT                                                 | vendored (src-tauri/vendor)            |
| android_log-sys                  | 0.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| android_logger                   | 0.15.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| android_system_properties        | 0.1.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| anstream                         | 0.6.21                         | MIT OR Apache-2.0                                   | crates.io                              |
| anstyle                          | 1.0.14                         | MIT OR Apache-2.0                                   | crates.io                              |
| anstyle-parse                    | 0.2.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| anstyle-query                    | 1.1.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| anstyle-wincon                   | 3.0.11                         | MIT OR Apache-2.0                                   | crates.io                              |
| anyhow                           | 1.0.102                        | MIT OR Apache-2.0                                   | crates.io                              |
| arbitrary                        | 1.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| arboard                          | 3.6.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| arrayvec                         | 0.7.6                          | MIT OR Apache-2.0                                   | crates.io                              |
| async-broadcast                  | 0.7.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| async-channel                    | 2.5.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| async-compression                | 0.4.43                         | MIT OR Apache-2.0                                   | crates.io                              |
| async-executor                   | 1.14.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| async-io                         | 2.6.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| async-lock                       | 3.4.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| async-process                    | 2.5.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| async-recursion                  | 1.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| async-signal                     | 0.2.13                         | Apache-2.0 OR MIT                                   | crates.io                              |
| async-task                       | 4.7.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| async-trait                      | 0.1.89                         | MIT OR Apache-2.0                                   | crates.io                              |
| atk                              | 0.18.2                         | MIT                                                 | crates.io                              |
| atk-sys                          | 0.18.2                         | MIT                                                 | crates.io                              |
| atomic-waker                     | 1.1.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| audio-codec-algorithms           | 0.8.1                          | 0BSD OR Apache-2.0                                  | crates.io                              |
| audioadapter                     | 5.0.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| audioadapter-buffers             | 5.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| audioadapter-sample              | 5.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| auto-launch                      | 0.5.0                          | MIT                                                 | crates.io                              |
| autocfg                          | 1.5.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| base64                           | 0.21.7                         | MIT OR Apache-2.0                                   | crates.io                              |
| base64                           | 0.22.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| base64ct                         | 1.8.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| bincode                          | 2.0.1                          | MIT                                                 | crates.io                              |
| bincode_derive                   | 2.0.1                          | MIT                                                 | crates.io                              |
| bit-set                          | 0.8.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| bit-vec                          | 0.8.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| bitflags                         | 1.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| bitflags                         | 2.11.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| bitvec                           | 1.0.1                          | MIT                                                 | crates.io                              |
| block                            | 0.1.6                          | MIT                                                 | crates.io                              |
| block-buffer                     | 0.10.4                         | MIT OR Apache-2.0                                   | crates.io                              |
| block2                           | 0.6.2                          | MIT                                                 | crates.io                              |
| blocking                         | 1.6.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| brotli                           | 8.0.2                          | BSD-3-Clause OR MIT                                 | crates.io                              |
| brotli-decompressor              | 5.0.0                          | BSD-3-Clause OR MIT                                 | crates.io                              |
| bumpalo                          | 3.20.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| byte-unit                        | 5.2.0                          | MIT                                                 | crates.io                              |
| bytemuck                         | 1.25.0                         | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| byteorder                        | 1.5.0                          | Unlicense OR MIT                                    | crates.io                              |
| byteorder-lite                   | 0.1.0                          | Unlicense OR MIT                                    | crates.io                              |
| bytes                            | 1.11.1                         | MIT                                                 | crates.io                              |
| cairo-rs                         | 0.18.5                         | MIT                                                 | crates.io                              |
| cairo-sys-rs                     | 0.18.2                         | MIT                                                 | crates.io                              |
| camino                           | 1.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| cargo-platform                   | 0.1.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| cargo_metadata                   | 0.19.2                         | MIT                                                 | crates.io                              |
| cargo_toml                       | 0.22.3                         | Apache-2.0 OR MIT                                   | crates.io                              |
| cast                             | 0.3.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| cbindgen                         | 0.29.2                         | MPL-2.0                                             | crates.io                              |
| cc                               | 1.2.56                         | MIT OR Apache-2.0                                   | crates.io                              |
| cesu8                            | 1.1.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| cfb                              | 0.7.3                          | MIT                                                 | crates.io                              |
| cfg-expr                         | 0.15.8                         | MIT OR Apache-2.0                                   | crates.io                              |
| cfg-expr                         | 0.20.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| cfg-if                           | 1.0.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| cfg_aliases                      | 0.2.1                          | MIT                                                 | crates.io                              |
| chrono                           | 0.4.43                         | MIT OR Apache-2.0                                   | crates.io                              |
| clap                             | 4.5.60                         | MIT OR Apache-2.0                                   | crates.io                              |
| clap_builder                     | 4.5.60                         | MIT OR Apache-2.0                                   | crates.io                              |
| clap_derive                      | 4.5.55                         | MIT OR Apache-2.0                                   | crates.io                              |
| clap_lex                         | 1.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| clipboard-win                    | 5.4.1                          | BSL-1.0                                             | crates.io                              |
| cmake                            | 0.1.57                         | MIT OR Apache-2.0                                   | crates.io                              |
| cocoa                            | 0.24.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| cocoa-foundation                 | 0.1.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| colorchoice                      | 1.0.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| combine                          | 4.6.7                          | MIT                                                 | crates.io                              |
| compression-codecs               | 0.4.38                         | MIT OR Apache-2.0                                   | crates.io                              |
| compression-core                 | 0.4.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| concurrent-queue                 | 2.5.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| console                          | 0.16.3                         | MIT                                                 | crates.io                              |
| convert_case                     | 0.4.0                          | MIT                                                 | crates.io                              |
| cookie                           | 0.18.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| core-foundation                  | 0.10.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| core-foundation                  | 0.9.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| core-foundation-sys              | 0.8.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| core-graphics                    | 0.22.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| core-graphics                    | 0.25.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| core-graphics-types              | 0.1.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| core-graphics-types              | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| coreaudio-rs                     | 0.14.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| cpal                             | 0.18.2                         | Apache-2.0                                          | crates.io                              |
| cpufeatures                      | 0.2.17                         | MIT OR Apache-2.0                                   | crates.io                              |
| crc32fast                        | 1.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| crossbeam-channel                | 0.5.15                         | MIT OR Apache-2.0                                   | crates.io                              |
| crossbeam-utils                  | 0.8.21                         | MIT OR Apache-2.0                                   | crates.io                              |
| crunchy                          | 0.2.4                          | MIT                                                 | crates.io                              |
| crypto-common                    | 0.1.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| cssparser                        | 0.29.6                         | MPL-2.0                                             | crates.io                              |
| cssparser                        | 0.36.0                         | MPL-2.0                                             | crates.io                              |
| cssparser-macros                 | 0.6.1                          | MPL-2.0                                             | crates.io                              |
| ctor                             | 0.8.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| ctor-proc-macro                  | 0.0.7                          | Apache-2.0 OR MIT                                   | crates.io                              |
| darling                          | 0.21.3                         | MIT                                                 | crates.io                              |
| darling_core                     | 0.21.3                         | MIT                                                 | crates.io                              |
| darling_macro                    | 0.21.3                         | MIT                                                 | crates.io                              |
| dasp_sample                      | 0.11.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| dbus                             | 0.9.12                         | Apache-2.0 OR MIT                                   | crates.io                              |
| der                              | 0.7.10                         | Apache-2.0 OR MIT                                   | crates.io                              |
| deranged                         | 0.5.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| derive_arbitrary                 | 1.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| derive_more                      | 0.99.20                        | MIT                                                 | crates.io                              |
| derive_more                      | 2.1.1                          | MIT                                                 | crates.io                              |
| derive_more-impl                 | 2.1.1                          | MIT                                                 | crates.io                              |
| digest                           | 0.10.7                         | MIT OR Apache-2.0                                   | crates.io                              |
| dirs                             | 4.0.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| dirs                             | 6.0.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| dirs-sys                         | 0.3.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| dirs-sys                         | 0.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| dispatch                         | 0.2.0                          | MIT                                                 | crates.io                              |
| dispatch2                        | 0.3.0                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| displaydoc                       | 0.2.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| dlopen2                          | 0.8.2                          | MIT                                                 | crates.io                              |
| dlopen2_derive                   | 0.4.3                          | MIT                                                 | crates.io                              |
| dom_query                        | 0.27.0                         | MIT                                                 | crates.io                              |
| downcast-rs                      | 1.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| dpi                              | 0.1.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| dtoa                             | 1.0.11                         | MIT OR Apache-2.0                                   | crates.io                              |
| dtoa-short                       | 0.3.5                          | MPL-2.0                                             | crates.io                              |
| dunce                            | 1.0.5                          | CC0-1.0 OR MIT-0 OR Apache-2.0                      | crates.io                              |
| dyn-clone                        | 1.0.20                         | MIT OR Apache-2.0                                   | crates.io                              |
| earshot                          | 1.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| embed-resource                   | 3.0.6                          | MIT                                                 | crates.io                              |
| embed_plist                      | 1.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| encode_unicode                   | 1.0.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| encoding_rs                      | 0.8.35                         | Apache-2.0 OR MIT OR BSD-3-Clause                   | crates.io                              |
| endi                             | 1.1.1                          | MIT                                                 | crates.io                              |
| enigo                            | 0.6.1                          | MIT                                                 | crates.io                              |
| enum-map                         | 2.7.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| enum-map-derive                  | 0.17.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| enum-primitive-derive            | 0.3.0                          | MIT                                                 | crates.io                              |
| enumflags2                       | 0.7.12                         | MIT OR Apache-2.0                                   | crates.io                              |
| enumflags2_derive                | 0.7.12                         | MIT OR Apache-2.0                                   | crates.io                              |
| env_filter                       | 0.1.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| epoll                            | 4.4.0                          | MPL-2.0                                             | crates.io                              |
| equivalent                       | 1.0.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| erased-serde                     | 0.4.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| errno                            | 0.3.14                         | MIT OR Apache-2.0                                   | crates.io                              |
| error-code                       | 3.3.2                          | BSL-1.0                                             | crates.io                              |
| evdev                            | 0.13.2                         | Apache-2.0 OR MIT                                   | crates.io                              |
| event-listener                   | 5.4.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| event-listener-strategy          | 0.5.4                          | Apache-2.0 OR MIT                                   | crates.io                              |
| extended                         | 0.1.0                          | MIT                                                 | crates.io                              |
| fallible-iterator                | 0.3.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| fallible-streaming-iterator      | 0.1.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| fastrand                         | 2.3.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| fax                              | 0.2.6                          | MIT                                                 | crates.io                              |
| fax_derive                       | 0.2.0                          | MIT                                                 | crates.io                              |
| fdeflate                         | 0.3.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| fern                             | 0.7.1                          | MIT                                                 | crates.io                              |
| ferrous-opencc                   | 0.2.3                          | Apache-2.0                                          | crates.io                              |
| ferrous-opencc-compiler          | 0.1.0                          | Apache-2.0                                          | crates.io                              |
| field-offset                     | 0.3.6                          | MIT OR Apache-2.0                                   | crates.io                              |
| filetime                         | 0.2.27                         | MIT OR Apache-2.0                                   | crates.io                              |
| find-msvc-tools                  | 0.1.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| fixedbitset                      | 0.5.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| flate2                           | 1.1.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| fnv                              | 1.0.7                          | Apache-2.0 OR MIT                                   | crates.io                              |
| foldhash                         | 0.1.5                          | Zlib                                                | crates.io                              |
| foldhash                         | 0.2.0                          | Zlib                                                | crates.io                              |
| foreign-types                    | 0.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| foreign-types                    | 0.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| foreign-types-macros             | 0.2.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| foreign-types-shared             | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| foreign-types-shared             | 0.3.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| form_urlencoded                  | 1.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| fst                              | 0.4.7                          | Unlicense OR MIT                                    | crates.io                              |
| funty                            | 2.0.0                          | MIT                                                 | crates.io                              |
| futf                             | 0.1.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| futures                          | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-channel                  | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-core                     | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-executor                 | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-io                       | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-lite                     | 2.6.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| futures-macro                    | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-sink                     | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-task                     | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| futures-util                     | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| fxhash                           | 0.2.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| gdk                              | 0.18.2                         | MIT                                                 | crates.io                              |
| gdk-pixbuf                       | 0.18.5                         | MIT                                                 | crates.io                              |
| gdk-pixbuf-sys                   | 0.18.0                         | MIT                                                 | crates.io                              |
| gdk-sys                          | 0.18.2                         | MIT                                                 | crates.io                              |
| gdkwayland-sys                   | 0.18.2                         | MIT                                                 | crates.io                              |
| gdkx11                           | 0.18.2                         | MIT                                                 | crates.io                              |
| gdkx11-sys                       | 0.18.2                         | MIT                                                 | crates.io                              |
| generic-array                    | 0.14.7                         | MIT                                                 | crates.io                              |
| gethostname                      | 1.1.0                          | Apache-2.0                                          | crates.io                              |
| getrandom                        | 0.1.16                         | MIT OR Apache-2.0                                   | crates.io                              |
| getrandom                        | 0.2.17                         | MIT OR Apache-2.0                                   | crates.io                              |
| getrandom                        | 0.3.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| getrandom                        | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| gio                              | 0.18.4                         | MIT                                                 | crates.io                              |
| gio-sys                          | 0.18.1                         | MIT                                                 | crates.io                              |
| glib                             | 0.18.5                         | MIT                                                 | crates.io                              |
| glib-macros                      | 0.18.5                         | MIT                                                 | crates.io                              |
| glib-sys                         | 0.18.1                         | MIT                                                 | crates.io                              |
| glob                             | 0.3.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| global-hotkey                    | 0.8.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| gobject-sys                      | 0.18.0                         | MIT                                                 | crates.io                              |
| gtk                              | 0.18.2                         | MIT                                                 | crates.io                              |
| gtk-layer-shell                  | 0.8.2                          | MIT                                                 | crates.io                              |
| gtk-layer-shell-sys              | 0.7.2                          | MIT                                                 | crates.io                              |
| gtk-sys                          | 0.18.2                         | MIT                                                 | crates.io                              |
| gtk3-macros                      | 0.18.2                         | MIT                                                 | crates.io                              |
| h2                               | 0.4.13                         | MIT                                                 | crates.io                              |
| half                             | 2.7.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| hashbrown                        | 0.12.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| hashbrown                        | 0.14.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| hashbrown                        | 0.15.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| hashbrown                        | 0.16.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| hashlink                         | 0.10.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| heck                             | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| heck                             | 0.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| hermit-abi                       | 0.5.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| hex                              | 0.4.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| hf-hub                           | 0.5.0                          | Apache-2.0                                          | git: github.com/matt-nowakowski/hf-hub |
| hound                            | 3.5.1                          | Apache-2.0                                          | crates.io                              |
| html5ever                        | 0.29.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| html5ever                        | 0.38.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| http                             | 1.4.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| http-body                        | 1.0.1                          | MIT                                                 | crates.io                              |
| http-body-util                   | 0.1.3                          | MIT                                                 | crates.io                              |
| http-range                       | 0.1.5                          | MIT                                                 | crates.io                              |
| httparse                         | 1.10.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| hyper                            | 1.8.1                          | MIT                                                 | crates.io                              |
| hyper-rustls                     | 0.27.7                         | Apache-2.0 OR ISC OR MIT                            | crates.io                              |
| hyper-tls                        | 0.6.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| hyper-util                       | 0.1.20                         | MIT                                                 | crates.io                              |
| iana-time-zone                   | 0.1.65                         | MIT OR Apache-2.0                                   | crates.io                              |
| iana-time-zone-haiku             | 0.1.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| ico                              | 0.5.0                          | MIT                                                 | crates.io                              |
| icu_collections                  | 2.1.1                          | Unicode-3.0                                         | crates.io                              |
| icu_locale_core                  | 2.1.1                          | Unicode-3.0                                         | crates.io                              |
| icu_normalizer                   | 2.1.1                          | Unicode-3.0                                         | crates.io                              |
| icu_normalizer_data              | 2.1.1                          | Unicode-3.0                                         | crates.io                              |
| icu_properties                   | 2.1.2                          | Unicode-3.0                                         | crates.io                              |
| icu_properties_data              | 2.1.2                          | Unicode-3.0                                         | crates.io                              |
| icu_provider                     | 2.1.1                          | Unicode-3.0                                         | crates.io                              |
| ident_case                       | 1.0.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| idna                             | 1.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| idna_adapter                     | 1.2.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| image                            | 0.25.9                         | MIT OR Apache-2.0                                   | crates.io                              |
| indexmap                         | 1.9.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| indexmap                         | 2.13.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| indicatif                        | 0.18.4                         | MIT                                                 | crates.io                              |
| infer                            | 0.19.0                         | MIT                                                 | crates.io                              |
| Inflector                        | 0.11.4                         | BSD-2-Clause                                        | crates.io                              |
| inotify                          | 0.10.2                         | ISC                                                 | crates.io                              |
| inotify-sys                      | 0.1.5                          | ISC                                                 | crates.io                              |
| ipnet                            | 2.11.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| iri-string                       | 0.7.10                         | MIT OR Apache-2.0                                   | crates.io                              |
| is-docker                        | 0.2.0                          | MIT                                                 | crates.io                              |
| is-wsl                           | 0.4.0                          | MIT                                                 | crates.io                              |
| is_terminal_polyfill             | 1.70.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| isolang                          | 2.4.0                          | Apache-2.0                                          | crates.io                              |
| itoa                             | 1.0.17                         | MIT OR Apache-2.0                                   | crates.io                              |
| javascriptcore-rs                | 1.1.2                          | MIT                                                 | crates.io                              |
| javascriptcore-rs-sys            | 1.1.1                          | MIT                                                 | crates.io                              |
| jni                              | 0.21.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| jni                              | 0.22.4                         | MIT OR Apache-2.0                                   | crates.io                              |
| jni-macros                       | 0.22.4                         | MIT OR Apache-2.0                                   | crates.io                              |
| jni-sys                          | 0.3.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| jni-sys                          | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| jni-sys-macros                   | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| js-sys                           | 0.3.87                         | MIT OR Apache-2.0                                   | crates.io                              |
| json-patch                       | 3.0.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| jsonptr                          | 0.6.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| keyboard-types                   | 0.7.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| kuchikiki                        | 0.8.8-speedreader              | MIT                                                 | crates.io                              |
| lazy_static                      | 1.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| libappindicator                  | 0.9.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| libappindicator-sys              | 0.9.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| libc                             | 0.2.182                        | MIT OR Apache-2.0                                   | crates.io                              |
| libdbus-sys                      | 0.2.7                          | Apache-2.0 OR MIT                                   | crates.io                              |
| libloading                       | 0.7.4                          | ISC                                                 | crates.io                              |
| libm                             | 0.2.16                         | MIT                                                 | crates.io                              |
| libredox                         | 0.1.12                         | MIT                                                 | crates.io                              |
| libsqlite3-sys                   | 0.35.0                         | MIT                                                 | crates.io                              |
| linux-raw-sys                    | 0.11.0                         | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| litemap                          | 0.8.1                          | Unicode-3.0                                         | crates.io                              |
| lock_api                         | 0.4.14                         | MIT OR Apache-2.0                                   | crates.io                              |
| log                              | 0.4.29                         | MIT OR Apache-2.0                                   | crates.io                              |
| mac                              | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| mac-notification-sys             | 0.6.15                         | MIT OR Apache-2.0                                   | crates.io                              |
| mach2                            | 0.6.0                          | BSD-2-Clause OR MIT OR Apache-2.0                   | crates.io                              |
| macos-accessibility-client       | 0.0.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| malloc_buf                       | 0.0.6                          | MIT                                                 | crates.io                              |
| markup5ever                      | 0.14.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| markup5ever                      | 0.38.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| match_token                      | 0.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| matches                          | 0.1.10                         | MIT                                                 | crates.io                              |
| memchr                           | 2.8.0                          | Unlicense OR MIT                                    | crates.io                              |
| memmap2                          | 0.9.10                         | MIT OR Apache-2.0                                   | crates.io                              |
| memoffset                        | 0.9.1                          | MIT                                                 | crates.io                              |
| mime                             | 0.3.17                         | MIT OR Apache-2.0                                   | crates.io                              |
| minicov                          | 0.3.8                          | Apache-2.0 OR MIT                                   | crates.io                              |
| minisign-verify                  | 0.2.4                          | MIT                                                 | crates.io                              |
| miniz_oxide                      | 0.8.9                          | MIT OR Zlib OR Apache-2.0                           | crates.io                              |
| mio                              | 0.8.11                         | MIT                                                 | crates.io                              |
| mio                              | 1.1.1                          | MIT                                                 | crates.io                              |
| moxcms                           | 0.7.11                         | BSD-3-Clause OR Apache-2.0                          | crates.io                              |
| muda                             | 0.19.3                         | Apache-2.0 OR MIT                                   | crates.io                              |
| native-tls                       | 0.2.18                         | MIT OR Apache-2.0                                   | crates.io                              |
| natural                          | 0.5.0                          | MIT                                                 | crates.io                              |
| ndk                              | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| ndk-context                      | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| ndk-sys                          | 0.6.0+11769913                 | MIT OR Apache-2.0                                   | crates.io                              |
| new_debug_unreachable            | 1.0.6                          | MIT                                                 | crates.io                              |
| nix                              | 0.29.0                         | MIT                                                 | crates.io                              |
| nix                              | 0.30.1                         | MIT                                                 | crates.io                              |
| nodrop                           | 0.1.14                         | MIT OR Apache-2.0                                   | crates.io                              |
| nom                              | 8.0.0                          | MIT                                                 | crates.io                              |
| notify-rust                      | 4.18.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| nu-ansi-term                     | 0.50.3                         | MIT                                                 | crates.io                              |
| num-bigint                       | 0.4.6                          | MIT OR Apache-2.0                                   | crates.io                              |
| num-complex                      | 0.4.6                          | MIT OR Apache-2.0                                   | crates.io                              |
| num-conv                         | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| num-derive                       | 0.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| num-integer                      | 0.1.46                         | MIT OR Apache-2.0                                   | crates.io                              |
| num-rational                     | 0.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| num-traits                       | 0.2.19                         | MIT OR Apache-2.0                                   | crates.io                              |
| num_cpus                         | 1.17.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| num_enum                         | 0.7.5                          | BSD-3-Clause OR MIT OR Apache-2.0                   | crates.io                              |
| num_enum_derive                  | 0.7.5                          | BSD-3-Clause OR MIT OR Apache-2.0                   | crates.io                              |
| num_threads                      | 0.1.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| objc                             | 0.2.7                          | MIT                                                 | crates.io                              |
| objc2                            | 0.6.4                          | MIT                                                 | crates.io                              |
| objc2-app-kit                    | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-audio-toolbox              | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-av-foundation              | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-avf-audio                  | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-cloud-kit                  | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-audio                 | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-audio-types           | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-data                  | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-foundation            | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-graphics              | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-image                 | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-location              | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-text                  | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-core-video                 | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-encode                     | 4.1.0                          | MIT                                                 | crates.io                              |
| objc2-exception-helper           | 0.1.1                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-foundation                 | 0.3.2                          | MIT                                                 | crates.io                              |
| objc2-metal                      | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-osa-kit                    | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-quartz-core                | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-security                   | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-service-management         | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-ui-kit                     | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-user-notifications         | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| objc2-web-kit                    | 0.3.2                          | Zlib OR Apache-2.0 OR MIT                           | crates.io                              |
| once_cell                        | 1.21.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| once_cell_polyfill               | 1.70.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| oorandom                         | 11.1.5                         | MIT                                                 | crates.io                              |
| open                             | 5.3.3                          | MIT                                                 | crates.io                              |
| openssl                          | 0.10.75                        | Apache-2.0                                          | crates.io                              |
| openssl-macros                   | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| openssl-probe                    | 0.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| openssl-sys                      | 0.9.111                        | MIT                                                 | crates.io                              |
| option-ext                       | 0.2.0                          | MPL-2.0                                             | crates.io                              |
| ordered-stream                   | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| os_info                          | 3.14.0                         | MIT                                                 | crates.io                              |
| os_pipe                          | 1.2.3                          | MIT                                                 | crates.io                              |
| osakit                           | 0.3.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| pango                            | 0.18.3                         | MIT                                                 | crates.io                              |
| pango-sys                        | 0.18.0                         | MIT                                                 | crates.io                              |
| parking                          | 2.2.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| parking_lot                      | 0.12.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| parking_lot_core                 | 0.9.12                         | MIT OR Apache-2.0                                   | crates.io                              |
| paste                            | 1.0.15                         | MIT OR Apache-2.0                                   | crates.io                              |
| pastey                           | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| pathdiff                         | 0.2.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| pem-rfc7468                      | 0.7.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| percent-encoding                 | 2.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| petgraph                         | 0.8.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| phf                              | 0.10.1                         | MIT                                                 | crates.io                              |
| phf                              | 0.11.3                         | MIT                                                 | crates.io                              |
| phf                              | 0.13.1                         | MIT                                                 | crates.io                              |
| phf                              | 0.8.0                          | MIT                                                 | crates.io                              |
| phf_codegen                      | 0.11.3                         | MIT                                                 | crates.io                              |
| phf_codegen                      | 0.13.1                         | MIT                                                 | crates.io                              |
| phf_codegen                      | 0.8.0                          | MIT                                                 | crates.io                              |
| phf_generator                    | 0.10.0                         | MIT                                                 | crates.io                              |
| phf_generator                    | 0.11.3                         | MIT                                                 | crates.io                              |
| phf_generator                    | 0.13.1                         | MIT                                                 | crates.io                              |
| phf_generator                    | 0.8.0                          | MIT                                                 | crates.io                              |
| phf_macros                       | 0.10.0                         | MIT                                                 | crates.io                              |
| phf_macros                       | 0.13.1                         | MIT                                                 | crates.io                              |
| phf_shared                       | 0.10.0                         | MIT                                                 | crates.io                              |
| phf_shared                       | 0.11.3                         | MIT                                                 | crates.io                              |
| phf_shared                       | 0.13.1                         | MIT                                                 | crates.io                              |
| phf_shared                       | 0.8.0                          | MIT                                                 | crates.io                              |
| pin-project-lite                 | 0.2.16                         | Apache-2.0 OR MIT                                   | crates.io                              |
| pin-utils                        | 0.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| piper                            | 0.2.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| pkg-config                       | 0.3.32                         | MIT OR Apache-2.0                                   | crates.io                              |
| plist                            | 1.8.0                          | MIT                                                 | crates.io                              |
| png                              | 0.17.16                        | MIT OR Apache-2.0                                   | crates.io                              |
| png                              | 0.18.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| polling                          | 3.11.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| portable-atomic                  | 1.13.1                         | Apache-2.0 OR MIT                                   | crates.io                              |
| potential_utf                    | 0.1.4                          | Unicode-3.0                                         | crates.io                              |
| powerfmt                         | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| ppv-lite86                       | 0.2.21                         | MIT OR Apache-2.0                                   | crates.io                              |
| precomputed-hash                 | 0.1.1                          | MIT                                                 | crates.io                              |
| primal-check                     | 0.3.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-crate                 | 1.3.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-crate                 | 2.0.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-crate                 | 3.4.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-error                 | 1.0.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-error-attr            | 1.0.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro-hack                  | 0.5.20+deprecated              | MIT OR Apache-2.0                                   | crates.io                              |
| proc-macro2                      | 1.0.106                        | MIT OR Apache-2.0                                   | crates.io                              |
| pulseaudio                       | 0.3.1                          | MIT                                                 | crates.io                              |
| pxfm                             | 0.1.27                         | BSD-3-Clause OR Apache-2.0                          | crates.io                              |
| quick-error                      | 2.0.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| quick-xml                        | 0.38.4                         | MIT                                                 | crates.io                              |
| quote                            | 1.0.44                         | MIT OR Apache-2.0                                   | crates.io                              |
| r-efi                            | 5.3.0                          | MIT OR Apache-2.0 OR LGPL-2.1-or-later              | crates.io                              |
| radium                           | 0.7.0                          | MIT                                                 | crates.io                              |
| rand                             | 0.7.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand                             | 0.8.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand                             | 0.9.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_chacha                      | 0.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_chacha                      | 0.3.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_chacha                      | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_core                        | 0.5.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_core                        | 0.6.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_core                        | 0.9.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_hc                          | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| rand_pcg                         | 0.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| raw-window-handle                | 0.6.2                          | MIT OR Apache-2.0 OR Zlib                           | crates.io                              |
| rdev                             | 0.5.0-2                        | MIT                                                 | git: github.com/rustdesk-org/rdev      |
| realfft                          | 3.5.0                          | MIT                                                 | crates.io                              |
| redox_syscall                    | 0.5.18                         | MIT                                                 | crates.io                              |
| redox_syscall                    | 0.7.1                          | MIT                                                 | crates.io                              |
| redox_users                      | 0.4.6                          | MIT                                                 | crates.io                              |
| redox_users                      | 0.5.2                          | MIT                                                 | crates.io                              |
| regex                            | 1.12.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| regex-automata                   | 0.4.14                         | MIT OR Apache-2.0                                   | crates.io                              |
| regex-syntax                     | 0.8.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| reqwest                          | 0.12.28                        | MIT OR Apache-2.0                                   | crates.io                              |
| reqwest                          | 0.13.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| rfd                              | 0.16.0                         | MIT                                                 | crates.io                              |
| ring                             | 0.17.14                        | Apache-2.0 OR ISC                                   | crates.io                              |
| rodio                            | 0.23.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| rtrb                             | 0.4.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| rubato                           | 5.0.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| rusqlite                         | 0.37.0                         | MIT                                                 | crates.io                              |
| rusqlite_migration               | 2.3.0                          | Apache-2.0                                          | crates.io                              |
| rust-stemmers                    | 1.2.0                          | MIT OR BSD-3-Clause                                 | crates.io                              |
| rust_decimal                     | 1.40.0                         | MIT                                                 | crates.io                              |
| rustc-hash                       | 2.1.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| rustc_version                    | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| rustfft                          | 6.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| rustix                           | 1.1.3                          | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| rustls                           | 0.23.36                        | Apache-2.0 OR ISC OR MIT                            | crates.io                              |
| rustls-native-certs              | 0.8.3                          | Apache-2.0 OR ISC OR MIT                            | crates.io                              |
| rustls-pki-types                 | 1.14.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| rustls-platform-verifier         | 0.6.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| rustls-platform-verifier-android | 0.1.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| rustls-webpki                    | 0.103.9                        | ISC                                                 | crates.io                              |
| rustversion                      | 1.0.22                         | MIT OR Apache-2.0                                   | crates.io                              |
| ryu                              | 1.0.23                         | Apache-2.0 OR BSL-1.0                               | crates.io                              |
| same-file                        | 1.0.6                          | Unlicense OR MIT                                    | crates.io                              |
| schannel                         | 0.1.28                         | MIT                                                 | crates.io                              |
| schemars                         | 0.8.22                         | MIT                                                 | crates.io                              |
| schemars_derive                  | 0.8.22                         | MIT                                                 | crates.io                              |
| scopeguard                       | 1.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| security-framework               | 3.7.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| security-framework-sys           | 2.17.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| selectors                        | 0.24.0                         | MPL-2.0                                             | crates.io                              |
| selectors                        | 0.36.1                         | MPL-2.0                                             | crates.io                              |
| semver                           | 1.0.27                         | MIT OR Apache-2.0                                   | crates.io                              |
| serde                            | 1.0.228                        | MIT OR Apache-2.0                                   | crates.io                              |
| serde-untagged                   | 0.1.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| serde_core                       | 1.0.228                        | MIT OR Apache-2.0                                   | crates.io                              |
| serde_derive                     | 1.0.228                        | MIT OR Apache-2.0                                   | crates.io                              |
| serde_derive_internals           | 0.29.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| serde_json                       | 1.0.149                        | MIT OR Apache-2.0                                   | crates.io                              |
| serde_repr                       | 0.1.20                         | MIT OR Apache-2.0                                   | crates.io                              |
| serde_spanned                    | 0.6.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| serde_spanned                    | 1.0.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| serde_urlencoded                 | 0.7.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| serde_with                       | 3.16.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| serde_with_macros                | 3.16.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| serialize-to-javascript          | 0.1.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| serialize-to-javascript-impl     | 0.1.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| servo_arc                        | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| servo_arc                        | 0.4.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| sha2                             | 0.10.9                         | MIT OR Apache-2.0                                   | crates.io                              |
| shlex                            | 1.3.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| signal-hook                      | 0.3.18                         | Apache-2.0 OR MIT                                   | crates.io                              |
| signal-hook-registry             | 1.4.8                          | MIT OR Apache-2.0                                   | crates.io                              |
| simd-adler32                     | 0.3.8                          | MIT                                                 | crates.io                              |
| simd_cesu8                       | 1.2.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| simdutf8                         | 0.1.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| siphasher                        | 0.3.11                         | MIT OR Apache-2.0                                   | crates.io                              |
| siphasher                        | 1.0.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| slab                             | 0.4.12                         | MIT                                                 | crates.io                              |
| smallvec                         | 1.15.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| socket2                          | 0.6.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| socks                            | 0.3.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| softbuffer                       | 0.4.8                          | MIT OR Apache-2.0                                   | crates.io                              |
| soup3                            | 0.5.0                          | MIT                                                 | crates.io                              |
| soup3-sys                        | 0.5.0                          | MIT                                                 | crates.io                              |
| specta                           | 2.0.0-rc.22                    | MIT                                                 | crates.io                              |
| specta-macros                    | 2.0.0-rc.18                    | MIT                                                 | crates.io                              |
| specta-serde                     | 0.0.9                          | MIT                                                 | crates.io                              |
| specta-typescript                | 0.0.9                          | MIT                                                 | crates.io                              |
| stable_deref_trait               | 1.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| strength_reduce                  | 0.2.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| string_cache                     | 0.8.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| string_cache                     | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| string_cache_codegen             | 0.5.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| string_cache_codegen             | 0.6.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| strsim                           | 0.11.1                         | MIT                                                 | crates.io                              |
| strum                            | 0.24.1                         | MIT                                                 | crates.io                              |
| strum_macros                     | 0.24.3                         | MIT                                                 | crates.io                              |
| subtle                           | 2.6.1                          | BSD-3-Clause                                        | crates.io                              |
| swift-rs                         | 1.0.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| symphonia                        | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-bundle-flac            | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-bundle-mp3             | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-codec-aac              | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-codec-adpcm            | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-codec-alac             | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-codec-pcm              | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-codec-vorbis           | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-core                   | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-format-isomp4          | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-format-mkv             | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-format-ogg             | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-format-riff            | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-metadata               | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| symphonia-utils-xiph             | 0.5.5                          | MPL-2.0                                             | crates.io                              |
| syn                              | 1.0.109                        | MIT OR Apache-2.0                                   | crates.io                              |
| syn                              | 2.0.117                        | MIT OR Apache-2.0                                   | crates.io                              |
| sync_wrapper                     | 1.0.2                          | Apache-2.0                                          | crates.io                              |
| synstructure                     | 0.13.2                         | MIT                                                 | crates.io                              |
| sys-locale                       | 0.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| system-configuration             | 0.7.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| system-configuration-sys         | 0.6.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| system-deps                      | 6.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| system-deps                      | 7.0.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| tao                              | 0.35.3                         | Apache-2.0                                          | git: github.com/matt-nowakowski/tao    |
| tao-macros                       | 0.1.3                          | MIT OR Apache-2.0                                   | git: github.com/matt-nowakowski/tao    |
| tap                              | 1.0.1                          | MIT                                                 | crates.io                              |
| tar                              | 0.4.44                         | MIT OR Apache-2.0                                   | crates.io                              |
| target-lexicon                   | 0.12.16                        | Apache-2.0 WITH LLVM-exception                      | crates.io                              |
| target-lexicon                   | 0.13.3                         | Apache-2.0 WITH LLVM-exception                      | crates.io                              |
| tauri                            | 2.11.5                         | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-build                      | 2.6.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-codegen                    | 2.6.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-macros                     | 2.6.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-nspanel                    | 2.1.0                          | MIT OR Apache-2.0                                   | git: github.com/ahkohd/tauri-nspanel   |
| tauri-plugin                     | 2.5.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-autostart           | 2.5.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-clipboard-manager   | 2.3.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-dialog              | 2.6.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-fs                  | 2.4.5                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-global-shortcut     | 2.3.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-log                 | 2.8.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-macos-permissions   | 2.3.0                          | MIT                                                 | crates.io                              |
| tauri-plugin-notification        | 2.4.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-opener              | 2.5.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-os                  | 2.3.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-process             | 2.3.1                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-single-instance     | 2.4.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-store               | 2.4.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-plugin-updater             | 2.10.1                         | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-runtime                    | 2.11.3                         | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-runtime-wry                | 2.11.4                         | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-specta                     | 2.0.0-rc.21                    | MIT                                                 | crates.io                              |
| tauri-specta-macros              | 2.0.0-rc.16                    | MIT                                                 | crates.io                              |
| tauri-utils                      | 2.9.3                          | Apache-2.0 OR MIT                                   | crates.io                              |
| tauri-winres                     | 0.3.5                          | MIT                                                 | crates.io                              |
| tauri-winrt-notification         | 0.8.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| tempfile                         | 3.25.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| tendril                          | 0.4.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| tendril                          | 0.5.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| thiserror                        | 1.0.69                         | MIT OR Apache-2.0                                   | crates.io                              |
| thiserror                        | 2.0.18                         | MIT OR Apache-2.0                                   | crates.io                              |
| thiserror-impl                   | 1.0.69                         | MIT OR Apache-2.0                                   | crates.io                              |
| thiserror-impl                   | 2.0.18                         | MIT OR Apache-2.0                                   | crates.io                              |
| tiff                             | 0.10.3                         | MIT                                                 | crates.io                              |
| time                             | 0.3.47                         | MIT OR Apache-2.0                                   | crates.io                              |
| time-core                        | 0.1.8                          | MIT OR Apache-2.0                                   | crates.io                              |
| time-macros                      | 0.2.27                         | MIT OR Apache-2.0                                   | crates.io                              |
| tinystr                          | 0.8.2                          | Unicode-3.0                                         | crates.io                              |
| tokio                            | 1.49.0                         | MIT                                                 | crates.io                              |
| tokio-macros                     | 2.6.0                          | MIT                                                 | crates.io                              |
| tokio-native-tls                 | 0.3.1                          | MIT                                                 | crates.io                              |
| tokio-rustls                     | 0.26.4                         | MIT OR Apache-2.0                                   | crates.io                              |
| tokio-util                       | 0.7.18                         | MIT                                                 | crates.io                              |
| toml                             | 0.8.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| toml                             | 0.9.12+spec-1.1.0              | MIT OR Apache-2.0                                   | crates.io                              |
| toml_datetime                    | 0.6.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| toml_datetime                    | 0.7.5+spec-1.1.0               | MIT OR Apache-2.0                                   | crates.io                              |
| toml_edit                        | 0.19.15                        | MIT OR Apache-2.0                                   | crates.io                              |
| toml_edit                        | 0.20.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| toml_edit                        | 0.23.10+spec-1.0.0             | MIT OR Apache-2.0                                   | crates.io                              |
| toml_parser                      | 1.0.9+spec-1.1.0               | MIT OR Apache-2.0                                   | crates.io                              |
| toml_writer                      | 1.0.6+spec-1.1.0               | MIT OR Apache-2.0                                   | crates.io                              |
| tower                            | 0.5.3                          | MIT                                                 | crates.io                              |
| tower-http                       | 0.6.8                          | MIT                                                 | crates.io                              |
| tower-layer                      | 0.3.3                          | MIT                                                 | crates.io                              |
| tower-service                    | 0.3.3                          | MIT                                                 | crates.io                              |
| tracing                          | 0.1.44                         | MIT                                                 | crates.io                              |
| tracing-attributes               | 0.1.31                         | MIT                                                 | crates.io                              |
| tracing-core                     | 0.1.36                         | MIT                                                 | crates.io                              |
| transcribe-cpp                   | 0.4.0                          | MIT                                                 | crates.io                              |
| transcribe-cpp-sys               | 0.4.0                          | MIT                                                 | crates.io                              |
| transpose                        | 0.2.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| tray-icon                        | 0.24.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| tree_magic_mini                  | 3.2.2                          | MIT                                                 | crates.io                              |
| try-lock                         | 0.2.5                          | MIT                                                 | crates.io                              |
| typeid                           | 1.0.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| typenum                          | 1.19.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| uds_windows                      | 1.1.0                          | MIT                                                 | crates.io                              |
| unic-char-property               | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| unic-char-range                  | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| unic-common                      | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| unic-ucd-ident                   | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| unic-ucd-version                 | 0.9.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| unicode-ident                    | 1.0.24                         | MIT OR Apache-2.0 OR Unicode-3.0                    | crates.io                              |
| unicode-segmentation             | 1.12.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| unicode-width                    | 0.2.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| unit-prefix                      | 0.5.2                          | MIT                                                 | crates.io                              |
| untrusted                        | 0.9.0                          | ISC                                                 | crates.io                              |
| unty                             | 0.0.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| ureq                             | 3.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| ureq-proto                       | 0.5.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| url                              | 2.5.8                          | MIT OR Apache-2.0                                   | crates.io                              |
| urlpattern                       | 0.3.0                          | MIT                                                 | crates.io                              |
| utf-8                            | 0.7.6                          | MIT OR Apache-2.0                                   | crates.io                              |
| utf8-width                       | 0.1.8                          | MIT                                                 | crates.io                              |
| utf8_iter                        | 1.0.4                          | Apache-2.0 OR MIT                                   | crates.io                              |
| utf8parse                        | 0.2.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| uuid                             | 1.21.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| value-bag                        | 1.12.0                         | Apache-2.0 OR MIT                                   | crates.io                              |
| vcpkg                            | 0.2.15                         | MIT OR Apache-2.0                                   | crates.io                              |
| version-compare                  | 0.2.1                          | MIT                                                 | crates.io                              |
| version_check                    | 0.9.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| virtue                           | 0.0.18                         | MIT                                                 | crates.io                              |
| visibility                       | 0.1.1                          | Zlib OR MIT OR Apache-2.0                           | crates.io                              |
| vswhom                           | 0.1.0                          | MIT                                                 | crates.io                              |
| vswhom-sys                       | 0.1.3                          | MIT                                                 | crates.io                              |
| walkdir                          | 2.5.0                          | Unlicense OR MIT                                    | crates.io                              |
| want                             | 0.3.1                          | MIT                                                 | crates.io                              |
| wasi                             | 0.11.1+wasi-snapshot-preview1  | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| wasi                             | 0.9.0+wasi-snapshot-preview1   | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| wasip2                           | 1.0.2+wasi-0.2.9               | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| wasip3                           | 0.4.0+wasi-0.3.0-rc-2026-01-06 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| wasm-bindgen                     | 0.2.110                        | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-futures             | 0.4.60                         | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-macro               | 0.2.110                        | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-macro-support       | 0.2.110                        | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-shared              | 0.2.110                        | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-test                | 0.3.60                         | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-test-macro          | 0.3.60                         | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-bindgen-test-shared         | 0.2.110                        | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-streams                     | 0.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| wasm-streams                     | 0.5.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| wayland-backend                  | 0.3.12                         | MIT                                                 | crates.io                              |
| wayland-client                   | 0.31.12                        | MIT                                                 | crates.io                              |
| wayland-protocols                | 0.32.10                        | MIT                                                 | crates.io                              |
| wayland-protocols-wlr            | 0.3.10                         | MIT                                                 | crates.io                              |
| wayland-scanner                  | 0.31.8                         | MIT                                                 | crates.io                              |
| wayland-sys                      | 0.31.8                         | MIT                                                 | crates.io                              |
| web-sys                          | 0.3.87                         | MIT OR Apache-2.0                                   | crates.io                              |
| web-time                         | 1.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| web_atoms                        | 0.2.5                          | MIT OR Apache-2.0                                   | crates.io                              |
| webkit2gtk                       | 2.0.2                          | MIT                                                 | crates.io                              |
| webkit2gtk-sys                   | 2.0.2                          | MIT                                                 | crates.io                              |
| webpki-root-certs                | 1.0.6                          | CDLA-Permissive-2.0                                 | crates.io                              |
| webpki-roots                     | 1.0.8                          | CDLA-Permissive-2.0                                 | crates.io                              |
| webview2-com                     | 0.38.2                         | MIT                                                 | crates.io                              |
| webview2-com-macros              | 0.8.1                          | MIT                                                 | crates.io                              |
| webview2-com-sys                 | 0.38.2                         | MIT                                                 | crates.io                              |
| weezl                            | 0.1.12                         | MIT OR Apache-2.0                                   | crates.io                              |
| whatlang                         | 0.16.4                         | MIT                                                 | crates.io                              |
| widestring                       | 1.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| winapi                           | 0.3.9                          | MIT OR Apache-2.0                                   | crates.io                              |
| winapi-i686-pc-windows-gnu       | 0.4.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| winapi-util                      | 0.1.11                         | Unlicense OR MIT                                    | crates.io                              |
| winapi-x86_64-pc-windows-gnu     | 0.4.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| window-vibrancy                  | 0.6.0                          | Apache-2.0 OR MIT                                   | crates.io                              |
| windowfunctions                  | 0.1.1                          | MIT                                                 | crates.io                              |
| windows                          | 0.58.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows                          | 0.61.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows                          | 0.62.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-collections              | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-collections              | 0.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-core                     | 0.58.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-core                     | 0.61.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-core                     | 0.62.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-future                   | 0.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-future                   | 0.3.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-implement                | 0.58.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-implement                | 0.60.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-interface                | 0.58.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-interface                | 0.59.3                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-link                     | 0.1.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-link                     | 0.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-numerics                 | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-numerics                 | 0.3.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-registry                 | 0.6.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-result                   | 0.2.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-result                   | 0.3.4                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-result                   | 0.4.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-strings                  | 0.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-strings                  | 0.4.2                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-strings                  | 0.5.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.45.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.48.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.52.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.59.0                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.60.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-sys                      | 0.61.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-targets                  | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-targets                  | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-targets                  | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-targets                  | 0.53.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows-threading                | 0.1.0                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-threading                | 0.2.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows-version                  | 0.1.7                          | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_gnullvm          | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_gnullvm          | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_gnullvm          | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_gnullvm          | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_msvc             | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_msvc             | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_msvc             | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_aarch64_msvc             | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnu                 | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnu                 | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnu                 | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnu                 | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnullvm             | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_gnullvm             | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_msvc                | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_msvc                | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_msvc                | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_i686_msvc                | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnu               | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnu               | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnu               | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnu               | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnullvm           | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnullvm           | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnullvm           | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_gnullvm           | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_msvc              | 0.42.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_msvc              | 0.48.5                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_msvc              | 0.52.6                         | MIT OR Apache-2.0                                   | crates.io                              |
| windows_x86_64_msvc              | 0.53.1                         | MIT OR Apache-2.0                                   | crates.io                              |
| winnow                           | 0.5.40                         | MIT                                                 | crates.io                              |
| winnow                           | 0.7.14                         | MIT                                                 | crates.io                              |
| winreg                           | 0.10.1                         | MIT                                                 | crates.io                              |
| winreg                           | 0.55.0                         | MIT                                                 | crates.io                              |
| wit-bindgen                      | 0.51.0                         | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io                              |
| wl-clipboard-rs                  | 0.9.3                          | MIT OR Apache-2.0                                   | crates.io                              |
| writeable                        | 0.6.2                          | Unicode-3.0                                         | crates.io                              |
| wry                              | 0.55.1                         | Apache-2.0 OR MIT                                   | crates.io                              |
| wyz                              | 0.5.1                          | MIT                                                 | crates.io                              |
| x11                              | 2.21.0                         | MIT                                                 | crates.io                              |
| x11-dl                           | 2.21.0                         | MIT                                                 | crates.io                              |
| x11rb                            | 0.13.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| x11rb-protocol                   | 0.13.2                         | MIT OR Apache-2.0                                   | crates.io                              |
| xattr                            | 1.6.1                          | MIT OR Apache-2.0                                   | crates.io                              |
| xkbcommon                        | 0.9.0                          | MIT                                                 | crates.io                              |
| xkeysym                          | 0.2.1                          | MIT OR Apache-2.0 OR Zlib                           | crates.io                              |
| yoke                             | 0.8.1                          | Unicode-3.0                                         | crates.io                              |
| yoke-derive                      | 0.8.1                          | Unicode-3.0                                         | crates.io                              |
| zbus                             | 5.13.2                         | MIT                                                 | crates.io                              |
| zbus_macros                      | 5.13.2                         | MIT                                                 | crates.io                              |
| zbus_names                       | 4.3.1                          | MIT                                                 | crates.io                              |
| zerocopy                         | 0.8.39                         | BSD-2-Clause OR Apache-2.0 OR MIT                   | crates.io                              |
| zerocopy-derive                  | 0.8.39                         | BSD-2-Clause OR Apache-2.0 OR MIT                   | crates.io                              |
| zerofrom                         | 0.1.6                          | Unicode-3.0                                         | crates.io                              |
| zerofrom-derive                  | 0.1.6                          | Unicode-3.0                                         | crates.io                              |
| zeroize                          | 1.8.2                          | Apache-2.0 OR MIT                                   | crates.io                              |
| zerotrie                         | 0.2.3                          | Unicode-3.0                                         | crates.io                              |
| zerovec                          | 0.11.5                         | Unicode-3.0                                         | crates.io                              |
| zerovec-derive                   | 0.11.2                         | Unicode-3.0                                         | crates.io                              |
| zip                              | 4.6.1                          | MIT                                                 | crates.io                              |
| zmij                             | 1.0.21                         | MIT                                                 | crates.io                              |
| zune-core                        | 0.4.12                         | MIT OR Apache-2.0 OR Zlib                           | crates.io                              |
| zune-jpeg                        | 0.4.21                         | MIT OR Apache-2.0 OR Zlib                           | crates.io                              |
| zvariant                         | 5.9.2                          | MIT                                                 | crates.io                              |
| zvariant_derive                  | 5.9.2                          | MIT                                                 | crates.io                              |
| zvariant_utils                   | 3.3.0                          | MIT                                                 | crates.io                              |
