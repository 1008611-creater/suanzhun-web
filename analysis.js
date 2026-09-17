/* ============================================================
 *  analysis.js —— 命理分析层
 *  旺衰/用神、十神解读、大运流年评分、八宅命卦、姓名五格、合婚
 *  依赖 bazi.js（通过参数传入，或全局 BaZi）
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MingLi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WX = ['木', '火', '土', '金', '水'];
  var SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
  var KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克
  var BEI_SHENG = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' }; // 生我
  var BEI_KE = { 土: '木', 水: '土', 火: '水', 金: '火', 木: '金' }; // 克我
  var GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];

  /* ---------- 1. 旺衰 & 用神 ---------- */
  function wangShuai(p) {
    var dayWx = p.dayGanWx;
    var s = p.wx.score;
    var tong = s[dayWx] + s[BEI_SHENG[dayWx]]; // 比劫 + 印
    var yi = s[SHENG[dayWx]] + s[KE[dayWx]] + s[BEI_KE[dayWx]]; // 食伤 + 财 + 官杀
    var ratio = tong / (tong + yi);
    var strong;
    if (ratio >= 0.62) strong = '身强';
    else if (ratio >= 0.52) strong = '偏强';
    else if (ratio >= 0.44) strong = '中和偏弱';
    else strong = '身弱';

    var yong, ji, xi;
    if (ratio >= 0.52) {
      // 身强：喜克泄耗
      yong = [BEI_KE[dayWx], SHENG[dayWx], KE[dayWx]];
      ji = [dayWx, BEI_SHENG[dayWx]];
      xi = yong[0];
    } else {
      // 身弱：喜生扶
      yong = [BEI_SHENG[dayWx], dayWx];
      ji = [BEI_KE[dayWx], KE[dayWx], SHENG[dayWx]];
      xi = yong[0];
    }
    return {
      dayWx: dayWx,
      tong: round(tong),
      yi: round(yi),
      ratio: round(ratio, 3),
      strong: strong,
      yong: yong,
      xi: xi,
      ji: ji,
      score: { 木: round(s.木), 火: round(s.火), 土: round(s.土), 金: round(s.金), 水: round(s.水) },
      missing: WX.filter(function (w) {
        return s[w] < 0.35;
      }),
      most: WX.slice().sort(function (a, b) {
        return s[b] - s[a];
      })[0],
      least: WX.slice().sort(function (a, b) {
        return s[a] - s[b];
      })[0],
    };
  }

  /* ---------- 2. 十神解读 ---------- */
  var SS_MEAN = {
    比肩: '自我、同辈、竞争、独立。代表你本人的意志与执行力，也主兄弟朋友。',
    劫财: '同辈、合作、破耗、争夺。主朋友助力也主被人分利，理财需谨慎。',
    食神: '才华、口福、温和的输出与创造。主享受、子女、表达，是顺遂之才。',
    伤官: '才气外露、锋芒、不服管、创新。主聪明锐利，也主易冲撞规则与上级。',
    偏财: '流动之财、投资、人缘、父亲。主机会财、异性缘，善交际。',
    正财: '稳定收入、妻财、务实。主正职薪资、节俭持家、可靠。',
    七杀: '压力、魄力、竞争、权柄。主开创与风险并存，宜制化不宜过旺。',
    正官: '规矩、职位、名声、约束。主事业地位、责任感，也主婚姻（女命夫星）。',
    偏印: '偏门智慧、专业、孤僻、直觉。主技术研究、宗教玄学，也主思虑过多。',
    正印: '学识、长辈、庇荫、名誉。主学历文书、母亲、贵人。',
  };

  /* ---------- 3. 大运流年评分 ---------- */
  function wxOfGanZhi(gan, zhi) {
    var g = GAN_WX[gan];
    var z = {
      子: '水',
      丑: '土',
      寅: '木',
      卯: '木',
      辰: '土',
      巳: '火',
      午: '火',
      未: '土',
      申: '金',
      酉: '金',
      戌: '土',
      亥: '水',
    }[zhi];
    return { gan: g, zhi: z };
  }
  function scoreWX(wxList, ws) {
    var sc = 0;
    wxList.forEach(function (w) {
      if (ws.yong.indexOf(w) === 0)
        sc += 2; // 用神
      else if (ws.yong.indexOf(w) > 0) sc += 1.2; // 喜神
      if (ws.ji.indexOf(w) === 0)
        sc -= 2; // 忌神
      else if (ws.ji.indexOf(w) > 0) sc -= 1.2;
    });
    return sc;
  }
  function rateLuck(gan, zhi, ws) {
    var gz = wxOfGanZhi(gan, zhi);
    var sc = scoreWX([gz.gan], ws) * 0.45 + scoreWX([gz.zhi], ws) * 0.55;
    var label = sc >= 1.6 ? '大吉' : sc >= 0.7 ? '吉' : sc > -0.7 ? '平' : sc > -1.6 ? '偏凶' : '凶';
    return { score: round(sc, 2), label: label, gan: gz.gan, zhi: gz.zhi };
  }

  /* ---------- 4. 八宅命卦 ---------- */
  // 三元命卦：男 (11 - 数字和) 递减；女 (4 + 数字和) 递增；结果 1-9，5 男寄坤、女寄艮
  function mingGua(year, gender) {
    var digits = String(year).split('').map(Number);
    var s = digits.reduce(function (a, b) {
      return a + b;
    }, 0);
    while (s > 9)
      s = String(s)
        .split('')
        .map(Number)
        .reduce(function (a, b) {
          return a + b;
        }, 0);
    var n;
    if (gender === '男') {
      n = 11 - s;
      while (n > 9) n -= 9;
      if (n <= 0) n += 9;
      if (n === 5) n = 2; // 男五寄坤
    } else {
      n = 4 + s;
      while (n > 9) n -= 9;
      if (n === 5) n = 8; // 女五寄艮
    }
    var MAP = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 6: '乾', 7: '兑', 8: '艮', 9: '离' };
    var gua = MAP[n];
    var eastWest = { 坎: 1, 离: 1, 震: 1, 巽: 1 }[gua] ? '东四命' : '西四命';
    return { number: n, gua: gua, eastWest: eastWest, sum: s };
  }
  // 大游年歌：从本宫起，按后天八卦顺序 坎→艮→震→巽→离→坤→兑→乾 排列其余七宫
  var YOU_NIAN = {
    乾: ['六煞', '天医', '五鬼', '祸害', '绝命', '延年', '生气'],
    坎: ['五鬼', '天医', '生气', '延年', '绝命', '祸害', '六煞'],
    艮: ['六煞', '绝命', '祸害', '生气', '延年', '天医', '五鬼'],
    震: ['延年', '生气', '祸害', '绝命', '五鬼', '天医', '六煞'],
    巽: ['天医', '五鬼', '六煞', '祸害', '生气', '绝命', '延年'],
    离: ['六煞', '五鬼', '绝命', '延年', '祸害', '生气', '天医'],
    坤: ['天医', '延年', '绝命', '生气', '祸害', '五鬼', '六煞'],
    兑: ['生气', '祸害', '延年', '绝命', '六煞', '五鬼', '天医'],
  };
  var ORDER = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];
  var GUA_DIR = { 坎: '正北', 艮: '东北', 震: '正东', 巽: '东南', 离: '正南', 坤: '西南', 兑: '正西', 乾: '西北' };
  var GUA_DEG = {
    坎: '337.5–22.5°',
    艮: '22.5–67.5°',
    震: '67.5–112.5°',
    巽: '112.5–157.5°',
    离: '157.5–202.5°',
    坤: '202.5–247.5°',
    兑: '247.5–292.5°',
    乾: '292.5–337.5°',
  };
  var STAR_INFO = {
    生气: { ji: '大吉', wx: '贪狼木', mean: '旺丁旺财、生机勃发。宜作大门、卧室、书房、办公位。' },
    延年: { ji: '吉', wx: '武曲金', mean: '感情和睦、健康长寿、贵人相助。宜作卧室、主位。' },
    天医: { ji: '吉', wx: '巨门土', mean: '祛病消灾、得财得助。宜作卧室、厨房，身体弱者尤宜。' },
    伏位: { ji: '小吉', wx: '辅弼木', mean: '安稳平顺、守成有余。宜作卧室、神位。' },
    祸害: { ji: '凶', wx: '禄存土', mean: '口舌是非、小病小耗。不宜作大门、卧室。' },
    六煞: { ji: '凶', wx: '文曲水', mean: '感情纠葛、破财是非。不宜作卧室、厨房。' },
    五鬼: { ji: '大凶', wx: '廉贞火', mean: '火灾官非、疾病损财。切忌作大门、卧室、厨房。' },
    绝命: { ji: '大凶', wx: '破军金', mean: '伤灾重病、人财两失。切忌作大门、主卧。' },
  };
  function baZhai(gua) {
    var stars = YOU_NIAN[gua];
    var list = ORDER.filter(function (g) {
      return g !== gua;
    }).map(function (g, i) {
      return {
        gua: g,
        dir: GUA_DIR[g],
        deg: GUA_DEG[g],
        star: stars[i],
        ji: STAR_INFO[stars[i]].ji,
        mean: STAR_INFO[stars[i]].mean,
      };
    });
    list.push({
      gua: gua,
      dir: GUA_DIR[gua],
      deg: GUA_DEG[gua],
      star: '伏位',
      ji: STAR_INFO.伏位.ji,
      mean: STAR_INFO.伏位.mean,
    });
    var jiFang = list
      .filter(function (x) {
        return x.ji.indexOf('凶') < 0;
      })
      .sort(function (a, b) {
        return ['大吉', '吉', '小吉'].indexOf(a.ji) - ['大吉', '吉', '小吉'].indexOf(b.ji);
      });
    var xiongFang = list.filter(function (x) {
      return x.ji.indexOf('凶') >= 0;
    });
    return { gua: gua, list: list, jiFang: jiFang, xiongFang: xiongFang };
  }

  /* ---------- 5. 姓名五格（康熙笔画） ---------- */
  var BIHUA = {
    刘: 15,
    李: 7,
    王: 4,
    张: 11,
    陈: 16,
    杨: 13,
    赵: 14,
    黄: 12,
    周: 8,
    吴: 7,
    徐: 10,
    孙: 10,
    马: 10,
    朱: 6,
    胡: 11,
    郭: 15,
    林: 8,
    何: 7,
    高: 10,
    罗: 20,
    郑: 19,
    梁: 11,
    谢: 17,
    宋: 7,
    唐: 10,
    许: 11,
    韩: 17,
    冯: 12,
    邓: 19,
    曹: 11,
    彭: 12,
    曾: 12,
    萧: 18,
    田: 5,
    董: 15,
    袁: 10,
    潘: 16,
    于: 3,
    蒋: 17,
    蔡: 17,
    余: 7,
    杜: 7,
    叶: 15,
    程: 12,
    苏: 22,
    魏: 18,
    吕: 7,
    丁: 2,
    任: 6,
    沈: 8,
    姚: 9,
    卢: 16,
    姜: 9,
    崔: 11,
    钟: 17,
    谭: 19,
    陆: 16,
    汪: 8,
    范: 11,
    金: 8,
    石: 5,
    廖: 14,
    贾: 13,
    夏: 10,
    韦: 9,
    付: 5,
    方: 4,
    白: 5,
    邹: 17,
    孟: 8,
    熊: 14,
    秦: 10,
    邱: 12,
    江: 7,
    尹: 4,
    薛: 19,
    闫: 11,
    段: 9,
    雷: 13,
    侯: 9,
    龙: 16,
    史: 5,
    陶: 16,
    黎: 15,
    贺: 12,
    顾: 21,
    毛: 4,
    郝: 14,
    龚: 22,
    邵: 12,
    万: 15,
    钱: 16,
    严: 20,
    武: 8,
    戴: 18,
    莫: 13,
    孔: 4,
    向: 6,
    汤: 13,
    曙: 17,
    宾: 14,
    承: 8,
    洋: 10,
    可: 5,
    思: 9,
    雨: 8,
    明: 8,
    华: 14,
    建: 9,
    国: 11,
    文: 4,
    志: 7,
    强: 11,
    伟: 11,
    军: 9,
    平: 5,
    永: 5,
    海: 11,
    波: 9,
    涛: 18,
    峰: 10,
    磊: 15,
    超: 12,
    刚: 10,
    勇: 9,
    杰: 12,
    浩: 11,
    宇: 6,
    轩: 10,
    泽: 17,
    晨: 11,
    阳: 17,
    飞: 9,
    鹏: 19,
    翔: 12,
    天: 4,
    成: 7,
    功: 5,
    立: 5,
    业: 13,
    兴: 16,
    旺: 8,
    发: 12,
    财: 10,
    富: 12,
    贵: 12,
    荣: 14,
    昌: 8,
    盛: 12,
    隆: 17,
    泰: 9,
    安: 6,
    康: 11,
    宁: 14,
    和: 8,
    顺: 12,
    达: 16,
    通: 14,
    远: 17,
    博: 12,
    学: 16,
    书: 10,
    礼: 18,
    义: 13,
    仁: 4,
    德: 15,
    信: 9,
    忠: 8,
    孝: 7,
    廉: 13,
    智: 12,
    慧: 15,
    敏: 11,
    睿: 14,
    哲: 10,
    维: 14,
    新: 13,
    春: 9,
    秋: 9,
    冬: 5,
    雪: 11,
    云: 12,
    月: 4,
    星: 9,
    辰: 7,
    曦: 20,
    昕: 8,
    晗: 11,
    悦: 11,
    欣: 8,
    怡: 9,
    雅: 12,
    静: 16,
    淑: 12,
    婉: 11,
    婷: 12,
    丽: 19,
    美: 9,
    秀: 7,
    娟: 10,
    玲: 10,
    珊: 10,
    琳: 13,
    琪: 13,
    瑶: 15,
    瑾: 16,
    瑞: 14,
    瑜: 14,
    璇: 16,
    涵: 12,
    沁: 8,
    淇: 12,
    湘: 13,
    澜: 21,
    潮: 16,
    源: 14,
    泉: 9,
    溪: 14,
    润: 16,
    沛: 8,
    泓: 9,
    浚: 11,
    清: 12,
    淳: 12,
    湛: 13,
    瀚: 20,
    灏: 25,
    松: 8,
    柏: 9,
    梅: 11,
    兰: 23,
    竹: 6,
    菊: 14,
    莲: 17,
    荷: 13,
    桂: 10,
    楠: 13,
    枫: 13,
    桐: 10,
    桦: 16,
    榕: 14,
    森: 12,
    树: 16,
    根: 10,
    栋: 12,
    楷: 13,
    模: 15,
    权: 22,
    彬: 11,
    彪: 11,
    彦: 9,
    彰: 14,
    影: 15,
    律: 9,
    微: 13,
    征: 8,
    循: 12,
    从: 11,
    容: 10,
    宣: 9,
    家: 10,
    庭: 10,
    宫: 10,
    宸: 10,
    寅: 11,
    宏: 7,
    宗: 8,
    宜: 8,
    宝: 20,
    玉: 5,
    珍: 10,
    珠: 11,
    环: 18,
    璧: 18,
    玺: 19,
    铭: 14,
    锐: 15,
    锋: 15,
    银: 14,
    铜: 14,
    锦: 16,
    钧: 12,
    钦: 12,
    镇: 18,
    鉴: 22,
    鑫: 24,
    焱: 12,
    燚: 16,
    垚: 9,
    犇: 12,
    骉: 20,
    羴: 18,
    麤: 33,
    龘: 48,
  };
  // 部分字的康熙笔画存在异说，标注出来
  var BIHUA_NOTE = { 曙: '康熙字典日部13画计17画；部分姓名学书作18画，两家取法不同，需以你采用的版本为准。' };

  var SHU_JI = {
    1: '太极之数，万物开泰，生发无穷，利禄亨通。吉',
    2: '两仪之数，混沌未开，进退保守，志望难达。凶',
    3: '三才之数，天地人和，大事大业，繁荣昌隆。吉',
    4: '四象之数，待机而发，谨慎做事，凡事难达。凶',
    5: '五行之数，福禄长寿，阴阳和合，精神愉快。吉',
    6: '六爻之数，发展变化，天赋美德，安稳吉庆。吉',
    7: '七政之数，精悍严谨，天赋之力，吉星照耀。吉',
    8: '八卦之数，意志刚健，勤勉发展，排除万难。吉',
    9: '大成之数，蕴涵凶险，或成或败，难以把握。凶',
    10: '终结之数，雪暗飘零，偶或有成，回顾茫然。凶',
    11: '旱苗逢雨，万物更新，调顺发达，恢弘泽世。吉',
    12: '掘井无泉，无理之数，发展薄弱，虽生不足。凶',
    13: '春日牡丹，才艺多能，智谋奇略，忍柔当事。吉',
    14: '破兆之数，家庭缘薄，孤独遭难，谋事不达。凶',
    15: '福寿双全，立身兴家，德高望重，自成大业。吉',
    16: '厚重之数，能获众望，成就大业，名利双收。吉',
    17: '刚强之数，权威刚强，突破万难，如能容忍。吉',
    18: '铁镜重磨，有志竟成，内外有运，自成大功。吉',
    19: '多难之数，风云蔽日，虽有智谋，万事挫折。凶',
    20: '屋下藏金，非业破运，灾难重重，进退维谷。凶',
    21: '明月中天，光风霁月，万物确立，官运亨通。吉',
    22: '秋草逢霜，困难疾弱，虽出豪杰，人生波折。凶',
    23: '壮丽之数，旭日东升，壮丽壮观，权威旺盛。吉',
    24: '掘藏得金，家门余庆，金钱丰盈，白手成家。吉',
    25: '荣俊之数，资性英敏，才能奇特，克服傲慢。吉',
    26: '变怪之数，波澜重叠，怪异非运，英雄豪杰。凶',
    27: '增长之数，欲望无止，自我强烈，多受毁谤。凶',
    28: '阔水浮萍，遭难之数，豪杰气概，四海漂泊。凶',
    29: '智谋之数，财力归集，名闻海内，成就大业。吉',
    30: '非运之数，沉浮不定，吉凶难变，若明若暗。凶',
    31: '春日花开，智勇得志，博得名利，统领众人。吉',
    32: '宝马金鞍，侥幸多能，贵人相助，财富至上。吉',
    33: '旭日升天，鸾凤相会，名闻天下，隆昌至极。吉',
    34: '破家之数，见识短小，辛苦遭难，灾祸至极。凶',
    35: '高楼望月，温和平静，智达通畅，文昌技艺。吉',
    36: '波澜重叠，侠肝义胆，舍己成仁，义气侠情。凶',
    37: '猛虎出林，权威显达，热诚忠信，宜着雅量。吉',
    38: '磨铁成针，意志薄弱，刻意经营，才艺有成。吉',
    39: '富贵荣华，云开见月，虽有劳碌，光辉四海。吉',
    40: '退安之数，谨慎保安，智谋胆力，知难而退。凶',
    41: '有德之数，纯阳独秀，德高望重，和顺畅达。吉',
    42: '寒蝉在柳，博识多能，精通世情，专一不足。凶',
    43: '散财破产，虽有智谋，事难安定，散财破产。凶',
    44: '烦闷之数，事难遂愿，贪功好进，必遭失败。凶',
    45: '顺风之数，新生泰和，顺风扬帆，智谋经纬。吉',
    46: '浪里淘金，载宝沉舟，苦难折磨，若无坚志。凶',
    47: '点石成金，花开之象，万事如意，祯祥吉庆。吉',
    48: '古松立鹤，德智兼备，威望成师，洋洋大观。吉',
    49: '转变之数，吉临则吉，凶来则凶，惟靠谨慎。凶',
    50: '小舟入海，吉凶参半，遇吉则吉，遇凶则凶。凶',
    51: '沉浮之数，盛衰交加，波澜重叠，尚可成功。凶',
    52: '达眼之数，先见之明，理想实现，名利双收。吉',
    53: '曲卷难星，外祥内患，先富后贫，先贫后富。凶',
    54: '石上栽花，多难非运，忧闷频来，难望成功。凶',
    55: '善恶之数，外美内苦，先吉后凶，克服难关。凶',
    56: '浪里行舟，事与愿违，终难成功，欲速不达。凶',
    57: '日照春松，寒雪青松，夜莺蝉鸣，必遭一过。凶',
    58: '晚行遇月，浮沉多端，先吉后凶，宽宏扬名。吉',
    59: '寒蝉悲风，须防外患，意志不坚，缺乏耐力。凶',
    60: '无谋之数，黑暗无光，心迷意乱，出尔反尔。凶',
    61: '牡丹芙蓉，名利双收，繁荣富贵，修身养性。吉',
    62: '衰败之数，内外不和，志望难达，灾祸频来。凶',
    63: '舟归平海，富贵荣华，身心安泰，凡事如意。吉',
    64: '骨肉分离，浮沉破败，孤独悲愁，难得心安。凶',
    65: '巨流归海，天长地久，家运隆昌，事事亨通。吉',
    66: '岩头步马，内外不和，艰难不堪，损伤灾祸。凶',
    67: '通达之数，事事如意，功成名就，家道繁昌。吉',
    68: '顺风吹帆，兴家立业，智虑周密，集众信达。吉',
    69: '非业之数，坐立不安，常陷逆境，动摇不安。凶',
    70: '残菊逢霜，惨淡忧愁，空费心力，晚景凄凉。凶',
    71: '石上金花，内心劳苦，贯彻始终，定可昌隆。吉',
    72: '劳苦之数，先甜后苦，得而复失，难以安顺。凶',
    73: '无勇之数，志高力微，无所事事，沉静安固。吉',
    74: '残菊经霜，秋叶落寞，无能无智，坐食山空。凶',
    75: '退守之数，退守保吉，若能慎始，必获成功。吉',
    76: '离散之数，倾覆离散，骨肉分离，内外不和。凶',
    77: '半吉之数，家庭有悦，半吉半凶，能获援护。半吉',
    78: '晚苦之数，先天智能，中年发达，晚景凄凉。半吉',
    79: '云头望月，身疲力尽，穷迫不伸，精神不定。凶',
    80: '遁吉之数，凶星入命，早入隐遁，安居余生。凶',
    81: '万物回春，还本归元，能得繁荣，发达成功。吉',
  };
  function shuJi(n) {
    var k = ((n - 1) % 81) + 1;
    return { num: k, text: SHU_JI[k] || '', ji: (SHU_JI[k] || '').slice(-1) };
  }

  function wuGe(name) {
    var chars = name.split('');
    var bi = chars.map(function (c) {
      return BIHUA[c] || null;
    });
    var unknown = chars.filter(function (c, i) {
      return bi[i] === null;
    });
    var notes = chars
      .filter(function (c) {
        return BIHUA_NOTE[c];
      })
      .map(function (c) {
        return c + '：' + BIHUA_NOTE[c];
      });
    if (unknown.length) return { ok: false, unknown: unknown, bi: bi, notes: notes };
    var n = bi.length;
    var tian, ren, di, wai, zong;
    if (n === 2) {
      tian = bi[0] + 1;
      ren = bi[0] + bi[1];
      di = bi[1] + 1;
      wai = 2;
      zong = bi[0] + bi[1];
    } else if (n === 3) {
      tian = bi[0] + 1;
      ren = bi[0] + bi[1];
      di = bi[1] + bi[2];
      wai = bi[2] + 1;
      zong = bi[0] + bi[1] + bi[2];
    } else if (n === 4) {
      tian = bi[0] + bi[1];
      ren = bi[1] + bi[2];
      di = bi[2] + bi[3];
      wai = bi[0] + bi[3];
      zong = bi[0] + bi[1] + bi[2] + bi[3];
    } else return { ok: false, unknown: ['仅支持 2-4 字姓名'], bi: bi, notes: notes };
    var ge = { 天格: tian, 人格: ren, 地格: di, 外格: wai, 总格: zong };
    var detail = {};
    Object.keys(ge).forEach(function (k) {
      detail[k] = shuJi(ge[k]);
    });
    var sanCai = [shuJi(tian).num % 10, shuJi(ren).num % 10, shuJi(di).num % 10].map(function (x) {
      return ['水', '木', '木', '火', '土', '土', '金', '金', '水', '水'][x] || '—';
    });
    return { ok: true, bi: bi, chars: chars, ge: ge, detail: detail, sanCai: sanCai, notes: notes };
  }

  /* ---------- 6. 合婚 ---------- */
  function hehun(a, b) {
    var wx = function (p) {
      return p.wx.score;
    };
    var A = wx(a),
      B = wx(b);
    var nianZhi = [a.zhi[0], b.zhi[0]];
    var liuHe = {
      子: '丑',
      丑: '子',
      寅: '亥',
      亥: '寅',
      卯: '戌',
      戌: '卯',
      辰: '酉',
      酉: '辰',
      巳: '申',
      申: '巳',
      午: '未',
      未: '午',
    };
    var liuChong = {
      子: '午',
      午: '子',
      丑: '未',
      未: '丑',
      寅: '申',
      申: '寅',
      卯: '酉',
      酉: '卯',
      辰: '戌',
      戌: '辰',
      巳: '亥',
      亥: '巳',
    };
    var he = liuHe[nianZhi[0]] === nianZhi[1];
    var chong = liuChong[nianZhi[0]] === nianZhi[1];
    // 互补：一方缺的五行是另一方的用神/旺神
    var wsA = wangShuai(a),
      wsB = wangShuai(b);
    var complement = [];
    wsA.yong.forEach(function (w) {
      if (B[w] > A[w]) complement.push('女方' + w + '气较旺，补男方所需');
    });
    wsB.yong.forEach(function (w) {
      if (A[w] > B[w]) complement.push('男方' + w + '气较旺，补女方所需');
    });
    var score = 50;
    if (he) score += 15;
    if (chong) score -= 15;
    score += complement.length * 6;
    score = Math.max(20, Math.min(95, score));
    var level = score >= 80 ? '上等' : score >= 65 ? '中上' : score >= 50 ? '中等' : '偏下';
    return { score: score, level: level, nianHe: he, nianChong: chong, complement: complement, wsA: wsA, wsB: wsB };
  }

  function round(x, n) {
    var m = Math.pow(10, n === undefined ? 2 : n);
    return Math.round(x * m) / m;
  }

  return {
    wangShuai: wangShuai,
    SS_MEAN: SS_MEAN,
    rateLuck: rateLuck,
    mingGua: mingGua,
    baZhai: baZhai,
    wuGe: wuGe,
    shuJi: shuJi,
    hehun: hehun,
    BIHUA: BIHUA,
    STAR_INFO: STAR_INFO,
    GUA_DIR: GUA_DIR,
    WX: WX,
    SHENG: SHENG,
    KE: KE,
    BEI_SHENG: BEI_SHENG,
    BEI_KE: BEI_KE,
  };
});
