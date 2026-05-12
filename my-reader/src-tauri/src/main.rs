// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = my_reader_lib::run() {
        eprintln!("Application failed to start: {e}");
        std::process::exit(1);
    }
}
