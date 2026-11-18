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
  function fmtPct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtCap(n) { return n === null || n === undefined ? '—' : n < 1000 ? '$' + Math.round(n) : '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; }
  function fmtFee(n) { return n === null || n === undefined ? '—' : '$' + n.toFixed(2); }
  function chg(v) {
    if (v === null || v === undefined) return '<span class="flat">—</span>';
    return '<span class="chg ' + (v > 0 ? 'up' : v < 0 ? 'down' : 'flat') + '">' + fmtPct(v) + '</span>';
  }
  function med(xs) {
    if (!xs.length) return null;
    var a = xs.slice().sort(function (p, q) { return p - q; }), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
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
  function val(r, key) {
    var v = key === 'peak' ? r.econ.peak_cap_usd : key === 'fee' ? r.econ.total_fee_usd : key === 'mins' ? r.econ.total_mins : r[key];
    if (typeof v === 'string') v = v.toLowerCase();
    return v === undefined || v === null || (typeof v === 'number' && !isFinite(v)) ? null : v;
  }
  // null / non-finite always last, either direction; ties: rank asc (board) or mcap desc (live), then slug code units
  function cmp(key, dir, live) {
    return function (a, b) {
      var va = val(a, key), vb = val(b, key), d = 0;
      if (va === null || vb === null) { if (va !== vb) return va === null ? 1 : -1; }
      else { d = va < vb ? -1 : va > vb ? 1 : 0; if (dir === 'desc') d = -d; }
      if (!d) d = live ? b.mcap_usd - a.mcap_usd : a.rank - b.rank;
      return d || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    };
  }
  function head(cols, st) {
    return '<thead><tr>' + cols.map(function (c) {
      var on = st.key === c[0], s = on ? ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"' : '';
      var two = c[3];
      if (two && st.key === two[0]) s = ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"';
      return '<th class="' + (c[2] ? 'n' : '') + '"' + s + (c[4] ? ' title="' + c[4] + '"' : '') + '><button data-sort="' + c[0] + '" class="' + (two ? 'half ' : '') + (on ? 'on' : '') + '">' + c[1] + '</button>' +
        (two ? '<button class="half' + (st.key === two[0] ? ' on' : '') + '" data-sort="' + two[0] + '">' + two[1] + '</button>' : '') + '</th>';
    }).join('') + '</tr></thead>';
  }
  var ASC1 = ['rank', 'name', 'category', 'symbol', 'peak', 'fee', 'mins'];
  function bindSort(st, redraw) {
    app.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-sort');
        if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else { st.key = k; st.dir = ASC1.indexOf(k) >= 0 ? 'asc' : 'desc'; }
        redraw();
      };
    });
  }

  // ---------- board ----------
  var B0 = { key: 'rank', dir: 'asc', q: '', cat: '', chain: '', sig: 'all', cap: 0, mins: 0 };
  var B = Object.assign({}, B0), L0 = { key: 'mcap_usd', dir: 'desc', q: '', cat: '', sig: 'all' };
  var CAPS = [[0, 'Any', 'No peak capital limit'], [100, '≤ $100', 'Peak recoverable working capital up to $100'], [500, '≤ $500', 'Peak recoverable working capital up to $500'], [2000, '≤ $2K', 'Peak recoverable working capital up to $2,000']];
  var TIMES = [[0, 'Any', 'No active execution time limit'], [120, '≤ 2h', 'Total active execution time up to 120 minutes'], [180, '≤ 3h', 'Total active execution time up to 180 minutes']];
  var SIGS = [['all', 'All', ''], ['watch', 'Watchlist', 'Show only the ' + R.watchlist_size + ' tracked watchlist protocols'], ['early', 'Early', 'Show only eligible extra rows'], ['rise', '7d Rising', 'Show only protocols with strictly positive 7-day TVL growth (> 0%)']];
  var BCOLS = [['rank', '#'], ['name', 'Name'], ['category', 'Category'], ['chains_n', 'Chains'], ['tvl_usd', 'TVL', 1], ['tvl_7d_pct', '7d Δ', 1, 0, '7-day snapshot TVL change'], ['implied_value_usd', 'Implied value', 1], ['peak', 'Peak Cap', 1, 0, 'Peak concurrent recoverable capital required'], ['fee', 'Fee', 1, ['mins', 'Time'], 'Fee: total sunk fee burn. Time: total active minutes']];
  function seg(id, list, cur) {
    return '<div class="seg" id="' + id + '">' + list.map(function (o) { return '<button data-v="' + o[0] + '" title="' + o[2] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function econBar(isLive) {
    return '<div class="econ" id="econ">' + (isLive ? '' : '<span class="gl">Max capital</span>' + seg('sg-cap', CAPS, B.cap) + '<span class="gl">Max time</span>' + seg('sg-min', TIMES, B.mins)) +
      '<span class="gl">Signal</span>' + seg('sg-sig', isLive ? [SIGS[0], SIGS[3]] : SIGS, isLive ? L.sig : B.sig) +
      '<span class="ro" id="ro"></span><button class="ghost" id="rst">Reset View</button></div>';
  }
  function bindEcon(st, redraw, base) {
    [['sg-cap', 'cap'], ['sg-min', 'mins'], ['sg-sig', 'sig']].forEach(function (g) {
      var el = document.getElementById(g[0]);
      if (!el) return;
      el.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-v');
          st[g[1]] = g[1] === 'sig' ? v : Number(v);
          el.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
          redraw();
        };
      });
    });
    document.getElementById('rst').onclick = function () { Object.assign(st, base); redraw(true); };
  }
  rows.forEach(function (r) { r.chains_n = r.chains.length; });

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
      '<span class="count" id="cnt"></span></div>' + econBar(false) +
      '<div class="wrap"><table id="bt"></table></div>' +
      '<p class="hint">Click a row for the model breakdown and farm plan. Click a column header to sort. Rank is by implied value; ties break by slug. Pre-token only: live-token protocols are in their own tab.</p>';
    var fc = document.getElementById('fc'), fh = document.getElementById('fh'), q = document.getElementById('q');
    fc.value = B.cat; fh.value = B.chain;
    q.oninput = function () { B.q = q.value; drawBoard(); };
    fc.onchange = function () { B.cat = fc.value; drawBoard(); };
    fh.onchange = function () { B.chain = fh.value; drawBoard(); };
    bindEcon(B, drawBoard, B0);
    drawBoard();
    document.querySelector('.wrap').scrollTop = B.scroll || 0;
  }
  function drawBoard(sync) {
    if (sync) {
      document.getElementById('q').value = B.q; document.getElementById('fc').value = B.cat; document.getElementById('fh').value = B.chain;
      [['sg-cap', B.cap], ['sg-min', B.mins], ['sg-sig', B.sig]].forEach(function (g) {
        document.getElementById(g[0]).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === String(g[1])); });
      });
    }
    var q = B.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (B.sig === 'watch' && !r.watchlist) return false;
      if (B.sig === 'early' && r.watchlist) return false;
      if (B.sig === 'rise' && !(r.tvl_7d_pct > 0)) return false;
      if (B.cap && r.econ.peak_cap_usd > B.cap) return false;
      if (B.mins && r.econ.total_mins > B.mins) return false;
      if (B.cat && cat(r) !== B.cat) return false;
      if (B.chain && r.chains.indexOf(B.chain) < 0) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0;
    }).sort(cmp(B.key, B.dir, false));
    document.getElementById('cnt').textContent = list.length + ' of ' + rows.length + ' rows';
    var mc = med(list.map(function (r) { return r.econ.peak_cap_usd; })), mf = med(list.map(function (r) { return r.econ.total_fee_usd; }));
    document.getElementById('ro').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token' + (list.length ? ' · Med Cap ' + fmtCap(Math.round(mc)) + ' · Med Fee ' + fmtFee(Math.round(mf * 100) / 100) : '');
    var body = list.length ? list.map(function (r) {
      return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"><td>' + badge(r.rank) + '</td>' +
        '<td class="nm"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') + '</td>' +
        '<td class="mut">' + esc(cat(r)) + '</td><td class="mut">' + chains(r) + '</td>' +
        '<td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.tvl_7d_pct) + '</td><td class="n val">' + usd(r.implied_value_usd) + '</td>' +
        '<td class="n">' + fmtCap(r.econ.peak_cap_usd) + '</td><td class="n">' + fmtFee(r.econ.total_fee_usd) + ' · ' + r.econ.total_mins + 'm</td></tr>';
    }).join('') : '<tr><td colspan="9" class="empty"><b>No protocols match the active cohort and execution budget</b><br>Relax Max Capital, Max Time, Signal, or Category/Chain filters to restore matching candidates.<br><button class="ghost amber" id="rst2">Reset All Filters</button></td></tr>';
    document.getElementById('bt').innerHTML = head(BCOLS, B) + '<tbody>' + body + '</tbody>';
    bindSort(B, drawBoard);
    var r2 = document.getElementById('rst2');
    if (r2) r2.onclick = function () { Object.assign(B, B0); drawBoard(true); };
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
  function ledger(r) {
    var e = r.econ, k = e.steps.length, pc = r.tvl_7d_pct === null ? '' : r.tvl_7d_pct > 0 ? 'up' : r.tvl_7d_pct < 0 ? 'down' : 'flat';
    var card = function (l, v, sub, c) { return '<div><span>' + l + '</span><b class="' + (c || '') + '">' + v + '</b><small>' + sub + '</small></div>'; };
    return '<div class="card" id="farm-ledger"><div class="lh"><h3>Farm execution ledger · ' + k + ' steps</h3><span class="cad">' + (e.cadence === 'one-shot' ? 'ONE-SHOT SETUP' : e.cadence.toUpperCase() + ' CADENCE') + '</span></div>' +
      '<div class="sum">' + card('Peak capital', fmtCap(e.peak_cap_usd), 'recoverable lockup') + card('Total fee burn', fmtFee(e.total_fee_usd), 'sunk gas &amp; tolls', 'fee') +
      card('Active time', e.total_mins + ' min', 'across ' + k + ' steps') + card('7d TVL flow', fmtPct(r.tvl_7d_pct), 'snapshot 7d chg', pc) + '</div>' +
      '<table class="ledger"><thead><tr><th>#</th><th>Step action &amp; specification</th><th class="n">Capital</th><th class="n">Fee</th><th class="n">Time</th></tr></thead><tbody>' +
      e.steps.map(function (s, i) {
        var c = s.cap_usd === 0 ? '<span class="flat">—</span>' : s.reused ? '<span class="flat" title="Reuses principal deployed in an earlier step">' + fmtCap(s.cap_usd) + ' ↺</span>' :
          s.additive ? '<span title="Additional concurrent wallet reserve required">+' + fmtCap(s.cap_usd) + '</span>' : fmtCap(s.cap_usd);
        return '<tr><td class="flat">' + s.n + '</td><td class="tx">' + esc(r.farm_steps[i]) + '</td><td class="n">' + c + '</td><td class="n ' + (s.fee_usd ? 'fee' : 'flat') + '">' + fmtFee(s.fee_usd) + '</td><td class="n">' + s.mins + 'm</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="2">TOTAL COMMITMENT (' + k + ' steps)</td><td class="n">' + fmtCap(e.peak_cap_usd) + ' peak</td><td class="n fee">' + fmtFee(e.total_fee_usd) + '</td><td class="n">' + e.total_mins + 'm</td></tr></tfoot></table></div>';
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
      '<div class="card"><h3>Basics</h3><dl class="kv"><dt>Slug</dt><dd>' + esc(r.slug) + '</dd><dt>Category</dt><dd>' + esc(cat(r)) + '</dd><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd><dt>7d TVL change</dt><dd>' + chg(r.tvl_7d_pct) + '</dd><dt>Token</dt><dd>none yet (mcap null)</dd><dt>Board scope</dt><dd>' + (r.watchlist ? 'watchlist' : 'early (eligible extra)') + '</dd></dl>' +
      '<div class="chips">' + r.chains.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' +
      '</div></div>' + ledger(r);
    document.getElementById('bk').onclick = function () { location.hash = '#board'; };
  }

  // ---------- live ----------
  var L = Object.assign({}, L0);
  var LCOLS = [['symbol', 'Symbol'], ['name', 'Name'], ['category', 'Category'], ['tvl_usd', 'TVL', 1], ['tvl_7d_pct', '7d Δ', 1, 0, '7-day snapshot TVL change'], ['mcap_usd', 'Market cap', 1], ['mcap_tvl', 'Mcap / TVL', 1]];
  function liveView() {
    app.innerHTML =
      '<section class="stats"><div class="stat"><b>' + live.length + '</b><span>live-token protocols (mcap reported)</span></div>' +
      '<div class="stat"><b>' + usd(live.reduce(function (a, r) { return a + r.mcap_usd; }, 0)) + '</b><span>combined market cap</span></div>' +
      '<div class="stat"><b>' + R.global_median.toFixed(3) + '</b><span>global median mcap / TVL</span></div>' +
      '<div class="stat"><b>' + R.categories.filter(function (c) { return c.n > 0; }).length + '</b><span>categories with live peers</span></div></section>' +
      '<div class="bar"><input id="lq" type="search" placeholder="Search name, symbol or slug" aria-label="Search" value="' + esc(L.q) + '">' +
      '<select id="lc" aria-label="Category">' + opts(uniq(live, function (r) { return [cat(r)]; }), 'All categories') + '</select><span class="count" id="lcnt"></span></div>' + econBar(true) +
      '<div class="wrap"><table id="lt"></table></div>' +
      '<p class="hint">Real market caps from the snapshot, shown as reported. These protocols already have a token, so they are not ranked on the pre-token board; their mcap / TVL ratios are what calibrate the category multiples.</p>';
    var q = document.getElementById('lq'), c = document.getElementById('lc');
    c.value = L.cat;
    q.oninput = function () { L.q = q.value; drawLive(); };
    c.onchange = function () { L.cat = c.value; drawLive(); };
    bindEcon(L, drawLive, L0);
    drawLive();
  }
  function drawLive(sync) {
    if (sync) {
      document.getElementById('lq').value = L.q; document.getElementById('lc').value = L.cat;
      document.getElementById('sg-sig').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === L.sig); });
    }
    var q = L.q.trim().toLowerCase();
    var list = live.filter(function (r) {
      if (L.sig === 'rise' && !(r.tvl_7d_pct > 0)) return false;
      if (L.cat && cat(r) !== L.cat) return false;
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0 || (r.symbol || '').toLowerCase().indexOf(q) >= 0;
    }).sort(cmp(L.key, L.dir, true));
    document.getElementById('lcnt').textContent = list.length + ' of ' + live.length;
    document.getElementById('ro').textContent = 'Showing ' + list.length + ' of ' + live.length + ' live benchmarks';
    document.getElementById('lt').innerHTML = head(LCOLS, L) + '<tbody>' + list.map(function (r) {
      return '<tr style="cursor:default"><td><b>' + esc(r.symbol || '—') + '</b></td><td class="nm">' + esc(r.name) + '</td><td class="mut">' + esc(cat(r)) + '</td>' +
        '<td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.tvl_7d_pct) + '</td><td class="n val">' + usd(r.mcap_usd) + '</td><td class="n mut">' + r.mcap_tvl.toFixed(2) + '</td></tr>';
    }).join('') + '</tbody>';
    bindSort(L, drawLive);
  }

  // ---------- model ----------
  function modelView() {
    var withPeers = R.categories.filter(function (c) { return c.n > 0; }).sort(function (a, b) { return b.n - a.n || (a.category < b.category ? -1 : 1); }).slice(0, 8);
    app.innerHTML = '<article class="prose">' +
      '<h2>What the board is</h2><p>Each pre-token protocol gets an <b>implied value</b>: what the market might pay for its token, estimated from how already-tokenised protocols trade against their TVL. Every input is a number in the snapshot (TVL, 7-day TVL change, listing date, chains, and the market caps of live-token peers); no protocol is named in the code. It is a screening heuristic for ordering, not a price forecast.</p>' +
      '<div class="formula">implied = round( TVL × category_multiple × growth × maturity × chain )\nclamped to [1, 1e14]; ranked by implied desc, ties by slug asc</div>' +
      '<h2>Category multiple</h2><p>For every live-token protocol with TVL &gt; 0, take mcap / TVL. The raw category value is the <b>median</b> of that ratio within the category. The global median over all live-token protocols is ' + R.global_median.toFixed(4) + '. Thin categories are shrunk toward it:</p>' +
      '<div class="formula">w = n / (n + ' + C.shrink_k + ')                 n = live-token peers in the category\nmultiple = clamp( w × raw_median + (1 − w) × global_median, ' + C.multiple_min.toFixed(2) + ', ' + C.multiple_max.toFixed(2) + ' )</div>' +
      '<p>With n = 0 the multiple is the global median; n = 5 gives half weight to the category. Categories with the most peers:</p>' +
      '<table><thead><tr><th class="plain">Category</th><th class="plain n">peers n</th><th class="plain n">raw median</th><th class="plain n">weight</th><th class="plain n">multiple</th></tr></thead><tbody>' +
      withPeers.map(function (c) { return '<tr><td>' + esc(c.category) + '</td><td class="n">' + c.n + '</td><td class="n">' + c.raw_median.toFixed(3) + '</td><td class="n">' + c.weight.toFixed(3) + '</td><td class="n">' + c.multiple.toFixed(3) + '</td></tr>'; }).join('') + '</tbody></table>' +
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
