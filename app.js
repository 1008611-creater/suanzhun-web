/* ============================================================
 *  app.js —— 页面渲染逻辑（依赖 bazi.js 的 BaZi 与 analysis.js 的 MingLi）
 * ============================================================ */
(function () {
  'use strict';
  var B = window.BaZi,
    A = window.MingLi;
  var GAN = B.GAN,
    ZHI = B.ZHI,
    CANG = B.CANG;
  /* 五行配色统一走设计令牌。文字色与填充色都在 site.css 里按 is-mu / is-huo 等类名定义，
     渲染时只切类名，不写内联 style（CSP style-src 'self' 禁止内联样式生效）。 */
  var WX_KEY = { 木: 'mu', 火: 'huo', 土: 'tu', 金: 'jin', 水: 'shui' };

  /* ---------- 城市经度表 ---------- */
  var CITY = [
    ['河北 唐山（丰南）', 118.18],
    ['河北 唐山（市区）', 118.18],
    ['河北 石家庄', 114.51],
    ['河北 保定', 115.46],
    ['河北 邯郸', 114.49],
    ['河北 廊坊', 116.7],
    ['河北 沧州', 116.86],
    ['北京', 116.41],
    ['天津', 117.2],
    ['上海', 121.47],
    ['重庆', 106.55],
    ['广东 广州', 113.26],
    ['广东 深圳', 114.06],
    ['广东 东莞', 113.75],
    ['江苏 南京', 118.8],
    ['江苏 苏州', 120.62],
    ['江苏 无锡', 120.3],
    ['浙江 杭州', 120.16],
    ['浙江 宁波', 121.55],
    ['浙江 温州', 120.7],
    ['山东 济南', 117.0],
    ['山东 青岛', 120.38],
    ['山东 烟台', 121.39],
    ['河南 郑州', 113.62],
    ['湖北 武汉', 114.3],
    ['湖南 长沙', 112.94],
    ['四川 成都', 104.07],
    ['陕西 西安', 108.94],
    ['山西 太原', 112.55],
    ['辽宁 沈阳', 123.43],
    ['辽宁 大连', 121.62],
    ['吉林 长春', 125.32],
    ['黑龙江 哈尔滨', 126.53],
    ['安徽 合肥', 117.28],
    ['福建 福州', 119.3],
    ['福建 厦门', 118.09],
    ['江西 南昌', 115.89],
    ['广西 南宁', 108.37],
    ['云南 昆明', 102.83],
    ['贵州 贵阳', 106.63],
    ['甘肃 兰州', 103.82],
    ['内蒙古 呼和浩特', 111.75],
    ['新疆 乌鲁木齐', 87.62],
    ['西藏 拉萨', 91.14],
    ['青海 西宁', 101.78],
    ['宁夏 银川', 106.23],
    ['海南 海口', 110.2],
    ['香港', 114.17],
    ['澳门', 113.55],
    ['台湾 台北', 121.56],
    ['自定义（手动填经度）', null],
  ];

  /* ---------- 工具 ---------- */
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }
  // 用户输入会拼进 innerHTML，必须先转义，否则姓名里写 <img onerror=...> 会直接执行。
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function jClass(ji) {
    if (ji === '大吉' || ji === '吉' || ji === '小吉') return 'j';
    if (ji === '大凶') return 'dx';
    if (ji === '凶' || ji === '偏凶') return 'x';
    return '';
  }
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  /* ---------- 初始化表单 ---------- */
  var $ = function (id) {
    return document.getElementById(id);
  };
  (function initCity() {
    var sel = $('city');
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '请选择出生地';
    sel.appendChild(ph);
    CITY.forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = c[0];
      sel.appendChild(o);
    });
    var defIdx = 0;
    CITY.forEach(function (c, i) {
      if (c[0] === '北京') defIdx = i;
    });
    sel.value = String(defIdx);
    if (CITY[defIdx][1] !== null) $('lng').value = CITY[defIdx][1];
    sel.addEventListener('change', function () {
      var c = CITY[sel.value];
      if (!c) return;
      if (c[1] !== null) $('lng').value = c[1];
      else $('lng').focus();
    });
  })();

  /* ---------- 主流程 ---------- */
  function readForm(prefix, fallbackLng) {
    var p = prefix ? prefix : '';
    var fallback = isFinite(fallbackLng) ? fallbackLng : 120;
    var dstr = $(p + 'date').value;
    var tstr = $(p + 'time').value;
    if (!dstr || !tstr) return null;
    var dp = dstr.split('-'),
      tp = tstr.split(':');
    var rawLng = $(p + 'lng') ? $(p + 'lng').value.trim() : '';
    var lng = rawLng === '' ? fallback : Number(rawLng);
    if (!isFinite(lng) || lng < -180 || lng > 180) lng = fallback;
    return {
      name: $(p + 'name').value || '无名',
      gender: $(p + 'gender').value,
      year: +dp[0],
      month: +dp[1],
      day: +dp[2],
      hour: +tp[0],
      minute: +tp[1],
      lng: lng,
      useTrueSolar: $(p + 'ts') ? $(p + 'ts').value === '1' : true,
    };
  }

  function calc(opt) {
    // 流年表需要覆盖到当前年份之后：早年生人（例如 1965）默认 60 年不够用。
    // 年数由调用方按「当前年份 + 10 - 出生年」算好后传入，引擎只保证下限 60。
    var wantYears = new Date().getFullYear() + 10 - opt.year;
    var p = B.paipan(Object.assign({}, opt, { liuNianYears: Math.max(60, wantYears) }));
    p.ws = A.wangShuai(p);
    p.gua = A.mingGua(opt.year, opt.gender);
    p.bazhai = A.baZhai(p.gua.gua);
    p.name5 = A.wuGe(opt.name);
    return p;
  }

  function render(p) {
    var box = $('result');
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = '';
    box.hidden = false;
    var ce = $('canvasEmpty');
    if (ce) ce.hidden = true;

    /* --- 1. 基本信息 --- */
    var c1 = el('div', 'card');
    c1.appendChild(el('h2', null, '命主基本信息'));
    var g = el('div', 'grid2');
    var left = el('div'),
      right = el('div');
    var ts = p.trueSolar;
    function kv(k, v) {
      return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
    }
    left.innerHTML =
      kv('姓名', esc(p.name) + '（' + esc(p.gender) + '）') +
      kv(
        '公历生日',
        p.input.year + '年' + p.input.month + '月' + p.input.day + '日 ' + pad(p.input.hour) + ':' + pad(p.input.minute)
      ) +
      kv('出生地经度', p.input.lng.toFixed(2) + '°E') +
      kv('真太阳时', ts ? ts.y + '-' + pad(ts.m) + '-' + pad(ts.d) + ' ' + pad(ts.h) + ':' + pad(ts.mi) : '未启用');
    right.innerHTML =
      kv('经度时差', ts ? (ts.lonFix >= 0 ? '+' : '') + ts.lonFix.toFixed(1) + ' 分钟' : '—') +
      kv('均时差', ts ? (ts.eqt >= 0 ? '+' : '') + ts.eqt.toFixed(1) + ' 分钟' : '—') +
      kv('月令节气', p.monthTerm) +
      kv('生肖 / 旬空', p.zodiac + ' / ' + p.xunKong.join('、') + '空');
    g.appendChild(left);
    g.appendChild(right);
    c1.appendChild(g);
    box.appendChild(c1);

    /* --- 2. 四柱 --- */
    var c2 = el('div', 'card');
    c2.appendChild(el('h2', null, '四柱八字'));
    var pil = el('div', 'pillars');
    var POS = ['年柱', '月柱', '日柱', '时柱'];
    var ssList = [p.shiShen.year, p.shiShen.month, '日主', p.shiShen.hour];
    for (var i = 0; i < 4; i++) {
      var d = el('div', 'pil' + (i === 2 ? ' day' : ''));
      var cang = CANG[ZHI[p.pillars[i].zhi]] || [];
      d.innerHTML =
        '<div class="pos">' +
        POS[i] +
        '</div>' +
        '<div class="gz"><span class="g">' +
        GAN[p.pillars[i].gan] +
        '</span><span class="g">' +
        ZHI[p.pillars[i].zhi] +
        '</span></div>' +
        '<div class="ss">' +
        ssList[i] +
        '</div>' +
        '<div class="cang">藏干 ' +
        cang.join('·') +
        '</div>';
      pil.appendChild(d);
    }
    c2.appendChild(pil);
    c2.appendChild(
      el(
        'div',
        'note',
        '日主 <b class="em-accent">' +
          GAN[p.dayGan] +
          '</b>（' +
          p.dayGanWx +
          '）。' +
          '年柱以立春为界，月柱以节气为界，日柱按儒略日推算，时柱由日干五鼠遁得出。' +
          (ts
            ? '本盘已按出生地经度与均时差换算真太阳时，真太阳时 ' +
              pad(ts.h) +
              ':' +
              pad(ts.mi) +
              '，落在' +
              ZHI[p.pillars[3].zhi] +
              '时。'
            : '')
      )
    );
    box.appendChild(c2);

    /* --- 3. 五行力量 --- */
    var c3 = el('div', 'card');
    c3.appendChild(el('h2', null, '五行力量与旺衰'));
    var ws = p.ws;
    var total = 0;
    ['木', '火', '土', '金', '水'].forEach(function (w) {
      total += ws.score[w];
    });
    var wbox = el('div');
    ['木', '火', '土', '金', '水'].forEach(function (w) {
      var v = ws.score[w];
      var pct = total > 0 ? (v / total) * 100 : 0;
      var isYong = ws.yong.indexOf(w) >= 0;
      var isJi = ws.ji.indexOf(w) >= 0;
      var key = WX_KEY[w];
      var row = el('div', 'wxrow');
      var name = el('div', 'wxname is-' + key, w);
      if (isYong) name.appendChild(el('span', 'wx-mark is-yong', '用'));
      else if (isJi) name.appendChild(el('span', 'wx-mark is-ji', '忌'));
      var bar = el('div', 'wxbar');
      var fill = el('div', 'wxfill is-' + key);
      /* CSSOM 赋值不受 CSP style-src 限制；受限制的是 HTML 里的 style 属性。 */
      fill.style.width = pct.toFixed(1) + '%';
      bar.appendChild(fill);
      row.appendChild(name);
      row.appendChild(bar);
      row.appendChild(el('div', 'wxval', v.toFixed(2) + ' · ' + pct.toFixed(1) + '%'));
      wbox.appendChild(row);
    });
    c3.appendChild(wbox);
    var g2 = el('div', 'grid2');
    g2.style.marginTop = '18px';
    g2.innerHTML =
      '<div>' +
      kv('日主强弱', '<span class="big">' + ws.strong + '</span>') +
      kv('同党（比劫+印）', ws.tong.toFixed(2)) +
      kv('异党（食伤+财+官杀）', ws.yi.toFixed(2)) +
      '</div>' +
      '<div>' +
      kv('用神', ws.yong.join('、')) +
      kv('最喜', ws.xi) +
      kv('忌神', ws.ji.join('、')) +
      '</div>';
    c3.appendChild(g2);
    c3.appendChild(
      el(
        'div',
        'note',
        '同党占比 ' +
          (ws.ratio * 100).toFixed(1) +
          '%。' +
          '五行最旺为 <b class="em-accent">' +
          ws.most +
          '</b>，最弱为 <b>' +
          ws.least +
          '</b>。' +
          (ws.missing.length ? '八字缺 ' + ws.missing.join('、') + '。' : '五行俱全，无缺。')
      )
    );
    box.appendChild(c3);

    /* --- 4. 大运 --- */
    var c4 = el('div', 'card');
    c4.appendChild(el('h2', null, '大运'));
    var nowYear = new Date().getFullYear();
    var dy = p.daYun;
    var t = el('table');
    var h = '<tr><th>步</th><th>干支</th><th>十神</th><th>起运年龄</th><th>起始年份</th><th>吉凶</th></tr>';
    dy.list.forEach(function (d, i) {
      var r = A.rateLuck(d.gan, d.zhi, ws);
      var isNow = nowYear >= d.startYear && (i === dy.list.length - 1 || nowYear < dy.list[i + 1].startYear);
      h +=
        '<tr class="' +
        (isNow ? 'now' : '') +
        '"><td>' +
        (i + 1) +
        '</td><td class="gz">' +
        d.gz +
        '</td>' +
        '<td>' +
        d.shiShen +
        '</td><td>' +
        d.startAge.toFixed(1) +
        ' 岁</td><td>' +
        d.startYear +
        '</td>' +
        '<td><span class="tag ' +
        jClass(r.label) +
        '">' +
        r.label +
        '</span></td></tr>';
    });
    t.innerHTML = h;
    c4.appendChild(t);
    c4.appendChild(
      el(
        'div',
        'note',
        (dy.forward ? '阳男阴女顺排' : '阴男阳女逆排') +
          '，起运 ' +
          dy.startAge.toFixed(2) +
          ' 岁（出生后 ' +
          (dy.startAge * 3).toFixed(0) +
          ' 天交运）。' +
          '吉凶按用神喜忌评分，仅供参考。'
      )
    );
    box.appendChild(c4);

    /* --- 5. 流年 --- */
    var c5 = el('div', 'card');
    // 流年窗口必须跟着当前年份走。写死年份会让早年生人的表整块空白。
    var lnStart = nowYear,
      lnEnd = nowYear + 9;
    c5.appendChild(el('h2', null, '流年运势（' + lnStart + ' – ' + lnEnd + '）'));
    var t2 = el('table');
    var h2 = '<tr><th>年份</th><th>干支</th><th>十神</th><th>虚岁</th><th>吉凶</th><th>简评</th></tr>';
    var LN_MEAN = {
      正财: '正财之年，务实求财，宜稳进；男命亦主感情落实。',
      偏财: '偏财之年，机会与开销并增，忌投机。',
      正官: '正官之年，利事业、考试、名分；压力同步上升。',
      七杀: '七杀之年，压力与突破并存，宜守规矩、忌硬碰。',
      正印: '正印之年，利学习、文书、贵人扶持。',
      偏印: '偏印之年，思路活但易孤僻多虑，宜专一。',
      比肩: '比肩之年，同伴助力与竞争并存，防破财。',
      劫财: '劫财之年，交友宜谨慎，防因财失义。',
      食神: '食神之年，舒展才华、有口福，利创作与副业。',
      伤官: '伤官之年，才华外露但易口舌冲动，宜收敛。',
    };
    p.liuNian
      .filter(function (x) {
        return x.year >= lnStart && x.year <= lnEnd;
      })
      .forEach(function (x) {
        var r = A.rateLuck(x.gan, x.zhi, ws);
        var isNow = x.year === nowYear;
        h2 +=
          '<tr class="' +
          (isNow ? 'now' : '') +
          '"><td>' +
          x.year +
          '</td><td class="gz">' +
          x.gz +
          '</td>' +
          '<td>' +
          x.shiShen +
          '</td><td>' +
          (x.year - p.input.year + 1) +
          '</td>' +
          '<td><span class="tag ' +
          jClass(r.label) +
          '">' +
          r.label +
          '</span></td>' +
          '<td class="lead">' +
          (LN_MEAN[x.shiShen] || '') +
          '</td></tr>';
      });
    t2.innerHTML = h2;
    c5.appendChild(t2);
    box.appendChild(c5);

    /* --- 6. 命卦与八宅 --- */
    var c6 = el('div', 'card');
    c6.appendChild(el('h2', null, '命卦与八宅风水'));
    var top = el('div', 'grid2');
    top.innerHTML =
      '<div>' +
      kv('三元命卦', '<span class="big">' + p.gua.gua + ' ' + p.gua.number + ' 命</span>') +
      kv('东西四命', p.gua.eastWest) +
      '</div>' +
      '<div>' +
      kv('大吉方（生气）', p.bazhai.jiFang[0].dir + ' ' + p.bazhai.jiFang[0].deg) +
      kv(
        '大凶方（绝命）',
        p.bazhai.xiongFang.filter(function (f) {
          return f.star === '绝命';
        })[0].dir
      ) +
      '</div>';
    c6.appendChild(top);
    var bz = el('div', 'bazhai');
    bz.style.marginTop = '16px';
    p.bazhai.list
      .slice()
      .sort(function (a, b) {
        var ia = { 西北: 0, 正北: 1, 东北: 2, 正东: 3, 东南: 4, 正南: 5, 西南: 6, 正西: 7 };
        return ia[a.dir] - ia[b.dir];
      })
      .forEach(function (f) {
        bz.innerHTML +=
          '<div class="bz ' +
          jClass(f.ji) +
          '"><div class="dir">' +
          f.dir +
          '</div>' +
          '<div class="star">' +
          f.star +
          '</div><div class="deg">' +
          f.deg +
          '</div></div>';
      });
    c6.appendChild(bz);
    var det = el('div');
    det.style.marginTop = '16px';
    p.bazhai.list
      .slice()
      .sort(function (a, b) {
        return 0;
      })
      .forEach(function (f) {
        det.innerHTML +=
          '<div class="kv"><span class="k wide">' +
          f.dir +
          ' · ' +
          f.star +
          ' <span class="tag ' +
          jClass(f.ji) +
          '">' +
          f.ji +
          '</span></span><span class="v plain-r">' +
          f.mean +
          '</span></div>';
      });
    c6.appendChild(det);
    c6.appendChild(
      el(
        'div',
        'note',
        '八宅以命卦定「东四命／西四命」，吉方宜作大门、卧室、书房与办公位；凶方忌作大门与主卧。实际布局还需结合房屋坐向与流年飞星，此处只论命卦方位。'
      )
    );
    box.appendChild(c6);

    /* --- 6b. 八宅落地布局：把吉凶方位翻译成家具与功能区位置 --- */
    var lp = A.layoutPlan(p.bazhai, ws);
    var c6b = el('div', 'card');
    c6b.appendChild(el('h2', null, '八宅落地布局'));
    var lpg = el('div', 'grid2');
    lpg.innerHTML =
      '<div>' +
      kv('床头朝向', '<span class="big big-sm">' + lp.bedHead + '</span>（吉方）') +
      kv('书桌 / 办公位', lp.desk) +
      kv('神位 / 供桌', lp.altar) +
      '</div>' +
      '<div>' +
      kv('次选吉方', lp.second) +
      kv('助力颜色', lp.colors) +
      kv('重点回避', lp.avoid) +
      '</div>';
    c6b.appendChild(lpg);
    var lpt = el('table');
    var lph = '<tr><th>方位</th><th>度数</th><th>星曜</th><th>吉凶</th><th>宜用</th></tr>';
    lp.rows.forEach(function (r) {
      lph +=
        '<tr><td>' +
        r.dir +
        '</td><td class="sm">' +
        r.deg +
        '</td><td>' +
        r.star +
        '</td><td><span class="tag ' +
        jClass(r.ji) +
        '">' +
        r.ji +
        '</span></td>' +
        '<td class="lead">' +
        r.use +
        '</td></tr>';
    });
    lpt.innerHTML = lph;
    var lptWrap = el('div');
    lptWrap.style.marginTop = '16px';
    lptWrap.appendChild(lpt);
    c6b.appendChild(lptWrap);
    c6b.appendChild(
      el(
        'div',
        'note',
        '床头宜靠吉方、书桌宜「坐凶向吉」，主卧与神位优先取生气、延年、天医。以上只论命卦八宅，实际还要结合房屋坐向与户型，不能只凭一个罗盘方位下结论。'
      )
    );
    box.appendChild(c6b);

    /* --- 6c. 事业与财运方向：十神结构 + 大运阶段 --- */
    var ca = A.career(p, nowYear);
    var c6c = el('div', 'card');
    c6c.appendChild(el('h2', null, '事业与财运方向'));
    var cag = el('div', 'grid2');
    cag.innerHTML =
      '<div>' +
      kv('主导十神', ca.primary + '（' + Math.round(ca.power.pct[ca.primary] * 100) + '%）') +
      kv('次要十神', ca.secondary + '（' + Math.round(ca.power.pct[ca.secondary] * 100) + '%）') +
      kv('发力方向', ca.direction + ' · ' + ca.trait) +
      '</div>' +
      '<div>' +
      kv('适合行业属性', ca.fields) +
      kv('助力颜色', ca.colors) +
      kv('用神 / 忌神', ca.yong.join('、') + ' / ' + ws.ji.join('、')) +
      '</div>';
    c6c.appendChild(cag);
    var cam = el('div', 'adv-wrap');
    cam.innerHTML =
      '<div class="adv"><div class="adv-t">你的做事方式</div><p>' +
      ca.primaryText +
      '</p></div>' +
      '<div class="adv"><div class="adv-t">可以借力的第二面</div><p>' +
      ca.secondaryText +
      '</p></div>';
    c6c.appendChild(cam);
    var cad = el('div', 'grid2');
    cad.style.marginTop = '6px';
    cad.innerHTML =
      '<div>' +
      kv('当前大运', ca.step ? ca.step.gz + '（' + ca.step.startYear + ' 起 · ' + ca.step.shiShen + '）' : '—') +
      kv(
        '本步吉凶',
        ca.stepRate ? '<span class="tag ' + jClass(ca.stepRate.label) + '">' + ca.stepRate.label + '</span>' : '—'
      ) +
      '</div>' +
      '<div>' +
      kv(
        '下一步大运',
        ca.nextStep ? ca.nextStep.gz + '（' + ca.nextStep.startYear + ' 起 · ' + ca.nextStep.shiShen + '）' : '—'
      ) +
      kv(
        '下一步吉凶',
        ca.nextRate ? '<span class="tag ' + jClass(ca.nextRate.label) + '">' + ca.nextRate.label + '</span>' : '—'
      ) +
      '</div>';
    c6c.appendChild(cad);
    if (ca.notes.length) {
      var can = el('div');
      can.style.marginTop = '10px';
      can.innerHTML = ca.notes
        .map(function (s) {
          return '<div class="kv"><span class="v plain">· ' + s + '</span></div>';
        })
        .join('');
      c6c.appendChild(can);
    }
    c6c.appendChild(
      el(
        'div',
        'note',
        '事业方向按「十神结构 + 用神喜忌」给出，说明的是适合的发力方式与行业属性，不是行业排名，也不构成择业或投资建议。换运前后两三年通常是轨道变动的窗口，值得提前准备。'
      )
    );
    box.appendChild(c6c);

    /* --- 6d. 婚姻与感情：配偶宫 + 配偶星 + 流年应期 --- */
    var ma = A.marriage(p, nowYear);
    var c6d = el('div', 'card');
    c6d.appendChild(el('h2', null, '婚姻与感情'));
    var mag = el('div', 'grid2');
    mag.innerHTML =
      '<div>' +
      kv('配偶宫', ma.palace.zhi + '（' + ma.palace.wx + ' · ' + ma.palace.shiShen + '）') +
      kv('配偶宫解读', '<span class="plain">' + ma.palace.text + '</span>') +
      '</div>' +
      '<div>' +
      kv('感情星', ma.starName + ' 占 ' + Math.round(ma.starPct * 100) + '%') +
      kv('整体倾向', '<span class="big big-sm">' + ma.level + '</span>') +
      '</div>';
    c6d.appendChild(mag);
    if (ma.relations.length) {
      var mar = el('div');
      mar.style.marginTop = '10px';
      mar.innerHTML = ma.relations
        .map(function (r) {
          return (
            '<div class="kv"><span class="k">' +
            r.where +
            ' ' +
            r.zhi +
            '</span><span class="v">与配偶宫' +
            r.rel +
            '</span></div>'
          );
        })
        .join('');
      c6d.appendChild(mar);
    }
    var maYears = ma.years.slice().sort(function (a, b) {
      return a.year - b.year;
    });
    if (maYears.length) {
      var mat = el('table');
      var matWrap = el('div');
      matWrap.style.marginTop = '16px';
      var mah = '<tr><th>应期年份</th><th>干支</th><th>虚岁</th><th>动象</th></tr>';
      maYears.forEach(function (y) {
        mah +=
          '<tr' +
          (y.year === nowYear ? ' class="now"' : '') +
          '><td>' +
          y.year +
          '</td><td class="gz">' +
          y.gz +
          '</td><td>' +
          (y.year - p.input.year + 1) +
          '</td><td class="lead">' +
          y.why +
          '</td></tr>';
      });
      mat.innerHTML = mah;
      matWrap.appendChild(mat);
      c6d.appendChild(matWrap);
    } else {
      c6d.appendChild(el('div', 'note', '未来十二年内没有出现明显的配偶宫动象，属于需要主动经营的阶段。'));
    }
    c6d.appendChild(
      el(
        'div',
        'note',
        '婚姻部分只看配偶宫、配偶星与流年动象，说明的是「关系节奏与相处模式」，不能预测具体某个人，也不做「正缘」承诺。真正决定结果的仍然是相处方式与现实条件。'
      )
    );
    box.appendChild(c6d);

    /* --- 7. 姓名 --- */
    var c7 = el('div', 'card');
    c7.appendChild(el('h2', null, '姓名五格分析'));
    var n5 = p.name5;
    if (!n5.ok) {
      c7.appendChild(
        el('div', 'note', '姓名字形笔画未收录：' + esc((n5.unknown || []).join('、')) + '，无法计算五格。')
      );
    } else {
      var ge = el('div', 'ge');
      [
        ['天格', '天格'],
        ['人格', '人格'],
        ['地格', '地格'],
        ['外格', '外格'],
        ['总格', '总格'],
      ].forEach(function (pair) {
        var k = pair[0],
          d5 = n5.detail[k];
        ge.innerHTML +=
          '<div class="g1"><div class="n">' +
          k +
          '</div>' +
          '<div class="num ' +
          (d5.ji === '吉' ? 'j' : 'x') +
          '">' +
          d5.num +
          '</div>' +
          '<div class="txt">' +
          d5.text +
          '</div></div>';
      });
      c7.appendChild(ge);
      var g3 = el('div', 'grid2');
      g3.style.marginTop = '16px';
      g3.innerHTML =
        '<div>' +
        kv('康熙笔画', n5.bi.join(' / ')) +
        kv('三才配置', n5.sanCai.join(' · ')) +
        '</div>' +
        '<div>' +
        kv('总格', n5.ge['总格'] + '（' + n5.detail['总格'].ji + '）') +
        kv('人格', n5.ge['人格'] + '（' + n5.detail['人格'].ji + '）') +
        '</div>';
      c7.appendChild(g3);
      if (n5.notes && n5.notes.length) c7.appendChild(el('div', 'note', n5.notes.map(esc).join('<br>')));
      c7.appendChild(
        el(
          'div',
          'note',
          '五格剖象法为近代姓名学流派之一，以康熙字典笔画为准。改名属个人选择，建议结合本人意愿与户籍规定。'
        )
      );
    }
    box.appendChild(c7);

    /* --- 7b. 姓名优选：不动姓，只枚举「改中间字 / 改末字」的笔画候选 --- */
    var na = A.nameAdvise(p.name, ws);
    var c7b = el('div', 'card');
    c7b.appendChild(el('h2', null, '姓名优选建议'));
    if (!na.ok) {
      c7b.appendChild(el('div', 'note', '无法给出改名建议：' + esc(na.reason || '字形未收录') + '。'));
    } else {
      var cur = na.current;
      var curBad = ['人格', '地格', '总格'].filter(function (k) {
        return cur.detail[k].ji === '凶';
      });
      var cg = el('div', 'grid2');
      cg.innerHTML =
        '<div>' +
        kv('现名笔画', na.bi.join(' / ')) +
        kv(
          '人格 / 地格',
          cur.ge['人格'] + '（' + cur.detail['人格'].ji + '）/ ' + cur.ge['地格'] + '（' + cur.detail['地格'].ji + '）'
        ) +
        '</div>' +
        '<div>' +
        kv('总格', cur.ge['总格'] + '（' + cur.detail['总格'].ji + '）') +
        kv('三才', cur.sanCai.level) +
        '</div>';
      c7b.appendChild(cg);
      c7b.appendChild(
        el(
          'div',
          'note',
          curBad.length
            ? '现名有需要处理的地方：' +
                curBad.join('、') +
                '为凶数。下面的候选都先满足「人格与地格不为凶」这条硬门槛，再按五格吉数、三才顺逆、格五行是否落在用神上排序。'
            : '现名五格没有硬伤，可以不改。下面给出的是「如果想调」的可选方向，不是必须改。'
        )
      );
      if (na.picks.length) {
        var nat = el('table');
        var natWrap = el('div');
        natWrap.style.marginTop = '16px';
        var nah =
          '<tr><th>改法</th><th>笔画</th><th>人格</th><th>地格</th><th>总格</th><th>三才</th><th>可选字</th></tr>';
        na.picks.forEach(function (k) {
          nah +=
            '<tr><td>' +
            k.posLabel +
            '</td><td class="strong">' +
            k.strokes +
            ' 画</td>' +
            '<td>' +
            k.ge['人格'] +
            ' <span class="tag ' +
            jClass(k.detail['人格'].ji) +
            '">' +
            k.detail['人格'].ji +
            '</span></td>' +
            '<td>' +
            k.ge['地格'] +
            ' <span class="tag ' +
            jClass(k.detail['地格'].ji) +
            '">' +
            k.detail['地格'].ji +
            '</span></td>' +
            '<td>' +
            k.ge['总格'] +
            ' <span class="tag ' +
            jClass(k.detail['总格'].ji) +
            '">' +
            k.detail['总格'].ji +
            '</span></td>' +
            '<td class="sm">' +
            k.sanCai.level +
            '</td>' +
            '<td class="chars">' +
            (k.chars.length ? k.chars.map(esc).join(' ') : '—') +
            '</td></tr>';
        });
        nat.innerHTML = nah;
        natWrap.appendChild(nat);
        c7b.appendChild(natWrap);
        c7b.appendChild(
          el(
            'div',
            'note',
            '「可选字」只列出本站笔画库中同笔画的常用字，方便你按音、形、义自己挑，不代表这些字都适合入名。改名只在名字上调整，天格（姓）不动。'
          )
        );
      } else {
        c7b.appendChild(el('div', 'note', '在 3–24 画的范围内没有找到同时满足人格、地格不为凶的候选。'));
      }
      c7b.appendChild(
        el(
          'div',
          'note',
          '五格剖象法是近代姓名学流派之一，不同流派对笔画与吉凶的取法并不统一。改名是个人选择，请结合本人意愿、读音字义与户籍规定，不要为了「补数」硬凑生僻字。'
        )
      );
    }
    box.appendChild(c7b);

    /* --- 8. 合婚 --- */
    if (p.partner) {
      var c8 = el('div', 'card');
      c8.appendChild(el('h2', null, '合婚分析'));
      var he = A.hehun(p, p.partner);
      var hbox = el('div', 'grid2');
      hbox.innerHTML =
        '<div>' +
        kv('合婚评分', '<span class="big">' + he.score + ' 分 · ' + he.level + '</span>') +
        kv('年支关系', he.nianHe ? '六合（相合）' : he.nianChong ? '相冲' : '无合无冲') +
        '</div>' +
        '<div>' +
        kv('男方日主', p.dayGanWx + '（' + p.ws.strong + '）') +
        kv('女方日主', p.partner.dayGanWx + '（' + p.partner.ws.strong + '）') +
        '</div>';
      c8.appendChild(hbox);
      var comp = el('div');
      comp.style.marginTop = '14px';
      if (he.complement.length) {
        comp.innerHTML = he.complement
          .map(function (s) {
            return '<div class="kv"><span class="v free">· ' + s + '</span></div>';
          })
          .join('');
      } else {
        comp.innerHTML = '<div class="note">双方五行无明显互补。</div>';
      }
      c8.appendChild(comp);
      c8.appendChild(
        el('div', 'note', '合婚以年支关系与双方五行互补为主，属传统参考维度。感情走向更取决于相处方式与现实条件。')
      );
      box.appendChild(c8);
    }

    /* --- 9. 下一步：把「看完就走」接成可保存、可联系 --- */
    // 结果页原先在最后一块分析后直接进页脚，用户没有任何下一步动作。
    // 这里补上保存（打印）与联系方式，对应 PRD 核心路径第 5 步。
    var cNext = el('div', 'card next');
    cNext.appendChild(el('h2', null, '下一步'));
    cNext.appendChild(
      el(
        'p',
        'next-lead',
        '这份排盘给出的是<b>结构</b>，不是结论。想结合你的实际情况逐条拆解，可以加微信先做<b>前事验证</b>——先看已经发生的事，验不准不收钱。'
      )
    );
    var wx = el('div', 'wx');
    wx.appendChild(el('span', 'wx-label', '微信'));
    wx.appendChild(el('span', 'wx-id', 'ANS_0912'));
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-copy';
    copyBtn.textContent = '复制微信号';
    copyBtn.addEventListener('click', function () {
      var done = function () {
        copyBtn.textContent = '已复制';
        setTimeout(function () {
          copyBtn.textContent = '复制微信号';
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('ANS_0912').then(done, function () {
          copyBtn.textContent = '请手动复制';
        });
      } else {
        copyBtn.textContent = '请手动复制';
      }
    });
    wx.appendChild(copyBtn);
    cNext.appendChild(wx);
    var nbtns = el('div', 'next-actions');
    var bPrint = document.createElement('button');
    bPrint.type = 'button';
    bPrint.className = 'btn-main';
    bPrint.textContent = '保存 / 打印报告';
    bPrint.addEventListener('click', function () {
      window.print();
    });
    var bBack = document.createElement('button');
    bBack.type = 'button';
    bBack.className = 'btn-ghost';
    bBack.textContent = '修改信息重排';
    bBack.addEventListener('click', function () {
      var nameEl = $('name');
      if (nameEl) {
        nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameEl.focus({ preventScroll: true });
      }
    });
    nbtns.appendChild(bPrint);
    nbtns.appendChild(bBack);
    cNext.appendChild(nbtns);
    box.appendChild(cNext);

    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.setAttribute('aria-busy', 'false');
  }

  /* ---------- 事件 ---------- */
  function run() {
    var opt = readForm('', 120);
    if (!opt) {
      alert('请填写完整的出生日期与时间');
      return;
    }
    var p = calc(opt);
    var po = readForm('p_', opt.lng);
    if (po && po.year && !document.getElementById('partnerBox').hidden) {
      var q = calc(po);
      p.partner = q;
      p.partnerInput = po;
    }
    render(p);
  }
  $('go').addEventListener('click', run);
  $('reset').addEventListener('click', function () {
    $('name').value = '';
    $('date').value = '';
    $('time').value = '';
    $('p_name').value = '';
    $('p_date').value = '';
    $('p_time').value = '';
    $('p_lng').value = '';
    $('result').hidden = true;
    $('result').innerHTML = '';
    var ce = $('canvasEmpty');
    if (ce) ce.hidden = false;
  });
  $('demo').addEventListener('click', function () {
    var b = document.getElementById('partnerBox');
    b.hidden = !b.hidden;
  });
  window.__runDemo = run;
})();
