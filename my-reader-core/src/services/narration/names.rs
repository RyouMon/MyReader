use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;
use unicode_script::{Script, UnicodeScript};

static SIMPLIFIED: LazyLock<OpenCC> = LazyLock::new(|| {
    OpenCC::from_config(BuiltinConfig::T2s).expect("bundled traditional-to-simplified dictionary")
});

// Comparison only: never replace the character's displayed or saved name with this key.
pub(super) fn name_key(name: &str) -> String {
    let normalized: String = name
        .nfkc()
        .map(|character| match character {
            '・' | '‧' | '•' | '∙' => '·',
            character => character,
        })
        .collect();
    let mut compact = String::with_capacity(normalized.len());
    for part in normalized.split_whitespace() {
        let first = part
            .chars()
            .next()
            .expect("nonempty whitespace-delimited part");
        if let Some(last) = compact.chars().next_back() {
            let between_han = last.script() == Script::Han && first.script() == Script::Han;
            if !between_han && last != '·' && first != '·' {
                compact.push(' ');
            }
        }
        compact.push_str(part);
    }
    SIMPLIFIED.convert(&compact)
}

#[cfg(test)]
mod tests {
    use super::name_key;

    #[test]
    fn equivalent_scripts_and_formats_have_the_same_key() {
        for (left, right) in [
            ("陈默", "陳默"),
            ("藤宮周", "藤宫周"),
            ("椎名真晝", "椎名真昼"),
            ("　藤宮　 周　", "藤宫周"),
            ("Ａｌｉｃｅ　Ｓｍｉｔｈ", " Alice\u{a0}\t Smith "),
            ("玛丽  · 简", "瑪麗･簡"),
            ("玛丽・简", "玛丽‧简"),
            ("Mary•Jane", "Mary∙Jane"),
            ("Café", "Cafe\u{301}"),
            ("Ｊｅａｎ－Ｌｕｃ", "Jean-Luc"),
        ] {
            assert_eq!(name_key(left), name_key(right), "{left} / {right}");
        }
    }

    #[test]
    fn distinct_names_keep_meaningful_spaces_and_punctuation() {
        for (left, right) in [
            ("陈默", "老陈"),
            ("陈默", "陈末"),
            ("Ann A", "AnnA"),
            ("Jean-Luc", "JeanLuc"),
            ("O'Neil", "ONeil"),
            ("玛丽·简", "玛丽简"),
        ] {
            assert_ne!(name_key(left), name_key(right), "{left} / {right}");
        }
    }
}
