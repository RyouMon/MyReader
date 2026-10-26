use super::{voice, TtsVoice};

// Editable starting values only, never a voice allowlist. Existing profiles
// retain their saved voices. No documentation is fetched at runtime.
// https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list
// https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
pub(super) fn default_voices(id: &str, websocket: bool) -> Vec<TtsVoice> {
    if id.starts_with("qwen3-tts-flash") || id.starts_with("qwen3-tts-instruct-flash") {
        return qwen3_voices(id.contains("-instruct-"));
    }
    let entries: &[&str] = match id {
        "qwen-audio-3.1-tts-plus" => &[
            "longanlingxin_v3.1",
            "xunanchuan_v3.1",
            "longanhuan_v3.1",
            "longanfengyue_v3.1",
        ],
        "qwen-audio-3.1-tts-flash" => &[
            "longanhuan_v3.1",
            "longanlingxin_v3.1",
            "longanfengyue_v3.1",
            "xunanchuan_v3.1",
            "yuxiaoyun_v3.1",
            "qiaoxiaojiao_v3.1",
            "xiaxiaochen_v3.1",
            "anmingyuan_v3.1",
            "wenhuaiqing_v3.1",
            "anxiaolan_v3.1",
            "xieshurou_v3.1",
            "baiqinglan_v3.1",
            "xuyuyuan_v3.1",
            "anruorou_v3.1",
            "wenhuaizhi_v3.1",
            "xiaoxingzhi_v3.1",
            "guyunshu_v3.1",
            "huozhuoshi_v3.1",
            "yeqinghe_v3.1",
            "yunhuanhuan_v3.1",
            "xuxiaoqiao_v3.1",
            "baianran_v3.1",
            "xuyanchu_v3.1",
            "yezhiqing_v3.1",
            "andi_v3.1",
            "anyuqing_v3.1",
            "Emily_v3.1",
            "Luna_v3.1",
            "Eric_v3.1",
            "Luca_v3.1",
            "Abby_v3.1",
            "Annie_v3.1",
            "Ava_v3.1",
            "Beth_v3.1",
            "Betty_v3.1",
            "Cally_v3.1",
            "Cindy_v3.1",
            "Donna_v3.1",
            "Andy_v3.1",
            "Brian_v3.1",
            "David_v3.1",
            "longanyuanfei_v3.1",
            "longjielidou_v3.1",
            "longanlingxi_v3.1",
            "longhuohuo_v3.1",
            "longyingtao_v3.1",
            "longanya_v3.1",
            "longwan_v3.1",
            "longxing_v3.1",
            "longhua_v3.1",
            "longhan_v3.1",
            "longanzhi_v3.1",
            "longzhe_v3.1",
            "longanyang_v3.1",
            "libai_v3.1",
            "longling_v3.1",
            "longniuniu_v3.1",
            "longshanshan_v3.1",
            "longpaopao_v3.1",
            "loongstella_v3.1",
            "longyuan_v3.1",
            "longmiao_v3.1",
            "longsanshu_v3.1",
            "longanli_v3.1",
            "longanwen_v3.1",
            "longanlang_v3.1",
            "longxiaoxia_v3.1",
            "longanchong_v3.1",
        ],
        "qwen-audio-3.0-tts-plus" => &["longanlingxin", "longanlufeng"],
        "qwen-audio-3.0-tts-flash" => &[
            "longanfengyue",
            "longanyuanfei",
            "longanlingxi",
            "longanxiaoxin",
            "longanhuan_v3.6",
            "longjielidou_v3.6",
            "longpaopao_v3.6",
            "longhuohuo_v3.6",
            "longchuanshu_v3.6",
            "loongmary",
            "loongeva_v3.6",
            "loongjohn",
        ],
        _ => &[],
    };
    let mut voices: Vec<_> = entries.iter().map(|id| voice(id, "mul")).collect();
    if websocket && id == "qwen-audio-3.0-tts-plus" {
        voices.insert(0, voice("longanhuan_v3.6", "mul"));
    }
    voices
}

fn qwen3_voices(instruct: bool) -> Vec<TtsVoice> {
    let instruct_voices = [
        "Cherry",
        "Serena",
        "Ethan",
        "Chelsie",
        "Momo",
        "Vivian",
        "Moon",
        "Maia",
        "Kai",
        "Nofish",
        "Bella",
        "Eldric Sage",
        "Mia",
        "Mochi",
        "Bellona",
        "Vincent",
        "Bunny",
        "Neil",
        "Elias",
        "Arthur",
        "Nini",
        "Seren",
        "Pip",
        "Stella",
    ]
    .into_iter()
    .map(|id| voice(id, "mul"))
    .collect::<Vec<_>>();
    let mut flash_voices = instruct_voices.clone();
    flash_voices.extend(
        [
            "Jennifer",
            "Ryan",
            "Katerina",
            "Aiden",
            "Bodega",
            "Sonrisa",
            "Alek",
            "Dolce",
            "Sohee",
            "Ono Anna",
            "Lenn",
            "Emilien",
            "Andre",
            "Radio Gol",
            "Jada",
            "Dylan",
            "Li",
            "Marcus",
            "Roy",
            "Peter",
            "Sunny",
            "Eric",
            "Rocky",
            "Kiki",
        ]
        .into_iter()
        .map(|id| voice(id, "mul")),
    );
    if instruct {
        instruct_voices
    } else {
        flash_voices
    }
}
