(function () {
  'use strict';
  var R = window.RADAR, app = document.getElementById('app');
  if (!R) { app.textContent = 'data.js did not load.'; return; }
  var C = R.constants, rows = R.rows, live = R.live;
  var catStat = {};
  R.categories.forEach(function (s) { catStat[s.category] = s; });
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) {
    if (n === null || n === undefined) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function x(n, d) { return '×' + n.toFixed(d || 3); }
  function chg(v) {
    if (v === null || v === undefined) return '<span class="flat">—</span>';
    var cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
    return '<span class="chg ' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function badge(rk) {
    var c = rk <= 3 ? ' t' + rk : rk <= 10 ? ' t10' : '';
    return '<span class="badge' + c + '">' + rk + '</span>';
  }
  function cat(r) { return r.category || 'Uncategorized'; }
  function chains(r) {
    var c = r.chains;
    if (!c.length) return '<span class="flat">—</span>';
    var s = esc(c.slice(0, 2).join(', '));
    return '<span title="' + esc(c.join(', ')) + '">' + s + (c.length > 2 ? ' <span class="flat">+' + (c.length - 2) + '</span>' : '') + '</span>';
  }
  function uniq(list, f) {
    var m = {};
    list.forEach(function (r) { f(r).forEach(function (k) { m[k] = (m[k] || 0) + 1; }); });
    return Object.keys(m).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }).map(function (k) { return [k, m[k]]; });
  }
  function opts(pairs, all) {
    return '<option value="">' + all + '</option>' + pairs.map(function (p) { return '<option value="' + esc(p[0]) + '">' + esc(p[0]) + ' (' + p[1] + ')</option>'; }).join('');
  }
  function cmp(key, dir) {
    return function (a, b) {
      var va = a[key], vb = b[key];
      if (va === null || va === undefined) va = dir === 'asc' ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = dir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
      var d = va < vb ? -1 : va > vb ? 1 : 0;
      if (dir === 'desc') d = -d;
      return d || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    };
  }
  function head(cols, st) {
    return '<thead><tr>' + cols.map(function (c) {
      var on = st.key === c[0], s = on ? ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"' : '';
      return '<th class="' + (c[2] ? 'n' : '') + '"' + s + '><button data-sort="' + c[0] + '">' + c[1] + '</button></th>';
    }).join('') + '</tr></thead>';
  }
  function bindSort(st, redraw) {
    app.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-sort');
        if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else { st.key = k; st.dir = (k === 'rank' || k === 'name' || k === 'category') ? 'asc' : 'desc'; }
        redraw();
      };
    });
  }

  // ---------- board ----------
  var B = { key: 'rank', dir: 'asc', q: '', cat: '', chain: '', scope: 'all' };
  var BCOLS = [['rank', 'Rank'], ['name', 'Name'], ['category', 'Category'], ['chains_n', 'Chains'], ['tvl_usd', 'TVL', 1], ['change_7d', '7d growth', 1], ['shift', 'Why it ranks here'], ['implied_value_usd', 'Implied value', 1]];
  rows.forEach(function (r) { r.chains_n = r.chains.length; });

  // ---------- rank reasons, all derived from data.js ----------
  function median(a) { var v = a.slice().sort(function (p, q) { return p - q; }), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; }
  rows.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1); }).forEach(function (r, i) { r.tvl_rank = i + 1; });
  rows.forEach(function (r) { r.shift = r.tvl_rank - r.rank; });
  var FACT = [['category_multiple', 'category', 'Category multiple'], ['growth_multiplier', 'growth', 'Growth'], ['maturity_multiplier', 'maturity', 'Maturity'], ['chain_multiplier', 'chain', 'Chain']];
  var med = {};
  FACT.forEach(function (f) { med[f[0]] = median(rows.map(function (r) { return r.model[f[0]]; })); });
  var catRows = {};
  rows.forEach(function (r) { catRows[cat(r)] = (catRows[cat(r)] || 0) + 1; });
  function pct(v) { return (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%'; }
  function factors(r) {
    return FACT.map(function (f) { var ratio = r.model[f[0]] / med[f[0]]; return { key: f[0], id: f[1], label: f[2], val: r.model[f[0]], med: med[f[0]], ratio: ratio, ln: Math.log(ratio) }; });
  }
  function driver(r) {
    return factors(r).sort(function (a, b) { return Math.abs(b.ln) - Math.abs(a.ln) || (a.id < b.id ? -1 : 1); })[0];
  }
  function ageTxt(r) { return r.model.age_days === null ? 'age unknown' : r.model.age_days + 'd listed'; }
  function whyCell(r) {
    var d = driver(r), s = catStat[cat(r)], up = d.ln >= 0;
    var main = d.id === 'category' ? 'category ×' + d.val.toFixed(2) + ' (n=' + s.n + ') ' + (up ? '>' : '<') + ' med ×' + d.med.toFixed(2) :
      d.id + ' ×' + d.val.toFixed(2) + ' ' + (up ? '>' : '<') + ' med ×' + d.med.toFixed(2);
    var mv = r.shift > 0 ? '<b class="up">▲' + r.shift + '</b>' : r.shift < 0 ? '<b class="down">▼' + (-r.shift) + '</b>' : '<b class="flat">=</b>';
    return '<span class="why1">' + mv + ' ' + esc(main) + '</span><small>TVL #' + r.tvl_rank + ' → rank #' + r.rank + ' · 7d ' + (r.change_7d === null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + ' · ' + (r.model.age_days === null ? 'age ?' : r.model.age_days + 'd') + '</small>';
  }
  function catRead(c) {
    var g = R.global_median, per100 = usd(1e8 * c.multiple), vs = pct(c.multiple / g - 1);
    var blended = c.weight * (c.raw_median === null ? 0 : c.raw_median) + (1 - c.weight) * g, clamped = Math.abs(blended - c.multiple) > 1e-9;
    var tier = c.n === 0 ? 'none' : c.weight < 0.5 ? 'thin' : 'solid';
    var t = c.n === 0 ? 'No live peers: falls back to the global median. ' :
      c.n + ' peer' + (c.n > 1 ? 's' : '') + ' → ' + Math.round(c.weight * 100) + '% own median ×' + c.raw_median.toFixed(2) + ', ' + Math.round((1 - c.weight) * 100) + '% global; ' + (tier === 'thin' ? 'leans on the global median. ' : 'mostly reflects the category. ');
    if (clamped && c.n > 0) t += 'Clamped from ×' + blended.toFixed(2) + ' to the ' + (c.multiple <= C.multiple_min + 1e-9 ? 'floor' : 'cap') + '. ';
    t += '$100M TVL → ' + per100 + ' (' + vs + ' vs global).';
    return { tier: tier, text: t };
  }

  function boardView() {
    var early = R.extra_size;
    app.innerHTML =
      '<section class="stats">' +
      '<div class="stat"><b>' + R.board_size + '</b><span>pre-token protocols ranked</span></div>' +
      '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist (always listed)</span></div>' +
      '<div class="stat"><b>' + early + '</b><span>early: eligible extra rows</span></div>' +
      '<div class="stat"><b>' + usd(rows[0].implied_value_usd) + '</b><span>top implied value · ' + esc(rows[0].name) + '</span></div></section>' +
      '<div class="bar"><input id="q" type="search" placeholder="Search name or slug" aria-label="Search" value="' + esc(B.q) + '">' +
      '<select id="fc" aria-label="Category">' + opts(uniq(rows, function (r) { return [cat(r)]; }), 'All categories') + '</select>' +
      '<select id="fh" aria-label="Chain">' + opts(uniq(rows, function (r) { return r.chains; }), 'All chains') + '</select>' +
      '<div class="seg" id="sc">' + [['all', 'All'], ['watch', 'Watchlist'], ['early', 'Early']].map(function (s) { return '<button data-sc="' + s[0] + '" aria-pressed="' + (B.scope === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>' +
      '<span class="count" id="cnt"></span></div>' +
      '<div class="wrap"><table id="bt"></table></div>' +
      '<p class="hint">Click a row for the model breakdown and farm plan. Click a column header to sort. Rank is by implied value; ties break by slug. “Why it ranks here” names the row’s most unusual model factor against the board median and shows how far rank moved from a pure TVL ordering (▲ up, ▼ down); sort it to see the biggest movers. Pre-token only: live-token protocols are in their own tab.</p>';
    var fc = document.getElementById('fc'), fh = document.getElementById('fh'), q = document.getElementById('q');
    fc.value = B.cat; fh.value = B.chain;
    q.oninput = function () { B.q = q.value; drawBoard(); };
    fc.onchange = function () { B.cat = fc.value; drawBoard(); };
    fh.onchange = function () { B.chain = fh.value; drawBoard(); };
    app.querySelectorAll('[data-sc]').forEach(function (b) {
      b.onclick = function () {
        B.scope = b.getAttribute('data-sc');
        app.querySelectorAll('[data-sc]').forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
        drawBoard();
      };
    });
    drawBoard();
    document.querySelector('.wrap').scrollTop = B.scroll || 0;
  }
  function drawBoard() {
    var q = B.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (B.scope === 'watch' && !r.watchlist) return false;
      if (B.scope === 'early' && r.watchlist) return false;
      if (B.cat && cat(r) !== B.cat) return false;
      if (B.chain && r.chains.indexOf(B.chain) < 0) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0;
    }).sort(cmp(B.key, B.dir));
    document.getElementById('cnt').textContent = list.length + ' of ' + rows.length + ' rows';
    var body = list.length ? list.map(function (r) {
      return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"><td>' + badge(r.rank) + '</td>' +
        '<td class="nm"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') + '</td>' +
        '<td class="mut">' + esc(cat(r)) + '</td><td class="mut">' + chains(r) + '</td>' +
        '<td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.change_7d) + '</td><td class="why">' + whyCell(r) + '</td><td class="n val">' + usd(r.implied_value_usd) + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">No rows match these filters.</td></tr>';
    document.getElementById('bt').innerHTML = head(BCOLS, B) + '<tbody>' + body + '</tbody>';
    bindSort(B, drawBoard);
    document.querySelectorAll('#bt tbody tr[data-slug]').forEach(function (tr) {
      var go = function () { B.scroll = document.querySelector('.wrap').scrollTop; location.hash = '#p/' + tr.getAttribute('data-slug'); };
      tr.onclick = go;
      tr.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
  }

  // ---------- detail ----------
  function track(v, lo, hi) {
    var p = Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    return '<div class="track" title="range ' + lo + ' to ' + hi + '"><i style="left:' + p.toFixed(1) + '%"></i></div>';
  }
  function detailView(slug) {
    var r = bySlug[slug];
    if (!r) { app.innerHTML = '<div class="empty">Unknown protocol. <a href="#board">Back to board</a></div>'; return; }
    var m = r.model, s = catStat[cat(r)];
    var product = r.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier;
    var catNote = s.n === 0 ? 'no live-token peers: global median ' + s.multiple.toFixed(3) :
      'median mcap/TVL ' + s.raw_median.toFixed(3) + ' from ' + s.n + ' live peer' + (s.n > 1 ? 's' : '') + ', weight n/(n+' + C.shrink_k + ') = ' + s.weight.toFixed(3) + ', shrunk toward global ' + R.global_median.toFixed(3);
    var clamped = r.change_7d !== null && r.change_7d !== m.growth_pct;
    var growthNote = r.change_7d === null ? 'no 7d reading, counted as 0%' : '7d change ' + r.change_7d.toFixed(2) + '%' + (clamped ? ', clamped to ' + m.growth_pct + '%' : '') + '; 1 + ' + (m.growth_pct / 100).toFixed(4) + ' × ' + C.growth_weight;
    var ageNote = m.age_days === null ? 'listing date unknown, ' + C.unknown_age_days + ' days assumed' : m.age_days + ' days since listing (as of ' + R.as_of + ')' + (m.age_days > C.maturity_days ? ', capped at ' + C.maturity_days : '');
    var nch = r.chains.length;
    var line = function (op, lbl, small, val, tr) { return '<tr><td class="op">' + op + '</td><td class="lbl"><b>' + lbl + '</b><small>' + small + '</small>' + (tr || '') + '</td><td class="v">' + val + '</td></tr>'; };
    app.innerHTML =
      '<button class="back" id="bk">← Back to board</button>' +
      '<div class="dh">' + badge(r.rank) + '<h2>' + esc(r.name) + '</h2>' + (r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') + '<span class="tag">pre-token</span>' +
      '<div class="big"><b>' + usd(r.implied_value_usd) + '</b><span>implied value · rank ' + r.rank + ' of ' + rows.length + '</span></div></div>' +
      '<div class="grid2"><div>' +
      '<div class="card"><h3>Model breakdown · radar-2</h3><table class="bd"><tbody>' +
      line('', 'TVL', 'DefiLlama snapshot, ' + R.as_of, full(r.tvl_usd)) +
      line('×', 'Category multiple', esc(cat(r)) + ': ' + catNote + '; clamp ' + C.multiple_min + '–' + C.multiple_max, x(m.category_multiple), track(m.category_multiple, C.multiple_min, C.multiple_max)) +
      line('×', 'Growth', growthNote, x(m.growth_multiplier), track(m.growth_multiplier, 1 + C.growth_floor / 100 * C.growth_weight, 1 + C.growth_cap / 100 * C.growth_weight)) +
      line('×', 'Maturity', ageNote, x(m.maturity_multiplier), track(m.maturity_multiplier, C.maturity_floor, C.maturity_floor + C.maturity_range)) +
      line('×', 'Chain', nch + ' chain' + (nch === 1 ? '' : 's') + ': 1 + ' + C.chain_step + ' × clamp(' + nch + ' − 1, 0, ' + C.chain_max_extra + ')', x(m.chain_multiplier), track(m.chain_multiplier, 1, 1 + C.chain_step * C.chain_max_extra)) +
      '<tr class="res"><td class="op">=</td><td class="lbl"><b>Implied value</b><small>unrounded product ' + full(product) + '; rounded, kept within 1 to 1e14</small></td><td class="v">' + full(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table></div>' +
      whyCard(r) +
      '<div class="card"><h3>Basics</h3><dl class="kv"><dt>Slug</dt><dd>' + esc(r.slug) + '</dd><dt>Category</dt><dd>' + esc(cat(r)) + '</dd><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd><dt>7d TVL change</dt><dd>' + chg(r.change_7d) + '</dd><dt>Token</dt><dd>none yet (mcap null)</dd><dt>Board scope</dt><dd>' + (r.watchlist ? 'watchlist' : 'early (eligible extra)') + '</dd></dl>' +
      '<div class="chips">' + r.chains.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' +
      '</div><div class="card"><h3>Farm plan · ' + r.farm_steps.length + ' steps</h3><ol class="steps">' + r.farm_steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></div>';
    document.getElementById('bk').onclick = function () { location.hash = '#board'; };
  }

  function whyCard(r) {
    var fs = factors(r), s = catStat[cat(r)], cr = catRead(s);
    var mv = r.shift > 0 ? 'rises ' + r.shift + ' place' + (r.shift > 1 ? 's' : '') + ' above' : r.shift < 0 ? 'falls ' + (-r.shift) + ' place' + (r.shift < -1 ? 's' : '') + ' below' : 'matches';
    var rowsH = fs.map(function (f) {
      var d = f.ratio - 1, w = Math.min(50, Math.abs(Math.log(f.ratio)) / Math.log(3) * 50);
      return '<li><span class="fl">' + f.label + '</span><span class="fv">×' + f.val.toFixed(3) + ' vs ×' + f.med.toFixed(3) + '</span><span class="dv"><i class="' + (d >= 0 ? 'p' : 'm') + '" style="width:' + w.toFixed(1) + '%;' + (d >= 0 ? 'left:50%' : 'right:50%') + '"></i></span><span class="fd ' + (d >= 0 ? 'up' : 'down') + '">' + pct(d) + '</span></li>';
    }).join('');
    return '<div class="card"><h3>Why rank ' + r.rank + '</h3><p class="lead">TVL ' + usd(r.tvl_usd) + ' is #' + r.tvl_rank + ' of ' + rows.length + '; the model ' + mv + ' that order at #' + r.rank + '. Each factor vs the board median:</p><ul class="fx">' + rowsH + '</ul>' +
      '<p class="note"><b>' + esc(cat(r)) + '</b> (' + (catRows[cat(r)]) + ' board row' + (catRows[cat(r)] > 1 ? 's' : '') + '): ' + esc(cr.text) + '</p></div>';
  }

  // ---------- live ----------
  var L = { key: 'mcap_usd', dir: 'desc', q: '', cat: '' };
  var LCOLS = [['symbol', 'Symbol'], ['name', 'Name'], ['category', 'Category'], ['tvl_usd', 'TVL', 1], ['change_7d', '7d growth', 1], ['mcap_usd', 'Market cap', 1], ['mcap_tvl', 'Mcap / TVL', 1]];
  function liveView() {
    app.innerHTML =
      '<section class="stats"><div class="stat"><b>' + live.length + '</b><span>live-token protocols (mcap reported)</span></div>' +
      '<div class="stat"><b>' + usd(live.reduce(function (a, r) { return a + r.mcap_usd; }, 0)) + '</b><span>combined market cap</span></div>' +
      '<div class="stat"><b>' + R.global_median.toFixed(3) + '</b><span>global median mcap / TVL</span></div>' +
      '<div class="stat"><b>' + R.categories.filter(function (c) { return c.n > 0; }).length + '</b><span>categories with live peers</span></div></section>' +
      '<div class="bar"><input id="lq" type="search" placeholder="Search name, symbol or slug" aria-label="Search" value="' + esc(L.q) + '">' +
      '<select id="lc" aria-label="Category">' + opts(uniq(live, function (r) { return [cat(r)]; }), 'All categories') + '</select><span class="count" id="lcnt"></span></div>' +
      '<div class="wrap"><table id="lt"></table></div>' +
      '<p class="hint">Real market caps from the snapshot, shown as reported. These protocols already have a token, so they are not ranked on the pre-token board; their mcap / TVL ratios are what calibrate the category multiples.</p>';
    var q = document.getElementById('lq'), c = document.getElementById('lc');
    c.value = L.cat;
    q.oninput = function () { L.q = q.value; drawLive(); };
    c.onchange = function () { L.cat = c.value; drawLive(); };
    drawLive();
  }
  function drawLive() {
    var q = L.q.trim().toLowerCase();
    var list = live.filter(function (r) {
      if (L.cat && cat(r) !== L.cat) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0 || (r.symbol || '').toLowerCase().indexOf(q) >= 0;
    }).sort(cmp(L.key, L.dir));
    document.getElementById('lcnt').textContent = list.length + ' of ' + live.length;
    document.getElementById('lt').innerHTML = head(LCOLS, L) + '<tbody>' + list.map(function (r) {
      return '<tr style="cursor:default"><td><b>' + esc(r.symbol || '—') + '</b></td><td class="nm">' + esc(r.name) + '</td><td class="mut">' + esc(cat(r)) + '</td>' +
        '<td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.change_7d) + '</td><td class="n val">' + usd(r.mcap_usd) + '</td><td class="n mut">' + r.mcap_tvl.toFixed(2) + '</td></tr>';
    }).join('') + '</tbody>';
    bindSort(L, drawLive);
  }

  // ---------- model ----------
  function catTable() {
    var list = R.categories.filter(function (c) { return c.n > 0 || catRows[c.category]; }).sort(function (a, b) { return (catRows[b.category] || 0) - (catRows[a.category] || 0) || b.n - a.n || (a.category < b.category ? -1 : 1); });
    var t = { none: 0, thin: 0, solid: 0 };
    list.forEach(function (c) { t[catRead(c).tier]++; });
    return '<div class="tiers"><span class="tier none"><b>' + t.none + '</b> no peers → global median</span><span class="tier thin"><b>' + t.thin + '</b> thin (weight &lt; 50%)</span><span class="tier solid"><b>' + t.solid + '</b> solid (weight ≥ 50%)</span></div>' +
      '<div class="wrap short"><table class="ct"><thead><tr><th class="plain">Category</th><th class="plain n">board rows</th><th class="plain n">n</th><th class="plain n">raw median</th><th class="plain n">weight</th><th class="plain n">multiple</th><th class="plain">What it implies</th></tr></thead><tbody>' +
      list.map(function (c) { var cr = catRead(c); return '<tr class="tr-' + cr.tier + '"><td>' + esc(c.category) + '</td><td class="n">' + (catRows[c.category] || 0) + '</td><td class="n">' + c.n + '</td><td class="n">' + (c.raw_median === null ? '—' : c.raw_median.toFixed(3)) + '</td><td class="n">' + c.weight.toFixed(3) + '</td><td class="n">' + c.multiple.toFixed(3) + '</td><td class="rd">' + esc(cr.text) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function exampleBlock() {
    var r = rows[0], m = r.model, p = r.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier;
    var spread = FACT.map(function (f) { var v = rows.map(function (q) { return q.model[f[0]]; }); return '<tr><td>' + f[2] + '</td><td class="n">' + Math.min.apply(null, v).toFixed(3) + '</td><td class="n">' + median(v).toFixed(3) + '</td><td class="n">' + Math.max.apply(null, v).toFixed(3) + '</td></tr>'; }).join('');
    return '<h2>Worked example: rank 1</h2><div class="formula">' + esc(r.name) + ' (' + esc(cat(r)) + ')\n' + full(r.tvl_usd) + ' × ' + m.category_multiple.toFixed(3) + ' × ' + m.growth_multiplier.toFixed(3) + ' × ' + m.maturity_multiplier.toFixed(3) + ' × ' + m.chain_multiplier.toFixed(3) + ' = ' + full(p) + '</div>' +
      '<p>Spread of each factor across the ' + rows.length + ' board rows. A factor far from its median is what moves a row away from its TVL order; the board column “Why it ranks here” names the largest one.</p>' +
      '<table><thead><tr><th class="plain">Factor</th><th class="plain n">min</th><th class="plain n">median</th><th class="plain n">max</th></tr></thead><tbody>' + spread + '</tbody></table>';
  }
  function modelView() {
    app.innerHTML = '<article class="prose">' +
      '<h2>What the board is</h2><p>Each pre-token protocol gets an <b>implied value</b>: what the market might pay for its token, estimated from how already-tokenised protocols trade against their TVL. Every input is a number in the snapshot (TVL, 7-day TVL change, listing date, chains, and the market caps of live-token peers); no protocol is named in the code. It is a screening heuristic for ordering, not a price forecast.</p>' +
      '<div class="formula">implied = round( TVL × category_multiple × growth × maturity × chain )\nclamped to [1, 1e14]; ranked by implied desc, ties by slug asc</div>' +
      '<h2>Category multiple</h2><p>For every live-token protocol with TVL &gt; 0, take mcap / TVL. The raw category value is the <b>median</b> of that ratio within the category. The global median over all live-token protocols is ' + R.global_median.toFixed(4) + '. Thin categories are shrunk toward it:</p>' +
      '<div class="formula">w = n / (n + ' + C.shrink_k + ')                 n = live-token peers in the category\nmultiple = clamp( w × raw_median + (1 − w) × global_median, ' + C.multiple_min.toFixed(2) + ', ' + C.multiple_max.toFixed(2) + ' )</div>' +
      '<p>With n = 0 the multiple is the global median; n = ' + C.shrink_k + ' gives half weight to the category.</p>' +
      '<p>Notes for every category with live peers or board rows are below; each reading is generated from the snapshot values.</p>' + catTable() +
      exampleBlock() +
      '<h2>Growth, maturity, chain</h2>' +
      '<div class="formula">growth   = 1 + clamp(change_7d, ' + C.growth_floor + ', ' + C.growth_cap + ') / 100 × ' + C.growth_weight + '      (null change counts as 0)\nmaturity = ' + C.maturity_floor + ' + ' + C.maturity_range + ' × min(age_days, ' + C.maturity_days + ') / ' + C.maturity_days + '   (age from listed_at to as_of; unknown = ' + C.unknown_age_days + ' days)\nchain    = 1 + ' + C.chain_step + ' × clamp(chains − 1, 0, ' + C.chain_max_extra + ')</div>' +
      '<p>So growth ranges from ' + (1 + C.growth_floor / 100 * C.growth_weight).toFixed(2) + ' to ' + (1 + C.growth_cap / 100 * C.growth_weight).toFixed(2) + ', maturity from ' + C.maturity_floor + ' (just listed) to ' + (C.maturity_floor + C.maturity_range).toFixed(1) + ' (three years or more), and chain from 1.00 to ' + (1 + C.chain_step * C.chain_max_extra).toFixed(2) + '. Age is measured against the snapshot date (' + R.as_of + '), never the current clock.</p>' +
      '<h2>Which protocols are on the board</h2><ul><li>Every watchlist slug is listed, whatever the rules below say.</li>' +
      '<li>Extra (“early”) rows must have <code>mcap_usd</code>, <code>gecko_id</code> and <code>symbol</code> all null, i.e. no token yet.</li>' +
      '<li>Rule-based exclusions: wrapped, staked, bridged and versioned products (bridge, staking and wrapper categories; names such as wrapped, staked, bridge, LST; version suffixes), CEX-category entries, and exchange brands learned from the CEX names in the snapshot itself.</li>' +
      '<li>Protocols with a market cap are never on the board; they appear in the Live tokens tab at their real mcap.</li>' +
      '<li>Result: ' + R.watchlist_size + ' watchlist + ' + R.extra_size + ' early = ' + R.board_size + ' rows; ' + R.live_size + ' live-token protocols set aside.</li></ul>' +
      '<h2>Farm plan</h2><p>Each row has a ' + rows[0].farm_steps.length + '-step plan with cost and time per step. Sizes are rule-based: capital $50 / $100 / $150 / $250 by TVL (under $25M, $100M, $500M, above), hold period 14 / 30 / 45 / 60 days by age (under 90, 365, 1095 days, older). The action wording follows the category. It is a template for a small, separate wallet, not financial advice.</p>' +
      '<h2>Limits</h2><p>mcap / TVL is a crude comparable, and medians from small samples are noisy, hence the shrinkage and clamp. Growth uses one week of TVL change, so it moves with short-term swings. Chain count rewards reach, not usage. Treat ranks as a starting order for research.</p></article>';
  }

  // ---------- router ----------
  var tabs = document.getElementById('tabs');
  tabs.querySelectorAll('button').forEach(function (b) { b.onclick = function () { location.hash = '#' + b.getAttribute('data-tab'); }; });
  function route() {
    var h = location.hash.replace(/^#/, '') || 'board', tab = h.indexOf('p/') === 0 ? 'board' : h;
    if (['board', 'live', 'model'].indexOf(tab) < 0) { tab = 'board'; h = 'board'; }
    tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab); });
    if (h.indexOf('p/') === 0) detailView(decodeURIComponent(h.slice(2)));
    else if (h === 'live') liveView();
    else if (h === 'model') modelView();
    else boardView();
    if (h.indexOf('p/') === 0) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && location.hash.indexOf('#p/') === 0) location.hash = '#board'; });
  document.getElementById('sub').textContent = 'Snapshot ' + R.as_of + ' · ' + R.source.split(' ')[0] + ' · model ' + R.model_version + ' · ' + R.board_size + ' pre-token rows';
  document.getElementById('foot').textContent = 'Values derive only from the snapshot. No network, no clock. Floor TVL ' + usd(R.floor_usd) + '.';
  route();
})();
