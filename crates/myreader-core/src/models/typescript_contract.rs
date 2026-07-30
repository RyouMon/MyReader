use specta::{datatype::DataType, Type, Types};

pub struct ReaderAnnotationColor;

impl Type for ReaderAnnotationColor {
    fn definition(_types: &mut Types) -> DataType {
        DataType::Reference(specta_typescript::define("ReaderAnnotationColor"))
    }
}

pub struct ReaderAnnotationKind;

impl Type for ReaderAnnotationKind {
    fn definition(_types: &mut Types) -> DataType {
        DataType::Reference(specta_typescript::define("\"highlight\""))
    }
}

pub struct FileLocalState;

impl Type for FileLocalState {
    fn definition(_types: &mut Types) -> DataType {
        DataType::Reference(specta_typescript::define(
            "\"present\" | \"remote_only\" | \"local_only\" | \"dirty_push\"",
        ))
    }
}

pub struct ReaderLocator;

impl Type for ReaderLocator {
    fn definition(_types: &mut Types) -> DataType {
        DataType::Reference(specta_typescript::define("ReaderLocator"))
    }
}
