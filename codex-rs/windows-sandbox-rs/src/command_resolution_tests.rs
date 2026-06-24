use super::app_execution_alias_path;
use super::batch_user_path;
use super::resolve_windows_command;
use pretty_assertions::assert_eq;
use std::collections::HashMap;
use std::fs;
use tempfile::TempDir;
use windows_sys::Win32::System::SystemServices::IO_REPARSE_TAG_APPEXECLINK;

fn copy_test_executable(path: &std::path::Path) {
    fs::copy(std::env::current_exe().expect("test executable"), path)
        .expect("copy executable fixture");
}

#[test]
fn bare_names_search_child_cwd_before_path_and_ignore_extensionless_files() {
    let tempdir = TempDir::new().expect("tempdir");
    fs::write(tempdir.path().join("tool"), []).expect("write decoy fixture");
    fs::write(tempdir.path().join("tool.txt.exe"), []).expect("write extension decoy");
    let expected = tempdir.path().join("tool.EXE");
    copy_test_executable(&expected);
    let bin = tempdir.path().join("bin");
    fs::create_dir(&bin).expect("create PATH directory");
    copy_test_executable(&bin.join("tool.EXE"));
    let env_map = HashMap::from([("PATH".to_string(), bin.display().to_string())]);

    let resolved = resolve_windows_command(&["tool".to_string()], tempdir.path(), &env_map)
        .expect("resolve executable suffix");

    assert_eq!(resolved.application_path, expected);
    assert_eq!(
        String::from_utf16(&resolved.command_line).expect("native command line UTF-16"),
        "tool"
    );
}

#[test]
fn bare_names_do_not_fall_back_to_the_parent_path() {
    let tempdir = TempDir::new().expect("tempdir");
    let empty_bin = tempdir.path().join("empty-bin");
    fs::create_dir(&empty_bin).expect("create isolated PATH directory");
    let env_map = HashMap::from([("PATH".to_string(), empty_bin.display().to_string())]);

    let result = resolve_windows_command(&["cmd".to_string()], tempdir.path(), &env_map);

    assert!(result.is_err());
}

#[test]
fn native_candidates_must_be_windows_binaries() {
    let tempdir = TempDir::new().expect("tempdir");
    let fake_executable = tempdir.path().join("fake.exe");
    fs::write(&fake_executable, "not a PE image").expect("write fake executable");

    let result = resolve_windows_command(
        &[fake_executable.display().to_string()],
        tempdir.path(),
        &HashMap::new(),
    );

    assert!(result.is_err());
}

#[test]
fn explicit_paths_can_name_extensionless_windows_binaries() {
    let tempdir = TempDir::new().expect("tempdir");
    let executable = tempdir.path().join("runner");
    copy_test_executable(&executable);

    let resolved = resolve_windows_command(
        &[executable.display().to_string()],
        tempdir.path(),
        &HashMap::new(),
    )
    .expect("resolve extensionless explicit executable");

    assert_eq!(resolved.application_path, executable);
}

#[test]
fn native_launches_preserve_the_requested_lexical_path() {
    let tempdir = TempDir::new().expect("tempdir");
    let bin = tempdir.path().join("bin");
    fs::create_dir(&bin).expect("create bin directory");
    let executable = tempdir.path().join("runner.exe");
    copy_test_executable(&executable);
    let lexical = bin.join("..").join("runner.exe");

    let resolved = resolve_windows_command(
        &[lexical.display().to_string()],
        tempdir.path(),
        &HashMap::new(),
    )
    .expect("resolve lexical native executable");

    assert_eq!(resolved.application_path, lexical);
}

#[test]
fn ordinary_windows_apps_files_do_not_bypass_binary_validation() {
    let tempdir = TempDir::new().expect("tempdir");
    let windows_apps = tempdir
        .path()
        .join("AppData")
        .join("Local")
        .join("Microsoft")
        .join("WindowsApps");
    fs::create_dir(&windows_apps).expect("create WindowsApps fixture directory");
    let alias = windows_apps.join("tool.exe");
    fs::write(&alias, []).expect("write alias fixture");

    let result = resolve_windows_command(
        &[alias.display().to_string()],
        tempdir.path(),
        &HashMap::new(),
    );

    assert!(result.is_err());
}

#[test]
fn app_execution_aliases_require_the_real_directory_and_reparse_tag() {
    let local_app_data = std::path::Path::new(r"C:\Users\me\AppData\Local");
    let alias = local_app_data.join(r"Microsoft\WindowsApps\tool.exe");

    assert!(app_execution_alias_path(
        &alias,
        local_app_data,
        Some(IO_REPARSE_TAG_APPEXECLINK),
    ));
    assert!(!app_execution_alias_path(
        &alias,
        local_app_data,
        Some(0xA000_000C),
    ));
    assert!(!app_execution_alias_path(
        std::path::Path::new(r"C:\workspace\AppData\Local\Microsoft\WindowsApps\tool.exe"),
        local_app_data,
        Some(IO_REPARSE_TAG_APPEXECLINK),
    ));
}

#[test]
fn verbatim_unc_batch_paths_are_converted_for_cmd() {
    let path = std::path::Path::new(r"\\?\UNC\server\share\tool.cmd");

    assert_eq!(
        batch_user_path(path).expect("convert verbatim UNC batch path"),
        std::path::PathBuf::from(r"\\server\share\tool.cmd")
    );
}

#[test]
fn batch_candidates_win_in_pathext_order_and_use_cmd_escaping() {
    let tempdir = TempDir::new().expect("tempdir");
    let bin = tempdir.path().join("bin");
    fs::create_dir_all(&bin).expect("create batch PATH directory");
    let script = bin.join("tool.CMD");
    fs::write(&script, "@echo off\r\nexit /b 0\r\n").expect("write batch fixture");
    copy_test_executable(&bin.join("tool.EXE"));
    let env_map = HashMap::from([
        ("PATH".to_string(), bin.display().to_string()),
        ("PATHEXT".to_string(), ".CMD;.EXE".to_string()),
    ]);
    let command = vec![
        "tool".to_string(),
        "space 100%&".to_string(),
        "say\"hi".to_string(),
    ];

    let resolved =
        resolve_windows_command(&command, tempdir.path(), &env_map).expect("resolve batch command");

    assert_eq!(
        String::from_utf16(&resolved.command_line).expect("batch command line UTF-16"),
        format!(
            "cmd.exe /e:ON /v:OFF /d /c \"\"{}\" \"space 100%%cd:~,%%&\" \"say\"\"hi\"\"",
            script.display()
        )
    );

    let lexical_script = bin.join("..").join("bin").join("tool.CMD");
    let lexical = resolve_windows_command(
        &[lexical_script.display().to_string()],
        tempdir.path(),
        &HashMap::new(),
    )
    .expect("resolve lexical batch path");
    assert!(
        String::from_utf16(&lexical.command_line)
            .expect("lexical batch command line UTF-16")
            .contains(lexical_script.to_string_lossy().as_ref())
    );

    let nul_result = resolve_windows_command(
        &["tool".to_string(), "before\0after".to_string()],
        tempdir.path(),
        &env_map,
    );
    assert!(nul_result.is_err());

    let verbatim_script = format!(r"\\?\{}", script.display());
    let mut verbatim_command = command;
    verbatim_command[0] = verbatim_script;
    let verbatim = resolve_windows_command(&verbatim_command, tempdir.path(), &HashMap::new())
        .expect("resolve a representable verbatim batch path");
    assert_eq!(verbatim.command_line, resolved.command_line);
}
