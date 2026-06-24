use super::DENY_STUB;
use super::ensure_denybin;
use crate::command_resolution::resolve_windows_command;
use pretty_assertions::assert_eq;
use std::collections::HashMap;
use std::fs;
use tempfile::TempDir;

#[test]
fn denybin_repairs_stale_stubs_and_resolves_as_batch() {
    let tempdir = TempDir::new().expect("tempdir");
    let stale = tempdir.path().join("ssh.cmd");
    fs::write(&stale, b"@echo off\\r\\nexit /b 1\\r\\n").expect("write stale deny stub");

    let denybin = ensure_denybin(&["ssh"], Some(tempdir.path())).expect("create denybin");

    for extension in ["bat", "cmd"] {
        assert_eq!(
            fs::read(denybin.join(format!("ssh.{extension}"))).expect("read deny stub"),
            DENY_STUB
        );
    }
    let env_map = HashMap::from([
        ("PATH".to_string(), denybin.display().to_string()),
        ("PATHEXT".to_string(), ".cmd;.bat".to_string()),
    ]);
    let launch = resolve_windows_command(&["ssh".to_string()], tempdir.path(), &env_map)
        .expect("resolve deny stub");

    assert_eq!(
        launch
            .application_path
            .file_name()
            .and_then(|name| name.to_str()),
        Some("cmd.exe")
    );
    assert!(
        String::from_utf16(&launch.command_line)
            .expect("deny stub command line UTF-16")
            .contains(stale.to_string_lossy().as_ref())
    );
}
