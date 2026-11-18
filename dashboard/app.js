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
  function head(cols, st) {
    return '<thead><tr>' + cols.map(function (c) {
      var on = st.key === c[0], s = on ? ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"' : '';
      return '<th class="' + (c[2] ? 'n' : '') + '"' + s + '>' + (c[3] ? c[1] : '<button data-sort="' + c[0] + '">' + c[1] + '</button>') + '</th>';
    }).join('') + '</tr></thead>';
  }
  function bindSort(st, redraw) {
    app.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-sort');
        if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else { st.key = k; st.dir = NAT[k] || 'desc'; }
        redraw();
      };
    });
  }

  // ---------- radar: two regimes (pre / live) sharing one filter bar, never one tbody ----------
  var F = R.facets, GM = F.global_mult, catMult = {};
  F.categories.forEach(function (c) { catMult[c.id] = c.mult; });
  var S = { mode: 'pre', cat: '', chain: '', tier: '', q: '', card: '', pre: { key: 'rank', dir: 'asc' }, liv: { key: 'mcap_usd', dir: 'desc' } };
  var NAT = { rank: 'asc', name: 'asc', cat: 'asc', pc: 'asc' };
  var PCOLS = [['rank', 'Rank'], ['name', 'Protocol'], ['cat', 'Category'], ['pc', 'Chains'], ['tvl_usd', 'TVL', 1], ['change_7d', '7d TVL', 1], ['implied_value_usd', 'Implied value', 1]];
  var LCOLS = [['ord', '#', 1, 1], ['name', 'Live protocol'], ['cat', 'Category'], ['pc', 'Chains'], ['tvl_usd', 'TVL', 1], ['mcap_usd', 'Market cap (live)', 1], ['mcap_tvl', 'Mcap / TVL', 1]];
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sorter(st) {
    return function (a, b) {
      var va = a[st.key], vb = b[st.key], na = va === null || va === undefined, nb = vb === null || vb === undefined;
      if (na || nb) { if (na && nb) return cmpStr(a.slug, b.slug); return na ? 1 : -1; }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      var d = cmpStr(va, vb);
      return (st.dir === 'desc' ? -d : d) || cmpStr(a.slug, b.slug);
    };
  }
  function match(r, mode, noQ) {
    if (S.cat && r.cat !== S.cat) return false;
    if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
    if (mode === 'pre' && S.tier && (S.tier === 'watch') !== r.watchlist) return false;
    var q = noQ ? '' : S.q.trim().toLowerCase();
    return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0 || (mode === 'live' && (r.symbol || '').toLowerCase().indexOf(q) >= 0);
  }
  function nActive() { return (S.cat ? 1 : 0) + (S.chain ? 1 : 0) + (S.tier && S.mode === 'pre' ? 1 : 0) + (S.q.trim() ? 1 : 0); }
  function chainCell(r) { return esc(r.pc) + (r.chains.length > 1 ? ' <span class="pill" title="' + esc(r.chains.join(', ')) + '">+' + (r.chains.length - 1) + '</span>' : ''); }
  function fo(arr, f, all) {
    return '<option value="">' + all + '</option>' + arr.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.id) + ' (' + c.pre + ' pre · ' + c.live + ' live)</option>'; }).join('');
  }
  function mult(v) { return v.toFixed(2) + '×'; }
  function median(list) {
    var a = list.map(function (r) { return r.mcap_tvl; }).sort(function (p, q) { return p - q; }), n = a.length;
    return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null;
  }
  function boardView() {
    var np = rows.length, nl = live.length, wl = R.watchlist_size;
    app.innerHTML =
      '<div class="reg"><button data-m="pre" class="rp"><b>PRE-TOKEN RADAR · ' + np + '</b><small>Implied valuation (snapshot model) · ' + wl + ' watchlist + ' + R.extra_size + ' early</small></button>' +
      '<button data-m="live" class="rl"><b>LIVE-TOKEN BENCHMARKS · ' + nl + '</b><small>Observed market cap · reference comps only, excluded from radar</small></button></div>' +
      '<div class="bar"><select id="f-cat" aria-label="Category">' + fo(F.categories, 0, 'All categories (' + np + ' pre / ' + nl + ' live)') + '</select>' +
      '<select id="f-chain" aria-label="Chain">' + fo(F.chains, 0, 'All chains (' + np + ' pre / ' + nl + ' live)') + '</select>' +
      '<div class="seg" id="f-tier"></div><input id="f-q" type="search" aria-label="Search"><button id="f-reset" class="rst"></button></div>' +
      '<div class="strip" id="strip"></div><div class="wrap"><table id="bt"></table></div><div id="card"></div>' +
      '<p class="hint" id="hint"></p>';
    var fc = document.getElementById('f-cat'), fh = document.getElementById('f-chain'), q = document.getElementById('f-q');
    fc.value = S.cat; fh.value = S.chain; q.value = S.q;
    app.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-m') === 'live' ? '#live' : '#board'; }; });
    q.oninput = function () { S.q = q.value; drawBoard(); };
    fc.onchange = function () { S.cat = fc.value; drawBoard(); };
    fh.onchange = function () { S.chain = fh.value; drawBoard(); };
    document.getElementById('f-reset').onclick = function () { resetAll(); };
    drawBoard();
    document.querySelector('.wrap').scrollTop = S.scroll || 0;
  }
  function resetAll() {
    S.cat = S.chain = S.tier = S.q = '';
    document.getElementById('f-cat').value = ''; document.getElementById('f-chain').value = ''; document.getElementById('f-q').value = '';
    drawBoard();
  }
  function drawBoard() {
    var pre = S.mode === 'pre', main = app;
    main.className = pre ? '' : 'regime-live';
    app.querySelectorAll('[data-m]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode); });
    var tier = document.getElementById('f-tier');
    tier.className = 'seg' + (pre ? '' : ' off');
    tier.innerHTML = pre ? [['', 'All ' + rows.length], ['watch', 'Watchlist ' + R.watchlist_size], ['early', 'Early ' + R.extra_size]].map(function (s) { return '<button data-t="' + s[0] + '" aria-pressed="' + (S.tier === s[0]) + '">' + s[1] + '</button>'; }).join('') : '<span>Tier N/A (live tokens)</span>';
    tier.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { S.tier = b.getAttribute('data-t'); drawBoard(); }; });
    document.getElementById('f-q').placeholder = pre ? 'Filter name or slug…' : 'Filter name, ticker, or slug…';
    var n = nActive(), rs = document.getElementById('f-reset');
    rs.textContent = n ? 'Reset (' + n + ')' : 'Reset'; rs.disabled = !n;
    var st = pre ? S.pre : S.liv, src = pre ? rows : live;
    var list = src.filter(function (r) { return match(r, S.mode); }).sort(sorter(st));
    var oth = (pre ? live : rows).filter(function (r) { return match(r, pre ? 'live' : 'pre', true); }).length;
    var tvl = list.reduce(function (a, r) { return a + r.tvl_usd; }, 0), left, right;
    if (pre) {
      var vw = list.filter(function (r) { return r.watchlist; }).length;
      left = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token protocols (' + vw + ' watchlist, ' + (list.length - vw) + ' early) · Cohort TVL: ' + usd(tvl);
      right = (S.cat ? esc(S.cat) + ' peer multiple ' + mult(catMult[S.cat]) : 'Global anchor median: ' + mult(GM)) + ' · <button id="bridge">' + (S.cat ? 'Compare ' + oth + ' live peers' : 'View ' + oth + ' live comps') + ' →</button>';
    } else {
      var md = median(list);
      left = 'Showing ' + list.length + ' of ' + live.length + ' live-token benchmarks · Cohort TVL: ' + usd(tvl) + ' · Observed median mcap/TVL: ' + (md === null ? '—' : mult(md));
      right = '<button id="bridge">← Compare ' + oth + ' pre-token targets in same filter</button>';
    }
    document.getElementById('strip').innerHTML = '<span>' + left + '</span><span>' + right + '</span>';
    document.getElementById('bridge').onclick = function () { S.mode = pre ? 'live' : 'pre'; S.q = ''; S.card = ''; location.hash = pre ? '#live' : '#board'; };
    var body;
    if (!list.length) {
      var sum = [S.cat && 'Category: ' + S.cat, S.chain && 'Chain: ' + S.chain, pre && S.tier && 'Tier: ' + S.tier, S.q.trim() && 'Search: ' + S.q.trim()].filter(Boolean).join(' · ');
      body = '<tr class="empty-row"><td colspan="7"><b>0 ' + (pre ? 'pre-token protocols' : 'live-token benchmarks') + ' match [' + esc(sum) + '].</b>' +
        (!pre && S.cat ? '<span>Valuation fallback note: radar-2 anchors ' + esc(S.cat) + ' across all chains (peer multiple ' + mult(catMult[S.cat]) + ', shrunk toward global median ' + mult(GM) + ').</span>' : '') +
        '<span>' + (S.chain ? '<button data-clr="chain">Clear chain (' + esc(S.chain) + ')</button> ' : '') + '<button data-clr="all">Reset all filters</button></span></td></tr>';
    } else if (pre) {
      body = list.map(function (r) {
        return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"><td>' + badge(r.rank) + '</td>' +
          '<td class="nm"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') + '</td>' +
          '<td class="mut">' + esc(r.cat) + '</td><td class="mut">' + chainCell(r) + '</td>' +
          '<td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.change_7d) + '</td><td class="n val">' + usd(r.implied_value_usd) + '</td></tr>';
      }).join('');
    } else {
      body = list.map(function (r, i) {
        return '<tr tabindex="0" data-live="' + esc(r.slug) + '"><td class="n mut">' + (i + 1) + '</td><td class="nm"><b>' + esc(r.name) + '</b>' + (r.symbol ? '<span class="tag sym">$' + esc(r.symbol) + '</span>' : '') + '</td>' +
          '<td class="mut">' + esc(r.cat) + '</td><td class="mut">' + chainCell(r) + '</td><td class="n">' + usd(r.tvl_usd) + '</td><td class="n val">' + usd(r.mcap_usd) + '</td><td class="n mut">' + mult(r.mcap_tvl) + '</td></tr>';
      }).join('');
    }
    document.getElementById('bt').innerHTML = head(pre ? PCOLS : LCOLS, st) + '<tbody>' + body + '</tbody>';
    document.getElementById('hint').textContent = pre ? 'Click a row for the model breakdown and farm plan. Global rank stays fixed while filtering; ties break by slug.' : 'Observed market caps from the snapshot: reference comps that calibrate the category multiples. No rank, implied value or farm plan applies to them.';
    var card = document.getElementById('card'), lr = !pre && S.card && bySlugL[S.card];
    card.innerHTML = lr ? '<div class="lcard"><b>' + esc(lr.name) + (lr.symbol ? ' $' + esc(lr.symbol) : '') + '</b> · ' + esc(lr.cat) + ' · market cap ' + full(lr.mcap_usd) + ' · TVL ' + full(lr.tvl_usd) + ' · observed mcap/TVL ' + mult(lr.mcap_tvl) + ' · ' + esc(lr.chains.join(', ')) + ' <button id="cx">Close</button></div>' : '';
    if (lr) document.getElementById('cx').onclick = function () { S.card = ''; drawBoard(); };
    bindSort(st, drawBoard);
    app.querySelectorAll('[data-clr]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('data-clr') === 'chain') { S.chain = ''; document.getElementById('f-chain').value = ''; drawBoard(); } else resetAll(); }; });
    app.querySelectorAll('#bt tbody tr[data-live]').forEach(function (tr) {
      var go = function () { S.card = tr.getAttribute('data-live'); drawBoard(); };
      tr.onclick = go; tr.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
    app.querySelectorAll('#bt tbody tr[data-slug]').forEach(function (tr) {
      var go = function () { S.scroll = document.querySelector('.wrap').scrollTop; location.hash = '#p/' + tr.getAttribute('data-slug'); };
      tr.onclick = go;
      tr.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
  }
  var bySlugL = {};
  live.forEach(function (r) { bySlugL[r.slug] = r; });

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
      '<div class="card"><h3>Basics</h3><dl class="kv"><dt>Slug</dt><dd>' + esc(r.slug) + '</dd><dt>Category</dt><dd>' + esc(cat(r)) + '</dd><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd><dt>7d TVL change</dt><dd>' + chg(r.change_7d) + '</dd><dt>Token</dt><dd>none yet (mcap null)</dd><dt>Board scope</dt><dd>' + (r.watchlist ? 'watchlist' : 'early (eligible extra)') + '</dd></dl>' +
      '<div class="chips">' + r.chains.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' +
      '</div><div class="card"><h3>Farm plan · ' + r.farm_steps.length + ' steps</h3><ol class="steps">' + r.farm_steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></div>';
    document.getElementById('bk').onclick = function () { location.hash = '#board'; };
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
    var h = location.hash.replace(/^#/, '') || 'board', tab = h.indexOf('p/') === 0 || h === 'live' ? 'board' : h;
    if (['board', 'live', 'model'].indexOf(tab) < 0) { tab = 'board'; h = 'board'; }
    app.className = '';
    if (h === 'live' || h === 'board') S.mode = h === 'live' ? 'live' : 'pre';
    tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab); });
    if (h.indexOf('p/') === 0) detailView(decodeURIComponent(h.slice(2)));
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
