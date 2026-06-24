use crate::windows_binary::is_windows_binary;
use crate::winutil::argv_to_command_line;
use crate::winutil::to_wide;
use anyhow::Context;
use anyhow::Result;
use anyhow::anyhow;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::ffi::OsString;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::ffi::OsStringExt;
use std::path::Path;
use std::path::PathBuf;
use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::Storage::FileSystem::CreateFileW;
use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS;
use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_DELETE;
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ;
use windows_sys::Win32::Storage::FileSystem::FILE_SHARE_WRITE;
use windows_sys::Win32::Storage::FileSystem::GetFullPathNameW;
use windows_sys::Win32::Storage::FileSystem::MAXIMUM_REPARSE_DATA_BUFFER_SIZE;
use windows_sys::Win32::Storage::FileSystem::OPEN_EXISTING;
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW;
use windows_sys::Win32::System::SystemServices::IO_REPARSE_TAG_APPEXECLINK;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[doc(hidden)]
pub struct WindowsProcessLaunch {
    pub(crate) application_path: PathBuf,
    pub(crate) command_line: Vec<u16>,
    pub(crate) required_read_files: Vec<PathBuf>,
}

/// Resolves a Windows command using its child environment and working directory.
pub(crate) fn resolve_windows_command(
    command: &[String],
    cwd: &Path,
    env_map: &HashMap<String, String>,
) -> Result<WindowsProcessLaunch> {
    validate_windows_env_keys(env_map)?;
    if command.iter().any(|arg| arg.contains('\0')) {
        return Err(anyhow!("Windows command arguments may not contain NUL"));
    }
    let program = command
        .first()
        .ok_or_else(|| anyhow!("cannot resolve an empty Windows command"))?;
    if program.is_empty() {
        return Err(anyhow!("cannot resolve an empty Windows executable"));
    }
    if !cwd.is_absolute() {
        return Err(anyhow!("Windows executable cwd must be absolute"));
    }

    let program_path = Path::new(program);
    if is_drive_relative(program_path) {
        return Err(anyhow!(
            "drive-relative Windows executable paths are not supported"
        ));
    }
    let has_path = program_path.is_absolute()
        || program.contains(['\\', '/'])
        || program_path.components().count() > 1;
    let search_dirs = if has_path {
        Vec::new()
    } else {
        windows_search_dirs(cwd, env_map)
    };
    let path_extensions = windows_env_value(env_map, "PATHEXT")
        .unwrap_or(".COM;.EXE;.BAT;.CMD")
        .split(';')
        .map(str::trim)
        .filter(|extension| extension.starts_with('.') && extension.len() > 1)
        .collect::<Vec<_>>();
    let has_extension = program_path.extension().is_some();

    let candidates = if has_path {
        vec![if program_path.is_absolute() {
            program_path.to_path_buf()
        } else {
            cwd.join(program_path)
        }]
    } else {
        search_dirs
            .into_iter()
            .map(|dir| dir.join(program_path))
            .collect()
    };
    for candidate in candidates {
        if !candidate.is_absolute() {
            continue;
        }
        if has_extension && let Some(candidate) = existing_candidate_path(&candidate)? {
            return resolved_windows_command(command, candidate);
        }
        if !has_extension {
            for extension in &path_extensions {
                let mut candidate = candidate.clone().into_os_string();
                candidate.push(extension);
                let candidate = PathBuf::from(candidate);
                if let Some(candidate) = existing_candidate_path(&candidate)? {
                    return resolved_windows_command(command, candidate);
                }
            }
            if has_path && let Some(candidate) = existing_candidate_path(&candidate)? {
                return resolved_windows_command(command, candidate);
            }
        }
    }

    Err(anyhow!(
        "Windows executable `{program}` was not found using the child PATH and PATHEXT"
    ))
}

fn resolved_windows_command(
    command: &[String],
    lexical_path: PathBuf,
) -> Result<WindowsProcessLaunch> {
    let is_batch = lexical_path
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("bat") || extension.eq_ignore_ascii_case("cmd")
        });
    let windows_apps_alias = is_windows_apps_alias(&lexical_path);
    let canonical_path = if windows_apps_alias || is_batch {
        None
    } else {
        Some(dunce::canonicalize(&lexical_path).with_context(|| {
            format!("canonicalize Windows executable {}", lexical_path.display())
        })?)
    };
    if !is_batch && !windows_apps_alias && !canonical_path.as_deref().is_some_and(is_windows_binary)
    {
        return Err(anyhow!(
            "Windows executable `{}` is not a valid Windows binary",
            lexical_path.display()
        ));
    }
    let (application_path, command_line, required_read_files) = if is_batch {
        let command_prompt = command_prompt_path()?;
        (
            command_prompt.clone(),
            make_batch_command_line(&lexical_path, &command[1..])?,
            vec![command_prompt, lexical_path],
        )
    } else {
        (
            lexical_path.clone(),
            argv_to_command_line(command).encode_utf16().collect(),
            vec![lexical_path],
        )
    };
    Ok(WindowsProcessLaunch {
        application_path,
        command_line,
        required_read_files,
    })
}

fn windows_search_dirs(cwd: &Path, env_map: &HashMap<String, String>) -> Vec<PathBuf> {
    std::iter::once(cwd.to_path_buf())
        .chain(
            windows_env_value(env_map, "PATH")
                .into_iter()
                .flat_map(std::env::split_paths)
                .filter(|dir| !dir.as_os_str().is_empty() && !is_drive_relative(dir))
                .map(|dir| {
                    if dir.is_absolute() {
                        dir
                    } else {
                        cwd.join(dir)
                    }
                }),
        )
        .collect()
}

fn command_prompt_path() -> Result<PathBuf> {
    let mut system_directory = vec![0u16; 260];
    loop {
        let len = unsafe {
            GetSystemDirectoryW(
                system_directory.as_mut_ptr(),
                u32::try_from(system_directory.len()).unwrap_or(u32::MAX),
            )
        } as usize;
        if len == 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        if len < system_directory.len() {
            system_directory.truncate(len);
            return Ok(PathBuf::from(OsString::from_wide(&system_directory)).join("cmd.exe"));
        }
        system_directory.resize(len + 1, 0);
    }
}

fn existing_candidate_path(path: &Path) -> Result<Option<PathBuf>> {
    if is_windows_apps_alias(path) {
        return Ok(Some(path.to_path_buf()));
    }
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            match std::fs::symlink_metadata(path) {
                Ok(_) => {
                    return Err(err)
                        .with_context(|| format!("resolve Windows executable {}", path.display()));
                }
                Err(link_err) if link_err.kind() == std::io::ErrorKind::NotFound => {
                    return Ok(None);
                }
                Err(link_err) => {
                    return Err(link_err)
                        .with_context(|| format!("inspect Windows executable {}", path.display()));
                }
            }
        }
        Err(err) => {
            return Err(err)
                .with_context(|| format!("inspect Windows executable {}", path.display()));
        }
    };
    if metadata.file_type().is_dir() {
        return Ok(None);
    }
    Ok(Some(path.to_path_buf()))
}

fn is_windows_apps_alias(path: &Path) -> bool {
    let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") else {
        return false;
    };
    app_execution_alias_path(path, Path::new(&local_app_data), reparse_tag(path))
}

fn app_execution_alias_path(path: &Path, local_app_data: &Path, tag: Option<u32>) -> bool {
    let root = local_app_data.join("Microsoft").join("WindowsApps");
    let path = windows_path_key(path);
    let root = windows_path_key(&root);
    path.starts_with(&format!("{}/", root.trim_end_matches('/')))
        && tag == Some(IO_REPARSE_TAG_APPEXECLINK)
}

fn windows_path_key(path: &Path) -> String {
    dunce::simplified(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn reparse_tag(path: &Path) -> Option<u32> {
    const FSCTL_GET_REPARSE_POINT: u32 = 589_992;
    let path = to_wide(path);
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }
    let mut buffer = vec![0u8; MAXIMUM_REPARSE_DATA_BUFFER_SIZE as usize];
    let mut bytes_returned = 0;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            FSCTL_GET_REPARSE_POINT,
            std::ptr::null(),
            0,
            buffer.as_mut_ptr().cast(),
            MAXIMUM_REPARSE_DATA_BUFFER_SIZE,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 || bytes_returned < std::mem::size_of::<u32>() as u32 {
        return None;
    }
    Some(u32::from_le_bytes(buffer[..4].try_into().ok()?))
}

fn make_batch_command_line(script: &Path, args: &[String]) -> Result<Vec<u16>> {
    let script = batch_user_path(script)?;
    let mut command_line = "cmd.exe /e:ON /v:OFF /d /c \""
        .encode_utf16()
        .collect::<Vec<_>>();
    command_line.push(b'"' as u16);
    let script = script.as_os_str().encode_wide().collect::<Vec<_>>();
    if script.contains(&(b'"' as u16)) || script.last() == Some(&(b'\\' as u16)) {
        return Err(anyhow!(
            "Windows batch file paths may not contain `\"` or end with `\\`"
        ));
    }
    for character in script {
        if character == b'%' as u16 {
            command_line.extend("%%cd:~,".encode_utf16());
        }
        command_line.push(character);
    }
    command_line.push(b'"' as u16);
    for arg in args {
        command_line.push(b' ' as u16);
        append_batch_arg(&mut command_line, arg)?;
    }
    command_line.push(b'"' as u16);
    Ok(command_line)
}

fn batch_user_path(path: &Path) -> Result<PathBuf> {
    let path = dunce::simplified(path);
    let wide = path.as_os_str().encode_wide().collect::<Vec<_>>();
    const VERBATIM_PREFIX: [u16; 4] = [b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16];
    const VERBATIM_UNC_PREFIX: [u16; 8] = [
        b'\\' as u16,
        b'\\' as u16,
        b'?' as u16,
        b'\\' as u16,
        b'U' as u16,
        b'N' as u16,
        b'C' as u16,
        b'\\' as u16,
    ];
    if wide.starts_with(&VERBATIM_UNC_PREFIX) && wide.len() < 260 {
        let user_path = VERBATIM_PREFIX[..2]
            .iter()
            .copied()
            .chain(wide[VERBATIM_UNC_PREFIX.len()..].iter().copied())
            .collect::<Vec<_>>();
        let user_path = PathBuf::from(OsString::from_wide(&user_path));
        if full_path_name(&user_path)? != user_path {
            return Err(anyhow!(
                "Windows verbatim UNC batch file path changes under Win32 normalization"
            ));
        }
        return Ok(user_path);
    }
    if wide.starts_with(&VERBATIM_PREFIX) {
        return Err(anyhow!(
            "Windows batch file path cannot be represented for cmd.exe"
        ));
    }
    Ok(path.to_path_buf())
}

fn append_batch_arg(command_line: &mut Vec<u16>, arg: &str) -> Result<()> {
    if arg.contains('\r') || arg.contains('\n') {
        return Err(anyhow!(
            "Windows batch file arguments may not contain newlines"
        ));
    }
    let mut quote = arg.is_empty() || arg.ends_with('\\');
    for character in arg.chars() {
        const UNQUOTED: &str = r"#$*+-./:?@\_";
        let ascii_needs_quotes = character.is_ascii()
            && !(character.is_ascii_alphanumeric() || UNQUOTED.contains(character));
        if ascii_needs_quotes || character.is_control() {
            quote = true;
        }
    }
    if quote {
        command_line.push(b'"' as u16);
    }
    let mut backslashes = 0;
    for character in arg.encode_utf16() {
        if character == b'\\' as u16 {
            backslashes += 1;
        } else {
            if character == b'"' as u16 {
                command_line.extend(std::iter::repeat_n(b'\\' as u16, backslashes));
                command_line.push(b'"' as u16);
            } else if character == b'%' as u16 {
                command_line.extend("%%cd:~,".encode_utf16());
            }
            backslashes = 0;
        }
        command_line.push(character);
    }
    if quote {
        command_line.extend(std::iter::repeat_n(b'\\' as u16, backslashes));
        command_line.push(b'"' as u16);
    }
    Ok(())
}

fn full_path_name(path: &Path) -> Result<PathBuf> {
    let path_wide = to_wide(path);
    let mut buffer = vec![0u16; 260];
    loop {
        let len = unsafe {
            GetFullPathNameW(
                path_wide.as_ptr(),
                u32::try_from(buffer.len()).unwrap_or(u32::MAX),
                buffer.as_mut_ptr(),
                std::ptr::null_mut(),
            )
        } as usize;
        if len == 0 {
            return Err(std::io::Error::last_os_error()).context(format!(
                "normalize Windows batch file path {}",
                path.display()
            ));
        }
        if len < buffer.len() {
            buffer.truncate(len);
            return Ok(PathBuf::from(OsString::from_wide(&buffer)));
        }
        buffer.resize(len + 1, 0);
    }
}

fn is_drive_relative(path: &Path) -> bool {
    !path.has_root()
        && matches!(
            path.components().next(),
            Some(std::path::Component::Prefix(prefix))
                if matches!(prefix.kind(), std::path::Prefix::Disk(_))
        )
}

fn windows_env_value<'a>(env_map: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    env_map
        .get(key)
        .or_else(|| {
            env_map
                .iter()
                .find(|(existing, _)| existing.eq_ignore_ascii_case(key))
                .map(|(_, value)| value)
        })
        .map(String::as_str)
}

fn validate_windows_env_keys(env_map: &HashMap<String, String>) -> Result<()> {
    let mut keys = env_map.keys().collect::<Vec<_>>();
    keys.sort_by(|a, b| {
        a.to_ascii_uppercase()
            .cmp(&b.to_ascii_uppercase())
            .then(a.cmp(b))
    });
    for pair in keys.windows(2) {
        if pair[0].eq_ignore_ascii_case(pair[1]) {
            return Err(anyhow!(
                "Windows environment contains case-insensitive duplicate keys `{}` and `{}`",
                pair[0],
                pair[1]
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "command_resolution_tests.rs"]
mod tests;
