use super::{voice, TtsVoice};

// Editable starting values only, never a voice allowlist. Existing profiles
// retain their saved voices. No documentation is fetched at runtime.
// https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list
// https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
pub(super) fn default_voices(id: &str, websocket: bool) -> Vec<TtsVoice> {
    if id.starts_with("qwen3-tts-flash") || id.starts_with("qwen3-tts-instruct-flash") {
        return qwen3_voices(id.contains("-instruct-"));
    }
    let entries: &[(&str, &str)] = match id {
        "qwen-audio-3.1-tts-plus" => &[
            ("longanlingxin_v3.1", "龙安灵心_v3.1"),
            ("xunanchuan_v3.1", "许南川"),
            ("longanhuan_v3.1", "龙安欢_v3.1"),
            ("longanfengyue_v3.1", "龙安风悦_v3.1"),
        ],
        "qwen-audio-3.1-tts-flash" => &[
            ("longanhuan_v3.1", "龙安欢_v3.1"),
            ("longanlingxin_v3.1", "龙安灵心_v3.1"),
            ("longanfengyue_v3.1", "龙安风悦_v3.1"),
            ("xunanchuan_v3.1", "许南川"),
            ("yuxiaoyun_v3.1", "于小云"),
            ("qiaoxiaojiao_v3.1", "乔小娇"),
            ("xiaxiaochen_v3.1", "夏小晨"),
            ("anmingyuan_v3.1", "安明远"),
            ("wenhuaiqing_v3.1", "温怀清"),
            ("anxiaolan_v3.1", "安小岚"),
            ("xieshurou_v3.1", "谢舒柔"),
            ("baiqinglan_v3.1", "白清岚"),
            ("xuyuyuan_v3.1", "许玉远"),
            ("anruorou_v3.1", "安若柔"),
            ("wenhuaizhi_v3.1", "闻怀之"),
            ("xiaoxingzhi_v3.1", "萧行之"),
            ("guyunshu_v3.1", "顾云舒"),
            ("huozhuoshi_v3.1", "霍拙石"),
            ("yeqinghe_v3.1", "叶清禾"),
            ("yunhuanhuan_v3.1", "云欢欢"),
            ("xuxiaoqiao_v3.1", "徐小俏"),
            ("baianran_v3.1", "白安然"),
            ("xuyanchu_v3.1", "许言初"),
            ("yezhiqing_v3.1", "叶知晴"),
            ("andi_v3.1", "安迪"),
            ("anyuqing_v3.1", "安语晴"),
            ("Emily_v3.1", "Emily"),
            ("Luna_v3.1", "Luna"),
            ("Eric_v3.1", "Eric"),
            ("Luca_v3.1", "Luca"),
            ("Abby_v3.1", "Abby"),
            ("Annie_v3.1", "Annie"),
            ("Ava_v3.1", "Ava"),
            ("Beth_v3.1", "Beth"),
            ("Betty_v3.1", "Betty"),
            ("Cally_v3.1", "Cally"),
            ("Cindy_v3.1", "Cindy"),
            ("Donna_v3.1", "Donna"),
            ("Andy_v3.1", "Andy"),
            ("Brian_v3.1", "Brian"),
            ("David_v3.1", "David"),
            ("longanyuanfei_v3.1", "龙安元妃_v3.1"),
            ("longjielidou_v3.1", "龙杰力豆_v3.1"),
            ("longanlingxi_v3.1", "龙安灵希_v3.1"),
            ("longhuohuo_v3.1", "龙火火_v3.1"),
            ("longyingtao_v3.1", "龙应桃_v3.1"),
            ("longanya_v3.1", "龙安雅_v3.1"),
            ("longwan_v3.1", "龙婉_v3.1"),
            ("longxing_v3.1", "龙星_v3.1"),
            ("longhua_v3.1", "龙华_v3.1"),
            ("longhan_v3.1", "龙寒_v3.1"),
            ("longanzhi_v3.1", "龙安智_v3.1"),
            ("longzhe_v3.1", "龙哲_v3.1"),
            ("longanyang_v3.1", "龙安洋_v3.1"),
            ("libai_v3.1", "李白_v3.1"),
            ("longling_v3.1", "龙铃_v3.1"),
            ("longniuniu_v3.1", "龙牛牛_v3.1"),
            ("longshanshan_v3.1", "龙闪闪_v3.1"),
            ("longpaopao_v3.1", "龙泡泡_v3.1"),
            ("loongstella_v3.1", "loongstella_v3.1"),
            ("longyuan_v3.1", "龙媛_v3.1"),
            ("longmiao_v3.1", "龙妙_v3.1"),
            ("longsanshu_v3.1", "龙三叔_v3.1"),
            ("longanli_v3.1", "龙安莉_v3.1"),
            ("longanwen_v3.1", "龙安温_v3.1"),
            ("longanlang_v3.1", "龙安朗_v3.1"),
            ("longxiaoxia_v3.1", "龙小夏_v3.1"),
            ("longanchong_v3.1", "龙安冲_v3.1"),
        ],
        "qwen-audio-3.0-tts-plus" => &[("longanlingxin", "龙安灵心"), ("longanlufeng", "龙安鲁风")],
        "qwen-audio-3.0-tts-flash" => &[
            ("longanfengyue", "龙安风悦"),
            ("longanyuanfei", "龙安元妃"),
            ("longanlingxi", "龙安灵希"),
            ("longanxiaoxin", "龙安小昕"),
            ("longanhuan_v3.6", "龙安欢"),
            ("longjielidou_v3.6", "龙杰力豆"),
            ("longpaopao_v3.6", "龙泡泡"),
            ("longhuohuo_v3.6", "龙火火"),
            ("longchuanshu_v3.6", "龙川叔"),
            ("loongmary", "loongmary"),
            ("loongeva_v3.6", "loongeva"),
            ("loongjohn", "loongJohn"),
        ],
        _ => &[],
    };
    let mut voices: Vec<_> = entries
        .iter()
        .map(|(id, name)| voice(id, name, "mul"))
        .collect();
    if websocket && id == "qwen-audio-3.0-tts-plus" {
        voices.insert(0, voice("longanhuan_v3.6", "龙安欢", "mul"));
    }
    voices
}

fn qwen3_voices(instruct: bool) -> Vec<TtsVoice> {
    let instruct_voices = [
        ("Cherry", "芊悦"),
        ("Serena", "苏瑶"),
        ("Ethan", "晨煦"),
        ("Chelsie", "千雪"),
        ("Momo", "茉兔"),
        ("Vivian", "十三"),
        ("Moon", "月白"),
        ("Maia", "四月"),
        ("Kai", "凯"),
        ("Nofish", "不吃鱼"),
        ("Bella", "萌宝"),
        ("Eldric Sage", "沧明子"),
        ("Mia", "乖小妹"),
        ("Mochi", "沙小弥"),
        ("Bellona", "燕铮莺"),
        ("Vincent", "田叔"),
        ("Bunny", "萌小姬"),
        ("Neil", "阿闻"),
        ("Elias", "墨讲师"),
        ("Arthur", "徐大爷"),
        ("Nini", "邻家妹妹"),
        ("Seren", "小婉"),
        ("Pip", "顽屁小孩"),
        ("Stella", "少女阿月"),
    ]
    .into_iter()
    .map(|(id, name)| voice(id, name, "mul"))
    .collect::<Vec<_>>();
    let mut flash_voices = instruct_voices.clone();
    flash_voices.extend(
        [
            ("Jennifer", "詹妮弗"),
            ("Ryan", "甜茶"),
            ("Katerina", "卡捷琳娜"),
            ("Aiden", "艾登"),
            ("Bodega", "博德加"),
            ("Sonrisa", "索尼莎"),
            ("Alek", "阿列克"),
            ("Dolce", "多尔切"),
            ("Sohee", "素熙"),
            ("Ono Anna", "小野杏"),
            ("Lenn", "莱恩"),
            ("Emilien", "埃米尔安"),
            ("Andre", "安德雷"),
            ("Radio Gol", "拉迪奥·戈尔"),
            ("Jada", "上海-阿珍"),
            ("Dylan", "北京-晓东"),
            ("Li", "南京-老李"),
            ("Marcus", "陕西-秦川"),
            ("Roy", "闽南-阿杰"),
            ("Peter", "天津-李彼得"),
            ("Sunny", "四川-晴儿"),
            ("Eric", "四川-程川"),
            ("Rocky", "粤语-阿强"),
            ("Kiki", "粤语-阿清"),
        ]
        .into_iter()
        .map(|(id, name)| voice(id, name, "mul")),
    );
    if instruct {
        instruct_voices
    } else {
        flash_voices
    }
}
