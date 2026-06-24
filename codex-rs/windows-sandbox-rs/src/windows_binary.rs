use crate::winutil::to_wide;
use std::io::Read;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;
use windows_sys::Win32::Storage::FileSystem::GetBinaryTypeW;
use windows_sys::Win32::System::WindowsProgramming::SCS_32BIT_BINARY;
use windows_sys::Win32::System::WindowsProgramming::SCS_64BIT_BINARY;

pub(crate) fn is_windows_binary(path: &Path) -> bool {
    let path_wide = to_wide(path);
    let mut binary_type = 0;
    if unsafe { GetBinaryTypeW(path_wide.as_ptr(), &mut binary_type) } == 0
        || !matches!(binary_type, SCS_32BIT_BINARY | SCS_64BIT_BINARY)
    {
        return false;
    }

    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut dos_header = [0u8; 64];
    if file.read_exact(&mut dos_header).is_err() || &dos_header[..2] != b"MZ" {
        return false;
    }
    let pe_offset = u32::from_le_bytes([
        dos_header[0x3c],
        dos_header[0x3d],
        dos_header[0x3e],
        dos_header[0x3f],
    ]);
    if file.seek(SeekFrom::Start(u64::from(pe_offset))).is_err() {
        return false;
    }
    let mut pe_header = [0u8; 26];
    if file.read_exact(&mut pe_header).is_err() || &pe_header[..4] != b"PE\0\0" {
        return false;
    }
    let optional_header_size = u16::from_le_bytes([pe_header[20], pe_header[21]]);
    let optional_header_magic = u16::from_le_bytes([pe_header[24], pe_header[25]]);
    optional_header_size >= 2
        && matches!(
            (binary_type, optional_header_magic),
            (SCS_32BIT_BINARY, 0x10b) | (SCS_64BIT_BINARY, 0x20b)
        )
}
