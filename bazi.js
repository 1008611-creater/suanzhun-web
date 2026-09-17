/* ============================================================
 *  bazi.js  ——  八字排盘引擎（纯 JS，无依赖，浏览器/Node 通用）
 *  算法要点：真太阳时 → 节气定月 → 四柱 → 十神 → 五行旺衰 → 大运流年
 *  节气采用天文算法（VSOP 简化式）计算太阳视黄经，精度 ±1 分钟内
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BaZi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 基础常量 ---------- */
  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var GAN_YY = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // 1=阳 0=阴
  var ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  var ZHI_YY = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  var SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

  // 地支藏干（本气、中气、余气）
  var CANG = {
    子: ['癸'],
    丑: ['己', '癸', '辛'],
    寅: ['甲', '丙', '戊'],
    卯: ['乙'],
    辰: ['戊', '乙', '癸'],
    巳: ['丙', '戊', '庚'],
    午: ['丁', '己'],
    未: ['己', '丁', '乙'],
    申: ['庚', '壬', '戊'],
    酉: ['辛'],
    戌: ['戊', '辛', '丁'],
    亥: ['壬', '甲'],
  };
  // 藏干权重（本气/中气/余气）
  var CANG_W = [0.6, 0.28, 0.12];

  // 十神表：以日干为「我」
  function shiShen(dayGanIdx, otherGanIdx) {
    var meWx = GAN_WX[dayGanIdx],
      meYy = GAN_YY[dayGanIdx];
    var itWx = GAN_WX[otherGanIdx],
      itYy = GAN_YY[otherGanIdx];
    var same = meYy === itYy;
    if (itWx === meWx) return same ? '比肩' : '劫财';
    if (sheng(meWx) === itWx) return same ? '食神' : '伤官'; // 我生
    if (ke(meWx) === itWx) return same ? '偏财' : '正财'; // 我克
    if (ke(itWx) === meWx) return same ? '七杀' : '正官'; // 克我
    if (sheng(itWx) === meWx) return same ? '偏印' : '正印'; // 生我
    return '—';
  }
  function sheng(w) {
    return { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }[w];
  }
  function ke(w) {
    return { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }[w];
  }

  /* ---------- 天文：儒略日 & 太阳视黄经 ---------- */
  function jdFromDate(y, m, d, hours) {
    if (m <= 2) {
      y -= 1;
      m += 12;
    }
    var A = Math.floor(y / 100),
      B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + hours / 24;
  }
  function sunLon(jd) {
    var T = (jd - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI) / 180;
    var C =
      (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
      0.000289 * Math.sin(3 * M);
    var lon = L0 + C;
    var om = ((125.04 - 1934.136 * T) * Math.PI) / 180;
    lon = lon - 0.00569 - 0.00478 * Math.sin(om);
    return ((lon % 360) + 360) % 360;
  }
  // 返回某年第 n 个节气的儒略日（北京时间 UTC+8）
  // 节气黄经：小寒285 立春315 惊蛰345 清明15 立夏45 芒种75 小暑105 立秋135 白露165 寒露195 立冬225 大雪255
  var TERM_LON = [285, 315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255];
  var TERM_NAME = ['小寒', '立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪'];
  function termJD(year, target) {
    var jd0 = jdFromDate(year, 1, 1, 0);
    var d = function (jd) {
      var x = (sunLon(jd) - target) % 360;
      return x < 0 ? x + 360 : x;
    };
    var prev = jd0,
      prevD = d(prev);
    for (var i = 1; i <= 400; i++) {
      var cur = jd0 + i,
        curD = d(cur);
      if (curD < prevD) {
        var lo = prev,
          hi = cur;
        for (var k = 0; k < 50; k++) {
          var mid = (lo + hi) / 2;
          if (d(mid) > 180) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2 + 8 / 24; // 转北京时间
      }
      prev = cur;
      prevD = curD;
    }
    return null;
  }
  // 某年 12 个节气的北京时间（Date 对象，用 UTC 字段承载北京时刻）
  function yearTerms(year) {
    return TERM_LON.map(function (lon, i) {
      return { name: TERM_NAME[i], jd: termJD(year, lon) };
    });
  }
  function jdToDateParts(jd) {
    var z = Math.floor(jd + 0.5),
      f = jd + 0.5 - z;
    var A = z;
    if (z >= 2299161) {
      var al = Math.floor((z - 1867216.25) / 36524.25);
      A = z + 1 + al - Math.floor(al / 4);
    }
    var B = A + 1524,
      C = Math.floor((B - 122.1) / 365.25),
      D = Math.floor(365.25 * C),
      E = Math.floor((B - D) / 30.6001);
    var day = B - D - Math.floor(30.6001 * E) + f;
    var mo = E < 14 ? E - 1 : E - 13;
    var yr = mo > 2 ? C - 4716 : C - 4715;
    var dd = Math.floor(day),
      hh = (day - dd) * 24;
    var mi = Math.floor((hh % 1) * 60);
    return { y: yr, m: mo, d: dd, h: Math.floor(hh), mi: mi };
  }
  // 均时差（分钟）：视太阳时 - 平太阳时
  function eqTime(year, month, day) {
    var doy = Math.floor(jdFromDate(year, month, day, 0) - jdFromDate(year, 1, 1, 0) + 0.5) + 1;
    var B = (2 * Math.PI * (doy - 81)) / 364;
    return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  }

  /* ---------- 真太阳时 ---------- */
  function trueSolar(y, mo, d, h, mi, lng) {
    var minutes = h * 60 + mi;
    var lonFix = (lng - 120) * 4; // 经度时差
    var eqt = eqTime(y, mo, d); // 均时差
    var t = minutes + lonFix + eqt;
    var dayShift = 0;
    while (t < 0) {
      t += 1440;
      dayShift -= 1;
    }
    while (t >= 1440) {
      t -= 1440;
      dayShift += 1;
    }
    var jd = jdFromDate(y, mo, d, 0) + dayShift;
    var p = jdToDateParts(jd + 0.5); // 仅取日期
    return {
      y: p.y,
      m: p.m,
      d: p.d,
      h: Math.floor(t / 60),
      mi: Math.floor(t % 60),
      totalMin: t,
      lonFix: lonFix,
      eqt: eqt,
      dayShift: dayShift,
    };
  }

  /* ---------- 四柱 ---------- */
  // 日柱：儒略日推算，2000-01-01 为戊午日（索引54）
  function dayGanZhi(y, m, d, dayOffset) {
    var jdn = Math.floor(jdFromDate(y, m, d, 12) + 0.5) + (dayOffset || 0);
    var idx = (((jdn + 49) % 60) + 60) % 60;
    return idx;
  }
  // 年柱：以立春为界
  function yearGanZhi(y, m, d, h, mi) {
    var lichun = yearTerms(y)[1].jd; // 立春
    var t = jdFromDate(y, m, d, h + mi / 60);
    var yy = t < lichun ? y - 1 : y;
    var idx = (((yy - 4) % 60) + 60) % 60;
    return { idx: idx, year: yy };
  }
  // 月柱：以节气为界，五虎遁
  function monthGanZhi(yearGanIdx, y, m, d, h, mi) {
    var t = jdFromDate(y, m, d, h + mi / 60);
    var terms = yearTerms(y).concat(yearTerms(y + 1));
    // 找到 t 落在哪个「节」之后
    var idx = -1;
    for (var i = 0; i < terms.length; i++) {
      if (t >= terms[i].jd) idx = i;
    }
    if (idx < 0) {
      terms = yearTerms(y - 1).concat(terms);
      idx = 0;
      for (var j = 0; j < terms.length; j++) {
        if (t >= terms[j].jd) idx = j;
      }
    }
    // idx 指向节气序号（0=小寒 → 十二月/丑月）
    // 节气 i 对应月支：小寒→丑(1), 立春→寅(2), 惊蛰→卯(3) ... 大雪→子(0)
    var zhiIdx = ((idx % 12) + 1) % 12;
    // 五虎遁：年干甲己→丙寅起
    var startGan = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 }[yearGanIdx];
    // 从寅月(月支2)开始数
    var monthsFromYin = (((zhiIdx - 2) % 12) + 12) % 12;
    var ganIdx = (startGan + monthsFromYin) % 10;
    return { gan: ganIdx, zhi: zhiIdx, termName: terms[idx] ? terms[idx].name : '' };
  }
  // 时柱：五鼠遁
  function hourGanZhi(dayGanIdx, hour, minute) {
    var t = hour * 60 + minute;
    var zhiIdx = Math.floor(((t + 60) % 1440) / 120); // 23:00起子时
    zhiIdx = ((zhiIdx % 12) + 12) % 12;
    var startGan = { 0: 0, 5: 0, 1: 2, 6: 2, 2: 4, 7: 4, 3: 6, 8: 6, 4: 8, 9: 8 }[dayGanIdx];
    var ganIdx = (startGan + zhiIdx) % 10;
    return { gan: ganIdx, zhi: zhiIdx };
  }

  /* ---------- 旬空 ---------- */
  function xunKong(gzIdx) {
    var xun = Math.floor(gzIdx / 10); // 0=甲子旬
    var map = [
      ['戌', '亥'],
      ['申', '酉'],
      ['午', '未'],
      ['辰', '巳'],
      ['寅', '卯'],
      ['子', '丑'],
    ];
    return map[xun];
  }

  /* ---------- 五行力量 ---------- */
  function wxPower(pillars) {
    var score = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    var detail = [];
    // 天干各计 1.0（月干、日干、时干、年干）
    var ganWeight = [0.8, 1.0, 1.2, 0.8]; // 年 月 日 时
    pillars.forEach(function (p, i) {
      var w = GAN_WX[p.gan];
      score[w] += ganWeight[i];
      detail.push({ pos: ['年干', '月干', '日干', '时干'][i], gan: GAN[p.gan], wx: w, w: ganWeight[i] });
    });
    // 地支藏干：月支最重
    var zhiWeight = [0.9, 1.6, 1.0, 0.9];
    pillars.forEach(function (p, i) {
      var z = ZHI[p.zhi];
      var cg = CANG[z];
      var zw = zhiWeight[i];
      cg.forEach(function (g, k) {
        var gi = GAN.indexOf(g);
        var w = zw * (CANG_W[k] || 0.1);
        score[GAN_WX[gi]] += w;
        detail.push({ pos: ['年支', '月支', '日支', '时支'][i] + '藏' + g, gan: g, wx: GAN_WX[gi], w: w });
      });
    });
    return { score: score, detail: detail };
  }

  /* ---------- 大运 ---------- */
  function daYun(pillars, yearGanIdx, gender, birthJD, y, m, d) {
    var yangYear = GAN_YY[yearGanIdx] === 1;
    var forward = (yangYear && gender === '男') || (!yangYear && gender === '女');
    var terms = [];
    for (var yy = y - 1; yy <= y + 1; yy++)
      terms = terms.concat(
        yearTerms(yy).map(function (t) {
          return { name: t.name, jd: t.jd };
        })
      );
    terms.sort(function (a, b) {
      return a.jd - b.jd;
    });
    var next = null,
      prev = null;
    for (var i = 0; i < terms.length; i++) {
      if (terms[i].jd > birthJD) {
        next = terms[i];
        prev = terms[i - 1];
        break;
      }
    }
    var diffDays = forward ? next.jd - birthJD : birthJD - prev.jd;
    var startAge = diffDays / 3; // 3天=1年
    // 大运干支：月柱顺/逆排
    var mz = pillars[1];
    var mIdx = gzIndex(mz.gan, mz.zhi);
    var list = [];
    for (var k = 1; k <= 10; k++) {
      var idx = forward ? (mIdx + k) % 60 : (((mIdx - k) % 60) + 60) % 60;
      var g = idx % 10,
        z = idx % 12;
      list.push({
        gan: g,
        zhi: z,
        gz: GAN[g] + ZHI[z],
        startAge: startAge + (k - 1) * 10,
        startYear: y + Math.floor(startAge) + (k - 1) * 10,
        shiShen: shiShen(pillars[2].gan, g),
      });
    }
    return { forward: forward, startAge: startAge, list: list, nextTerm: next, prevTerm: prev };
  }
  function gzIndex(gan, zhi) {
    for (var i = 0; i < 60; i++) if (i % 10 === gan && i % 12 === zhi) return i;
    return 0;
  }

  /* ---------- 流年 ---------- */
  function liuNian(fromYear, count, dayGanIdx) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var yy = fromYear + i;
      var idx = (((yy - 4) % 60) + 60) % 60;
      out.push({
        year: yy,
        gan: idx % 10,
        zhi: idx % 12,
        gz: GAN[idx % 10] + ZHI[idx % 12],
        shiShen: shiShen(dayGanIdx, idx % 10),
      });
    }
    return out;
  }

  /* ---------- 主排盘函数 ---------- */
  function paipan(opt) {
    var name = opt.name || '无名';
    var gender = opt.gender === '女' ? '女' : '男';
    var y = opt.year,
      mo = opt.month,
      d = opt.day,
      h = opt.hour,
      mi = opt.minute || 0;
    var lng = opt.lng === undefined || opt.lng === null || opt.lng === '' ? 120 : Number(opt.lng);
    var useTrueSolar = opt.useTrueSolar !== false;

    var solar = { y: y, m: mo, d: d, h: h, mi: mi };
    var ts = null;
    if (useTrueSolar) {
      ts = trueSolar(y, mo, d, h, mi, lng);
      solar = { y: ts.y, m: ts.m, d: ts.d, h: ts.h, mi: ts.mi };
    }
    var birthJD = jdFromDate(solar.y, solar.m, solar.d, solar.h + solar.mi / 60);

    var yz = yearGanZhi(solar.y, solar.m, solar.d, solar.h, solar.mi);
    var mz = monthGanZhi(yz.idx % 10, solar.y, solar.m, solar.d, solar.h, solar.mi);
    var dz = dayGanZhi(solar.y, solar.m, solar.d);
    // 晚子时：23:00–23:59 归入次日子时，日柱与时柱干同步进位
    var lateZi = solar.h >= 23;
    var dayIdxForHour = lateZi ? dz + 1 : dz;
    var dzFinal = dayIdxForHour;
    var hz = hourGanZhi(dayIdxForHour % 10, solar.h, solar.mi);

    var pillars = [
      { gan: yz.idx % 10, zhi: yz.idx % 12 },
      { gan: mz.gan, zhi: mz.zhi },
      { gan: dzFinal % 10, zhi: dzFinal % 12 },
      { gan: hz.gan, zhi: hz.zhi },
    ];
    var dayGan = pillars[2].gan;
    var wx = wxPower(pillars);
    var dy = daYun(pillars, yz.idx % 10, gender, birthJD, solar.y, solar.m, solar.d);

    // 十神
    var shishen = {
      year: shiShen(dayGan, pillars[0].gan),
      month: shiShen(dayGan, pillars[1].gan),
      day: '日主',
      hour: shiShen(dayGan, pillars[3].gan),
    };
    var zhiShiShen = pillars.map(function (p) {
      return shiShen(dayGan, GAN.indexOf(CANG[ZHI[p.zhi]][0]));
    });

    return {
      name: name,
      gender: gender,
      input: { year: y, month: mo, day: d, hour: h, minute: mi, lng: lng, useTrueSolar: useTrueSolar },
      trueSolar: ts,
      solarUsed: solar,
      pillars: pillars,
      gz: pillars.map(function (p) {
        return GAN[p.gan] + ZHI[p.zhi];
      }),
      gan: pillars.map(function (p) {
        return GAN[p.gan];
      }),
      zhi: pillars.map(function (p) {
        return ZHI[p.zhi];
      }),
      shiShen: shishen,
      zhiShiShen: zhiShiShen,
      dayGan: dayGan,
      dayGanWx: GAN_WX[dayGan],
      zodiac: SHENGXIAO[pillars[0].zhi],
      xunKong: xunKong(dzFinal),
      wx: wx,
      daYun: dy,
      liuNian: liuNian(y + 1, 60, dayGan),
      monthTerm: mz.termName,
      meta: { GAN: GAN, ZHI: ZHI, GAN_WX: GAN_WX, ZHI_WX: ZHI_WX, CANG: CANG, GAN_YY: GAN_YY, ZHI_YY: ZHI_YY },
    };
  }

  return {
    paipan: paipan,
    yearTerms: yearTerms,
    trueSolar: trueSolar,
    jdFromDate: jdFromDate,
    jdToDateParts: jdToDateParts,
    dayGanZhi: dayGanZhi,
    GAN: GAN,
    ZHI: ZHI,
    GAN_WX: GAN_WX,
    ZHI_WX: ZHI_WX,
    CANG: CANG,
    shiShen: shiShen,
    xunKong: xunKong,
    SHENGXIAO: SHENGXIAO,
    GAN_YY: GAN_YY,
    ZHI_YY: ZHI_YY,
  };
});
