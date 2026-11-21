(function () {
  'use strict';
  var R = window.RADAR, app = document.getElementById('app');
  if (!R) { app.textContent = 'data.js did not load.'; return; }
  var C = R.constants, rows = R.rows, live = R.live, F = R.facets, GM = F.global_mult;
  var catStat = {}, catMult = {}, bySlug = {}, bySlugL = {};
  R.categories.forEach(function (s) { catStat[s.category] = s; });
  F.categories.forEach(function (c) { catMult[c.id] = c.mult; });
  // flat sort keys; every value was computed by the build, the browser only reads it
  rows.forEach(function (r) {
    bySlug[r.slug] = r; r.peak = r.econ.peak_cap_usd; r.fee = r.econ.total_fee_usd; r.mins = r.econ.total_mins;
    r.mult = r.drivers.mult; r.grw = r.drivers.growth_pct; r.age = r.drivers.age_days;
  });
  live.forEach(function (r) { bySlugL[r.slug] = r; });

  // ---------- one set of formatters (fixed en-US style, no locale lookups) ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function none(v) { return v === null || v === undefined || v !== v; }
  function comma(s) { return String(s).replace(/\B(?=(\d{3})+$)/g, ','); }
  function usd(n) {
    if (none(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) { return '$' + comma(Math.round(n)); }
  function cap(n) { return none(n) ? '—' : n < 1000 ? '$' + n : '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; }
  function fee(n) { return none(n) ? '—' : '$' + n.toFixed(2); }
  function x(n, d) { return '×' + n.toFixed(d || 3); }
  function mult(v) { return v.toFixed(2) + '×'; }
  function fMult(v) { return none(v) ? null : (v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v))) + 'x'; }
  function fGrow(v, d) { if (none(v)) return null; var t = Math.abs(v).toFixed(d || 0); if (!d) t = comma(t); return (v < 0 && Number(t) !== 0 ? '-' : '+') + t + '%'; }
  function fAge(d) { return none(d) ? null : d < 365 ? d + 'd' : (d / 365).toFixed(1) + 'y'; }
  function tone(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
  function chg(v) { return none(v) ? '<span class="flat">—</span>' : '<span class="chg ' + tone(v) + '">' + fGrow(v, 1) + '</span>'; }
  function badge(rk) { return '<span class="badge' + (rk <= 3 ? ' t' + rk : rk <= 10 ? ' t10' : '') + '">' + rk + '</span>'; }
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function med(list) {
    var a = list.slice().sort(function (p, q) { return p - q; }), n = a.length;
    return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null;
  }
  function chainCell(r) { return esc(r.pc) + (r.chains.length > 1 ? ' <span class="pill" title="' + esc(r.chains.join(', ')) + '">+' + (r.chains.length - 1) + '</span>' : ''); }
  function nm(r, sub) { return '<td class="nm"><b>' + esc(r.name) + '</b>' + sub + '</td>'; }

  // ---------- evidence cells (v6): precomputed drivers, formatted only ----------
  var MISS = '<span class="ev-miss" title="Data not in snapshot">—</span>';
  function ev(cls, title, inner) { return '<td class="ev ' + cls + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + inner + '</td>'; }
  function evCells(r) {
    var D = r.drivers, m = fMult(D.mult), g = fGrow(D.growth_pct), a = fAge(D.age_days);
    return (m === null ? ev('', '', MISS) : ev(D.mult < 1 ? 'm-lo' : D.mult < 10 ? '' : D.mult < 50 ? 'm-mid' : 'm-hi', 'Multiple: implied value ' + usd(r.implied_value_usd) + ' / TVL ' + usd(r.tvl_usd) + ' = ' + m + ' T. Peer multiple (' + r.cat + '): ' + D.mult_peer_median.toFixed(2) + 'x T.', m + ' T')) +
      (g === null ? ev('f', '', MISS) : ev('f ' + (g === '+0%' ? 'flat' : tone(D.growth_pct)), '7d change in TVL: ' + fGrow(D.growth_pct, 1) + ' (' + usd(D.growth_start) + ' to ' + usd(D.growth_end) + '). Same base as Mult (TVL).', g)) +
      (a === null ? ev('', '', MISS) : ev('', 'Age: ' + D.age_days + ' days from listing ' + D.age_launch_date + ' to snapshot ' + R.as_of + '. Age factor ' + D.age_factor.toFixed(2) + 'x.', '<i class="ab" style="height:' + (Math.min(D.age_days / 730, 1) * 12).toFixed(1) + 'px"></i>' + a));
  }

  // ---------- table head, sort ----------
  // column: [key, label, numeric, title, class, key2, label2]; key null = not sortable
  function head(cols, st) {
    return '<thead><tr>' + cols.map(function (c) {
      var on = st.key === c[0] || (c[5] && st.key === c[5]), btn = function (k, l, half) { return '<button' + (half ? ' class="half' + (st.key === k ? ' on' : '') + '"' : st.key === k ? ' class="on"' : '') + ' data-sort="' + k + '">' + l + '</button>'; };
      return '<th class="' + (c[2] ? 'n' : '') + (c[4] ? ' ' + c[4] : '') + '"' + (c[3] ? ' title="' + esc(c[3]) + '"' : '') + (on ? ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' +
        (c[0] === null ? '<span style="padding:10px 12px;display:block">' + c[1] + '</span>' : c[5] ? btn(c[0], c[1], 1) + btn(c[5], c[6], 1) : btn(c[0], c[1])) + '</th>';
    }).join('') + '</tr></thead>';
  }
  var NAT = { rank: 'asc', name: 'asc', cat: 'asc', pc: 'asc', peak: 'asc', fee: 'asc', mins: 'asc' };
  function bindSort(st) {
    app.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-sort');
        if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.key = k; st.dir = NAT[k] || 'desc'; }
        drawBoard();
      };
    });
  }
  // null last in both directions; ties: rank then slug (pre-token) or market cap desc then slug (live)
  function sorter(st, pre) {
    return function (a, b) {
      var va = a[st.key], vb = b[st.key], na = none(va), nb = none(vb), d = 0;
      if (na !== nb) return na ? 1 : -1;
      if (!na) { if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); } d = cmpStr(va, vb); if (st.dir === 'desc') d = -d; }
      return d || (pre ? a.rank - b.rank : b.mcap_usd - a.mcap_usd) || cmpStr(a.slug, b.slug);
    };
  }

  // ---------- radar: two regimes (pre / live) sharing one filter bar, never one tbody ----------
  var S0 = { cat: '', chain: '', tier: '', q: '', cap: 0, mins: 0, sig: 'all' };
  var S = { mode: 'pre', card: '', scroll: 0, sel: { pre: '', live: '' }, pre: { key: 'rank', dir: 'asc' }, liv: { key: 'mcap_usd', dir: 'desc' } };
  Object.assign(S, S0);
  var CAPS = [[0, 'Any', 'No peak capital limit'], [100, '≤ $100', 'Peak recoverable working capital up to $100'], [150, '≤ $150', 'Peak recoverable working capital up to $150'], [300, '≤ $300', 'Peak recoverable working capital up to $300']];
  var TIMES = [[0, 'Any', 'No active execution time limit'], [130, '≤ 130m', 'Total active execution time up to 130 minutes'], [160, '≤ 160m', 'Total active execution time up to 160 minutes']];
  var SIGS = [['all', 'All', 'No momentum filter'], ['rise', '7d Rising', 'Only protocols with strictly positive 7-day TVL growth (> 0%)']];
  var V = { cap: CAPS, mins: TIMES, sig: SIGS };
  function enc() { return Object.keys(S0).filter(function (k) { return S[k] !== S0[k]; }).map(function (k) { return k + '=' + encodeURIComponent(S[k]); }).join('&'); }
  function dec(t) {
    var r = Object.assign({}, S0), seen = {};
    t.split('&').forEach(function (p) {
      var i = p.indexOf('='), k, v, n, ok;
      if (i < 0) return;
      try { k = decodeURIComponent(p.slice(0, i)); v = decodeURIComponent(p.slice(i + 1)); } catch (x) { return; }
      if (seen[k] || !S0.hasOwnProperty(k)) return;
      n = Number(v);
      ok = k === 'q' || (V[k] ? V[k].some(function (o) { return o[0] === (k === 'sig' ? v : n); }) : k === 'tier' ? ['', 'watch', 'early'].indexOf(v) >= 0 : F[k === 'cat' ? 'categories' : 'chains'].some(function (c) { return c.id === v; }));
      if (!ok) return;
      seen[k] = 1; r[k] = k === 'q' ? v.trim().slice(0, 64) : k === 'cap' || k === 'mins' ? n : v;
    });
    return r;
  }
  var PCOLS = [['rank', '#', 0, 'Global rank by implied value; filters never renumber it'], ['name', 'Protocol'], ['cat', 'Category'], ['pc', 'Chains'], ['tvl_usd', 'TVL', 1], ['tvl_7d_pct', '7d Δ', 1, '7-day snapshot TVL change'],
    ['mult', 'Mult', 1, 'Mult: implied value / TVL (T = TVL base)', 'ev f'], ['grw', 'Grw 7d', 1, 'Growth: 7d change in the same base (TVL); the snapshot has no 30d field', 'ev'], ['age', 'Age', 1, 'Age: days since listing, measured at the snapshot date', 'ev'],
    ['implied_value_usd', 'Implied val', 1, 'Implied value (radar-2)', 'f'], ['peak', 'Peak cap', 1, 'Peak concurrent recoverable capital required'], ['fee', 'Fee', 1, 'Fee: total sunk fee burn. Time: total active minutes', '', 'mins', 'Time']];
  var LCOLS = [[null, '#', 1], ['name', 'Live protocol'], ['cat', 'Category'], ['pc', 'Chains'], ['tvl_usd', 'TVL', 1], ['tvl_7d_pct', '7d Δ', 1, '7-day snapshot TVL change'], ['mcap_usd', 'Market cap (live)', 1], ['mcap_tvl', 'Mcap / TVL', 1]];

  function match(r, mode, noQ) {
    if (S.cat && r.cat !== S.cat) return false;
    if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
    if (S.sig === 'rise' && !(r.tvl_7d_pct > 0)) return false;
    if (mode === 'pre' && ((S.tier && (S.tier === 'watch') !== r.watchlist) || (S.cap && r.peak > S.cap) || (S.mins && r.mins > S.mins))) return false;
    var q = noQ ? '' : S.q.trim().toLowerCase();
    return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0 || (mode === 'live' && (r.symbol || '').toLowerCase().indexOf(q) >= 0);
  }
  function nActive() { return (S.cat ? 1 : 0) + (S.chain ? 1 : 0) + (S.tier && S.mode === 'pre' ? 1 : 0) + (S.q.trim() ? 1 : 0); }
  function fo(arr, all) { return '<option value="">' + all + '</option>' + arr.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.id) + ' (' + c.pre + ' pre · ' + c.live + ' live)</option>'; }).join(''); }
  function seg(g, list, cur) { return '<div class="seg">' + list.map(function (o) { return '<button data-g="' + g + '" data-v="' + o[0] + '" title="' + o[2] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function resetView(all) {
    var keep = all ? {} : { cap: 1, mins: 1, sig: 1 };
    Object.keys(S0).forEach(function (k) { if (!keep[k]) S[k] = S0[k]; });
    if (all) { S.pre = { key: 'rank', dir: 'asc' }; S.liv = { key: 'mcap_usd', dir: 'desc' }; S.card = ''; S.sel = { pre: '', live: '' }; }
    drawBoard();
  }

  function boardView() {
    var np = rows.length, nl = live.length;
    app.innerHTML = '<div class="ctl" id="ctl">' +
      '<div class="reg"><button data-m="pre" class="rp"><b>PRE-TOKEN RADAR · ' + np + '</b><small>Implied valuation (snapshot model) · ' + R.watchlist_size + ' watchlist + ' + R.extra_size + ' early</small></button>' +
      '<button data-m="live" class="rl"><b>LIVE-TOKEN BENCHMARKS · ' + nl + '</b><small>Observed market cap · reference comps only, excluded from radar</small></button></div>' +
      '<div class="bar"><select id="f-cat" aria-label="Category">' + fo(F.categories, 'All categories (' + np + ' pre / ' + nl + ' live)') + '</select>' +
      '<select id="f-chain" aria-label="Chain">' + fo(F.chains, 'All chains (' + np + ' pre / ' + nl + ' live)') + '</select>' +
      '<div class="seg" id="f-tier"></div><input id="f-q" type="search" aria-label="Search"><button id="f-reset" class="rst"></button></div>' +
      '<div class="econ" id="econ"></div><div class="strip" id="strip"></div></div><div class="wrap"><table id="bt"></table></div><div id="card"></div><p class="hint" id="hint"></p>';
    app.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { location.hash = b.getAttribute('data-m') === 'live' ? '#live' : '#board'; }; });
    document.getElementById('f-q').oninput = function () { S.q = this.value; drawBoard(); };
    document.getElementById('f-cat').onchange = function () { S.cat = this.value; drawBoard(); };
    document.getElementById('f-chain').onchange = function () { S.chain = this.value; drawBoard(); };
    document.getElementById('f-reset').onclick = function () { resetView(0); };
    var click = function (e) {
      var b = e.target.closest('button[data-g]'), pb = e.target.closest('button[data-p]');
      if (pb) { Object.assign(S, R.presets.filter(function (p) { return p.id === pb.getAttribute('data-p'); })[0].state); drawBoard(); }
      else if (b) { var g = b.getAttribute('data-g'), v = b.getAttribute('data-v'); S[g] = g === 'cap' || g === 'mins' ? Number(v) : v; drawBoard(); }
      else if (e.target.id === 'rst') resetView(1);
    };
    document.getElementById('f-tier').onclick = click; document.getElementById('econ').onclick = click;
    drawBoard();
    window.scrollTo(0, S.scroll || 0);
    var cur = S.sel[S.mode] && app.querySelector('#bt tr.sel');
    if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'nearest' }); }
  }
  // ---------- keyboard selection: state is a slug per regime, never a clock or random value ----------
  function syncCtl() { var c = document.getElementById('ctl'); if (c) document.documentElement.style.setProperty('--ctlh', c.offsetHeight + 'px'); }
  function rowsEl() { return Array.prototype.slice.call(app.querySelectorAll('#bt tbody tr[data-slug],#bt tbody tr[data-live]')); }
  function rowKey(tr) { return tr.getAttribute('data-slug') || tr.getAttribute('data-live'); }
  function select(tr, focus) {
    var prev = app.querySelector('#bt tr.sel');
    if (prev) { prev.classList.remove('sel'); prev.removeAttribute('aria-selected'); }
    tr.classList.add('sel'); tr.setAttribute('aria-selected', 'true'); S.sel[S.mode] = rowKey(tr);
    if (focus) { tr.focus({ preventScroll: true }); tr.scrollIntoView({ block: 'nearest' }); }
  }
  function openRow(tr) {
    select(tr, 0);
    if (tr.hasAttribute('data-live')) { S.card = tr.getAttribute('data-live'); drawBoard(); var t = app.querySelector('#bt tr.sel'); if (t) t.focus({ preventScroll: true }); return; }
    S.scroll = window.scrollY; location.hash = '#p/' + tr.getAttribute('data-slug');
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName, typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA', k = e.key;
    var board = !!document.getElementById('bt'), q = document.getElementById('f-q');
    if (k === 'Escape') {
      if (location.hash.indexOf('#p/') === 0) { location.hash = '#board'; return; }
      if (!board) return;
      if (t === q) { if (q.value) { S.q = ''; drawBoard(); } else q.blur(); return; }
      if (S.card) { S.card = ''; drawBoard(); }
      return;
    }
    if (!board) return;
    var list = rowsEl(), i = list.indexOf(app.querySelector('#bt tr.sel')), step = 0;
    if (k === '/' && !typing) { e.preventDefault(); q.focus(); q.select(); return; }
    if (t === q && k === 'ArrowDown' && list.length) { e.preventDefault(); select(list[i < 0 ? 0 : i], 1); return; }
    if (typing) return;
    if (k === 'ArrowDown' || k === 'j') step = 1; else if (k === 'ArrowUp' || k === 'k') step = -1;
    else if (k === 'Home' || k === 'End') step = k === 'Home' ? -1e9 : 1e9;
    else if (k === 'Enter' && tag !== 'BUTTON' && tag !== 'TR' && tag !== 'A' && i >= 0) { openRow(list[i]); return; }
    if (!step || !list.length) return;
    e.preventDefault();
    select(list[Math.max(0, Math.min(list.length - 1, i < 0 ? (step > 0 ? 0 : list.length - 1) : i + step))], 1);
  }
  function drawBoard() {
    var pre = S.mode === 'pre', st = pre ? S.pre : S.liv, src = pre ? rows : live;
    app.className = pre ? '' : 'regime-live';
    app.querySelectorAll('[data-m]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode); });
    document.getElementById('f-cat').value = S.cat; document.getElementById('f-chain').value = S.chain;
    var qi = document.getElementById('f-q'); if (qi.value !== S.q) qi.value = S.q;
    qi.placeholder = pre ? 'Filter name or slug…' : 'Filter name, ticker, or slug…';
    var tier = document.getElementById('f-tier');
    tier.className = 'seg' + (pre ? '' : ' off');
    tier.innerHTML = pre ? [['', 'All ' + rows.length], ['watch', 'Watchlist ' + R.watchlist_size], ['early', 'Early ' + R.extra_size]].map(function (s) { return '<button data-g="tier" data-v="' + s[0] + '" aria-pressed="' + (S.tier === s[0]) + '">' + s[1] + '</button>'; }).join('') : '<span>Tier N/A (live tokens)</span>';
    var n = nActive(), rs = document.getElementById('f-reset');
    rs.textContent = n ? 'Reset (' + n + ')' : 'Reset'; rs.disabled = !n;
    var list = src.filter(function (r) { return match(r, S.mode); }).sort(sorter(st, pre));
    var oth = (pre ? live : rows).filter(function (r) { return match(r, pre ? 'live' : 'pre', 1); }).length;
    var tvl = list.reduce(function (a, r) { return a + r.tvl_usd; }, 0), left, right, ro;
    if (pre) {
      var vw = list.filter(function (r) { return r.watchlist; }).length, mc = med(list.map(function (r) { return r.peak; })), mf = med(list.map(function (r) { return r.fee; }));
      left = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token protocols (' + vw + ' watchlist, ' + (list.length - vw) + ' early) · Cohort TVL: ' + usd(tvl);
      right = (S.cat ? esc(S.cat) + ' peer multiple ' + mult(catMult[S.cat]) : 'Global anchor median: ' + mult(GM)) + ' · <button id="bridge">' + (S.cat ? 'Compare ' + oth + ' live peers' : 'View ' + oth + ' live comps') + ' →</button>';
      ro = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token' + (list.length ? ' · Med Cap ' + cap(Math.round(mc)) + ' · Med Fee ' + fee(Math.round(mf * 100) / 100) : '');
    } else {
      var md = med(list.map(function (r) { return r.mcap_tvl; }));
      left = 'Showing ' + list.length + ' of ' + live.length + ' live-token benchmarks · Cohort TVL: ' + usd(tvl) + ' · Observed median mcap/TVL: ' + (md === null ? '—' : mult(md));
      right = '<button id="bridge">← Compare ' + oth + ' pre-token targets in same filter</button>';
      ro = 'Showing ' + list.length + ' of ' + live.length + ' live benchmarks';
    }
    var mp = (R.presets.filter(function (p) { return Object.keys(S0).every(function (k) { return p.state[k] === S[k]; }); })[0] || {}).id;
    document.getElementById('econ').innerHTML = (pre ? '<span class="gl">Presets</span><div class="seg">' + R.presets.map(function (p) { return '<button data-p="' + esc(p.id) + '" title="' + esc(p.hint) + '" aria-pressed="' + (mp === p.id) + '">' + esc(p.label) + '</button>'; }).join('') + '</div><span class="gl">Max capital</span>' + seg('cap', CAPS, S.cap) + '<span class="gl">Max time</span>' + seg('mins', TIMES, S.mins) : '') +
      '<span class="gl">Signal</span>' + seg('sig', SIGS, S.sig) + '<span class="ro">' + ro + '</span><button class="ghost" id="rst">Reset View</button>';
    document.getElementById('strip').innerHTML = '<span>' + left + '</span><span>' + right + '</span>';
    document.getElementById('bridge').onclick = function () { S.mode = pre ? 'live' : 'pre'; S.q = ''; S.card = ''; location.hash = pre ? '#live' : '#board'; };
    var body;
    if (!list.length) {
      var sum = [S.cat && 'Category: ' + S.cat, S.chain && 'Chain: ' + S.chain, pre && S.tier && 'Tier: ' + S.tier, pre && S.cap && 'Max capital: ' + cap(S.cap), pre && S.mins && 'Max time: ' + S.mins + 'm', S.sig === 'rise' && 'Signal: 7d Rising', S.q.trim() && 'Search: ' + S.q.trim()].filter(Boolean).join(' · ');
      body = '<tr><td colspan="' + (pre ? 12 : 8) + '" class="empty"><b>0 ' + (pre ? 'pre-token protocols' : 'live-token benchmarks') + ' match [' + esc(sum) + '].</b><br>Relax Max Capital, Max Time, Signal, or Category/Chain filters to restore matching candidates.' +
        (!pre && S.cat ? '<br>Valuation fallback note: radar-2 anchors ' + esc(S.cat) + ' across all chains (peer multiple ' + mult(catMult[S.cat]) + ', shrunk toward global median ' + mult(GM) + ').' : '') +
        '<br>' + (S.chain ? '<button class="ac" data-clr="chain">Clear chain (' + esc(S.chain) + ')</button>' : '') + '<button class="ac" data-clr="all">Reset all filters</button>' + (pre ? '<button class="ac" data-clr="all">Back to All targets preset</button>' : '') + '</td></tr>';
    } else if (pre) {
      body = list.map(function (r) {
        return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"><td>' + badge(r.rank) + '</td>' + nm(r, r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') +
          '<td class="mut">' + esc(r.cat) + '</td><td class="mut nw">' + chainCell(r) + '</td><td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.tvl_7d_pct) + '</td>' + evCells(r) +
          '<td class="n val f">' + usd(r.implied_value_usd) + '</td><td class="n">' + cap(r.peak) + '</td><td class="n nw">' + fee(r.fee) + ' · ' + r.mins + 'm</td></tr>';
      }).join('');
    } else {
      body = list.map(function (r, i) {
        return '<tr tabindex="0" data-live="' + esc(r.slug) + '"><td class="n mut">' + (i + 1) + '</td>' + nm(r, r.symbol ? '<span class="tag sym">$' + esc(r.symbol) + '</span>' : '') +
          '<td class="mut">' + esc(r.cat) + '</td><td class="mut nw">' + chainCell(r) + '</td><td class="n">' + usd(r.tvl_usd) + '</td><td class="n">' + chg(r.tvl_7d_pct) + '</td><td class="n val">' + usd(r.mcap_usd) + '</td><td class="n mut">' + mult(r.mcap_tvl) + '</td></tr>';
      }).join('');
    }
    document.getElementById('bt').innerHTML = head(pre ? PCOLS : LCOLS, st) + '<tbody>' + body + '</tbody>';
    document.getElementById('hint').textContent = pre ? 'Click a row for the evidence, execution ledger and farm plan. Global rank stays fixed while filtering; ties break by rank, then slug. Null values sort last.' : 'Observed market caps from the snapshot: reference comps that calibrate the category multiples. No rank, implied value or farm plan applies to them.';
    var lr = !pre && S.card && bySlugL[S.card];
    document.getElementById('card').innerHTML = lr ? '<div class="lcard"><b>' + esc(lr.name) + (lr.symbol ? ' $' + esc(lr.symbol) : '') + '</b> · ' + esc(lr.cat) + ' · market cap ' + full(lr.mcap_usd) + ' · TVL ' + full(lr.tvl_usd) + ' · observed mcap/TVL ' + mult(lr.mcap_tvl) + ' · 7d ' + chg(lr.tvl_7d_pct) + ' · ' + esc(lr.chains.join(', ')) + ' <button id="cx">Close</button></div>' : '';
    if (lr) document.getElementById('cx').onclick = function () { S.card = ''; drawBoard(); };
    bindSort(st);
    app.querySelectorAll('[data-clr]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('data-clr') === 'chain') { S.chain = ''; drawBoard(); } else resetView(1); }; });
    app.querySelectorAll('#bt tbody tr[data-slug],#bt tbody tr[data-live]').forEach(function (tr) {
      if (S.sel[S.mode] === rowKey(tr)) { tr.classList.add('sel'); tr.setAttribute('aria-selected', 'true'); }
      tr.onclick = function () { openRow(tr); }; tr.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); openRow(tr); } };
    });
    var qs = enc();
    history.replaceState(null, '', (pre ? '#board' : '#live') + (qs ? '?' + qs : ''));
    syncCtl();
  }

  // ---------- detail: why it ranks here, execution ledger, model breakdown ----------
  function track(v, lo, hi) {
    var p = Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    return '<div class="track" title="range ' + lo + ' to ' + hi + '"><i style="left:' + p.toFixed(1) + '%"></i></div>';
  }
  function whyStrip(r) {
    var D = r.drivers, mu = fMult(D.mult), gr = fGrow(D.growth_pct, 1), ag = fAge(D.age_days);
    var ratio = D.mult !== null ? D.mult / D.mult_peer_median : null;
    var card = function (lbl, big, lines, note) { return '<div class="why"><span>' + lbl + '</span><b>' + big + '</b>' + lines.map(function (l) { return '<small>' + esc(l) + '</small>'; }).join('') + '<em>' + esc(note) + '</em></div>'; };
    var take = 'Ranks #' + r.rank + ' because it is a ' + (D.age_days !== null && D.age_days >= 365 ? 'proven' : D.age_days !== null && D.age_days < 90 ? 'very young' : 'maturing') + ' ' + r.cat + ' protocol' +
      (D.age_days !== null ? ' (' + ag + ')' : '') + (gr !== null ? (D.growth_pct < 0 ? ' despite shrinking ' + fGrow(D.growth_pct) : ' with TVL ' + fGrow(D.growth_pct) + ' over 7d') : ' with no 7d reading') +
      (mu !== null ? ', valued at ' + mu + ' TVL (' + ratio.toFixed(2) + '× its peer multiple' + (ratio > 1.3 ? ', trading at a premium to peers' : '') + ')' : '') +
      (D.age_days !== null && D.age_days < 90 ? '; very young, so the age factor (' + D.age_factor.toFixed(2) + '×) penalises it' : '') + '.';
    return '<div class="whyrow">' +
      card('Multiple', mu === null ? '—' : mu + ' T', ['Implied value ' + usd(r.implied_value_usd), 'Base (TVL) ' + usd(r.tvl_usd), 'Peer multiple (' + r.cat + ') ' + D.mult_peer_median.toFixed(2) + 'x T', 'Global median ' + D.mult_category_median.toFixed(2) + 'x T'], ratio === null ? 'Data not in snapshot' : 'Multiple is ' + ratio.toFixed(2) + '× the category peer multiple (read-only, precomputed).') +
      card('Growth', gr === null ? '—' : gr + ' / 7d', gr === null ? ['Data not in snapshot'] : ['Start (7d ago) ' + usd(D.growth_start) + ' TVL', 'End (snapshot) ' + usd(D.growth_end) + ' TVL', 'Window: 7d, fixed (snapshot has no 30d)'], 'Growth factor ' + r.model.growth_multiplier.toFixed(3) + '× (change clamped to ' + C.growth_floor + '..' + C.growth_cap + '%).') +
      card('Age', ag === null ? '—' : D.age_days + 'd' + (D.age_days >= 365 ? ' (' + ag + ')' : ''), ['Listed ' + (D.age_launch_date || 'unknown'), 'Snapshot ' + R.as_of + ' (fixed)', 'Age factor ' + D.age_factor.toFixed(2) + '× (full at ' + C.maturity_days + 'd)'], D.age_days === null ? 'Listing date missing: ' + C.unknown_age_days + ' days assumed.' : D.age_days >= C.maturity_days ? 'At cap: no age penalty.' : 'Below ' + C.maturity_days + ' days: age factor under the cap.') +
      '</div><p class="take">' + esc(take) + '</p>';
  }
  function ledger(r) {
    var e = r.econ, k = e.steps.length;
    var card = function (l, v, sub, c) { return '<div><span>' + l + '</span><b class="' + (c || '') + '">' + v + '</b><small>' + sub + '</small></div>'; };
    var sc = r.scen, rg = function (q, f, u) { return q.low === q.high ? f(q.mid) + (u || '') : f(q.low) + '–' + f(q.high).replace('$', '') + (u || ''); };
    var strip = '<div class="scen">' + sc.scenarios.map(function (t) {
      return '<div class="' + t.id + (t.id === 'mid' ? ' cur' : '') + '"><span>' + t.id.toUpperCase() + (t.id === 'mid' ? ' · current plan' : '') + '</span><b>' + cap(t.peak_cap_usd) + ' peak</b><small>' + fee(t.total_fee_usd) + ' fees · ' + t.total_mins + ' min</small></div>';
    }).join('') + '</div><p class="assume">Planning assumptions, not measured data: capital ×0.5/×1/×2, fees ×0.7/×1/×1.6, time ×0.8/×1/×1.3 (low/mid/high). Mid is the plan above; filters use mid.</p>';
    return '<div class="card" id="farm-ledger"><div class="lh"><h3>Farm execution ledger · ' + k + ' steps</h3><span class="cad">' + (e.cadence === 'one-shot' ? 'ONE-SHOT SETUP' : e.cadence.toUpperCase() + ' CADENCE') + '</span></div>' +
      '<div class="sum">' + card('Peak capital', cap(e.peak_cap_usd), 'recoverable lockup') + card('Total fee burn', fee(e.total_fee_usd), 'sunk gas &amp; tolls', 'fee') +
      card('Active time', e.total_mins + ' min', 'across ' + k + ' steps') + card('7d TVL flow', none(r.tvl_7d_pct) ? '—' : fGrow(r.tvl_7d_pct, 1), 'snapshot 7d chg', tone(r.tvl_7d_pct)) + '</div>' + strip +
      '<table class="ledger"><thead><tr><th>#</th><th>Step action &amp; specification</th><th class="n">Capital</th><th class="n">Fee</th><th class="n">Time</th></tr></thead><tbody>' +
      e.steps.map(function (s, i) {
        var c = s.cap_usd === 0 ? '<span class="flat">—</span>' : s.reused ? '<span class="flat" title="Reuses principal deployed in an earlier step">' + cap(s.cap_usd) + ' ↺</span>' :
          s.additive ? '<span title="Additional concurrent wallet reserve required">+' + cap(s.cap_usd) + '</span>' : cap(s.cap_usd);
        return '<tr><td class="flat">' + s.n + '</td><td class="tx">' + esc(r.farm_steps[i]) + '</td><td class="n">' + c + '</td><td class="n ' + (s.fee_usd ? 'fee' : 'flat') + '">' + rg(sc.steps[i].fee_usd, fee) + '</td><td class="n">' + rg(sc.steps[i].mins, String, 'm') + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="2">TOTAL COMMITMENT (' + k + ' steps)</td><td class="n">' + cap(e.peak_cap_usd) + ' peak</td><td class="n fee">' + fee(e.total_fee_usd) + '</td><td class="n">' + e.total_mins + 'm</td></tr></tfoot></table></div>';
  }
  // Valuation breakdown + cohort position: numbers precomputed at build time (lib/breakdown.ts), only formatted here.
  function bdCard(r) {
    var b = r.bd.b, c = r.bd.c, k = b.category, g = b.growth, a = b.maturity, h = b.chain;
    var row = function (t, v) { return '<dt>' + t + '</dt><dd>' + v + '</dd>'; };
    return '<div class="card"><h3>Valuation breakdown</h3><dl class="kv">' +
      row('TVL', full(b.tvl_usd)) +
      row('Category median', k.raw_median === null ? 'none (0 live)' : k.raw_median.toFixed(3)) +
      row('Global median', k.global_median.toFixed(3)) +
      row('Live n · weight', k.n + ' · ' + k.weight.toFixed(3)) +
      row('Multiple', x(k.multiple) + (k.multiple !== k.blended ? ' (clamped from ' + k.blended.toFixed(3) + ')' : '')) +
      row('Growth', g.change_7d === null ? '—' : g.change_7d.toFixed(1) + '%') +
      row('Growth used · ×', g.pct_used + '% · ' + x(g.multiplier)) +
      row('Age days · ×', (a.age_days === null ? 'unknown (' + a.age_used + ')' : a.age_days) + ' · ' + x(a.multiplier)) +
      row('Chains · ×', h.count + ' (+' + h.extra + ') · ' + x(h.multiplier)) +
      row('Product = implied', full(b.implied_value_usd)) +
      '</dl><p class="take">Cohort: rank ' + r.bd.c.rank_by_implied + ' of ' + c.cohort_size + ' in ' + esc(c.category) + ', percentile ' + c.percentile.toFixed(1) + ', category median implied ' + (c.median_implied_usd === null ? '—' : full(c.median_implied_usd)) + '</p></div>';
  }

  function detailView(slug) {
    var r = bySlug[slug];
    if (!r) { app.innerHTML = '<div class="empty">Unknown protocol. <a href="#board">Back to board</a></div>'; return; }
    var m = r.model, s = catStat[r.cat];
    var product = r.tvl_usd * m.category_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier;
    var catNote = s.n === 0 ? 'no live-token peers: global median ' + s.multiple.toFixed(3) :
      'median mcap/TVL ' + s.raw_median.toFixed(3) + ' from ' + s.n + ' live peer' + (s.n > 1 ? 's' : '') + ', weight n/(n+' + C.shrink_k + ') = ' + s.weight.toFixed(3) + ', shrunk toward global ' + R.global_median.toFixed(3);
    var clamped = r.change_7d !== null && r.change_7d !== m.growth_pct;
    var growthNote = r.change_7d === null ? 'no 7d reading, counted as 0%' : '7d change ' + r.change_7d.toFixed(2) + '%' + (clamped ? ', clamped to ' + m.growth_pct + '%' : '') + '; 1 + ' + (m.growth_pct / 100).toFixed(4) + ' × ' + C.growth_weight;
    var ageNote = m.age_days === null ? 'listing date unknown, ' + C.unknown_age_days + ' days assumed' : m.age_days + ' days since listing (as of ' + R.as_of + ')' + (m.age_days > C.maturity_days ? ', capped at ' + C.maturity_days : '');
    var nch = r.chains.length;
    var line = function (op, lbl, small, val, tr) { return '<tr><td class="op">' + op + '</td><td class="lbl"><b>' + lbl + '</b><small>' + small + '</small>' + (tr || '') + '</td><td class="v">' + val + '</td></tr>'; };
    app.innerHTML =
      '<button class="back" id="bk">← Back to radar</button>' +
      '<div class="dh">' + badge(r.rank) + '<h2>' + esc(r.name) + '</h2>' + (r.watchlist ? '<span class="tag wl">watchlist</span>' : '<span class="tag">early</span>') + '<span class="tag">pre-token</span>' +
      '<div class="big"><b>' + usd(r.implied_value_usd) + '</b><span>implied value · rank ' + r.rank + ' of ' + rows.length + '</span></div></div>' +
      whyStrip(r) + ledger(r) +
      '<div class="grid2"><div class="card"><h3>Model breakdown · radar-2</h3><table class="bd"><tbody>' +
      line('', 'TVL', 'DefiLlama snapshot, ' + R.as_of, full(r.tvl_usd)) +
      line('×', 'Category multiple', esc(r.cat) + ': ' + catNote + '; clamp ' + C.multiple_min + '–' + C.multiple_max, x(m.category_multiple), track(m.category_multiple, C.multiple_min, C.multiple_max)) +
      line('×', 'Growth', growthNote, x(m.growth_multiplier), track(m.growth_multiplier, 1 + C.growth_floor / 100 * C.growth_weight, 1 + C.growth_cap / 100 * C.growth_weight)) +
      line('×', 'Maturity', ageNote, x(m.maturity_multiplier), track(m.maturity_multiplier, C.maturity_floor, C.maturity_floor + C.maturity_range)) +
      line('×', 'Chain', nch + ' chain' + (nch === 1 ? '' : 's') + ': 1 + ' + C.chain_step + ' × clamp(' + nch + ' − 1, 0, ' + C.chain_max_extra + ')', x(m.chain_multiplier), track(m.chain_multiplier, 1, 1 + C.chain_step * C.chain_max_extra)) +
      '<tr class="res"><td class="op">=</td><td class="lbl"><b>Implied value</b><small>unrounded product ' + full(product) + '; rounded, kept within 1 to 1e14</small></td><td class="v">' + full(r.implied_value_usd) + '</td></tr></tbody></table></div>' +
      '<div><div class="card"><h3>Basics</h3><dl class="kv"><dt>Slug</dt><dd>' + esc(r.slug) + '</dd><dt>Category</dt><dd>' + esc(r.cat) + '</dd><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd><dt>7d TVL change</dt><dd>' + chg(r.tvl_7d_pct) + '</dd><dt>Token</dt><dd>none yet (mcap null)</dd><dt>Board scope</dt><dd>' + (r.watchlist ? 'watchlist' : 'early (eligible extra)') + '</dd></dl>' +
      '<div class="chips">' + r.chains.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div></div>' + bdCard(r) + '</div></div>';
    document.getElementById('bk').onclick = function () { location.hash = '#board'; };
  }

  // ---------- watchlist ----------
  // Tier bands are display-only thresholds on the snapshot 7d TVL change; tiers, ranks and groups are computed at build time.
  var TIERS = [['surging', 'Surging'], ['rising', 'Rising'], ['flat', 'Flat'], ['falling', 'Falling'], ['dropping', 'Dropping'], ['unknown', 'No 7d reading']];
  function watchCard(r) {
    var w = r.wc, e = r.econ, p = w.pct, bar = none(p) ? '<i class="mb"></i>' : '<i class="mb"><u class="' + (p < 0 ? 'neg' : 'pos') + '" style="width:' + (Math.min(Math.abs(p), 60) / 60 * 50).toFixed(2) + '%"></u></i>';
    return '<article class="wc" tabindex="0" data-slug="' + esc(r.slug) + '"><div class="wh">' + badge(r.rank) + '<b>' + esc(r.name) + '</b><span class="pill">' + esc(r.cat) + '</span></div>' +
      '<div class="wv"><b>' + usd(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div class="wm t-' + w.tier + '"><div class="mn">' + (none(p) ? '—' : fGrow(p, 1)) + '</div><span class="tp">' + esc(w.label) + '</span>' + bar + '</div>' +
      '<dl class="wk"><dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd><dt>Chains</dt><dd>' + chainCell(r) + '</dd><dt>Farm plan</dt><dd>' + cap(e.peak_cap_usd) + ' peak · ' + fee(e.total_fee_usd) + ' fees · ' + e.total_mins + ' min</dd>' +
      '<dt>In category</dt><dd>#' + w.cat_rank + ' of ' + w.cat_size + '</dd><dt>Watchlist</dt><dd>#' + w.watch_rank + ' of ' + R.watchlist_size + '</dd></dl></article>';
  }
  function watchView() {
    var G = R.watch_groups || [], n = 0, hi = 0, lo = 0;
    G.forEach(function (g) { n += g.count; hi += g.tiers.surging + g.tiers.rising; lo += g.tiers.falling + g.tiers.dropping; });
    app.className = '';
    app.innerHTML = '<section class="wl"><h2>Watchlist · ' + n + ' protocols</h2><p class="ws">' + n + ' watchlist protocols in ' + G.length + ' categories · <b class="up">' + hi + ' rising or better</b> · <b class="down">' + lo + ' falling or worse</b></p>' +
      '<p class="wn">Momentum bands (display-only, on the snapshot 7d TVL change): ≥10% Surging, ≥2% Rising, ≥−2% Flat, ≥−10% Falling, below that Dropping. Bar half-width = |change|, capped at 60%.</p>' +
      (G.length ? G.map(function (g) {
        return '<div class="wg"><div class="wgh"><h3>' + esc(g.category) + '</h3><span>' + g.count + ' · best rank #' + g.best_rank + ' · TVL ' + usd(g.total_tvl_usd) + ' · median 7d ' + (none(g.median_change_7d) ? '—' : fGrow(g.median_change_7d, 1)) + '</span>' +
          '<span class="wt">' + TIERS.filter(function (t) { return g.tiers[t[0]]; }).map(function (t) { return '<em class="t-' + t[0] + '">' + g.tiers[t[0]] + ' ' + t[1] + '</em>'; }).join('') + '</span></div>' +
          '<div class="wcs">' + g.slugs.map(function (s) { return bySlug[s] && bySlug[s].wc ? watchCard(bySlug[s]) : ''; }).join('') + '</div></div>';
      }).join('') : '<div class="empty">No watchlist data.</div>') + '</section>';
    app.querySelectorAll('.wc').forEach(function (c) {
      var go = function () { location.hash = '#p/' + c.getAttribute('data-slug'); };
      c.onclick = go; c.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    });
  }

  // ---------- model ----------
  function modelView() {
    var withPeers = R.categories.filter(function (c) { return c.n > 0; }).sort(function (a, b) { return b.n - a.n || cmpStr(a.category, b.category); }).slice(0, 8);
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
      '<li>Protocols with a market cap are never on the board; they sit in the separate Live-token benchmarks regime at their real mcap, with no rank, implied value or farm plan.</li>' +
      '<li>Result: ' + R.watchlist_size + ' watchlist + ' + R.extra_size + ' early = ' + R.board_size + ' rows; ' + R.live_size + ' live-token protocols set aside.</li></ul>' +
      '<h2>Evidence columns</h2><p>Mult is implied value divided by TVL (the snapshot has no fee data, so the base is always TVL, marked T). Growth is the reported 7-day TVL change; the snapshot has no 30-day field. Age is days from listing to the snapshot date. All three are computed at build time and only formatted in the browser.</p>' +
      '<h2>Farm plan and execution ledger</h2><p>Each row has an ' + rows[0].farm_steps.length + '-step plan whose wording follows one of six archetypes (lending/CDP, DEX, yield/staking, derivatives, bridge, prediction/gaming), filled with the protocol’s own TVL, chain and amounts. Capital is $50 / $100 / $150 / $250 by TVL (under $25M, $100M, $500M, above), the hold is 14 / 30 / 45 / 60 days by age. Every step ends with its cost and time, and the ledger shows the same numbers: peak capital counts recycled principal once, extra reserves stack, fees are the sunk gas and tolls. It is a template for a small, separate wallet, not financial advice.</p>' +
      '<h2>Limits</h2><p>mcap / TVL is a crude comparable, and medians from small samples are noisy, hence the shrinkage and clamp. Growth uses one week of TVL change, so it moves with short-term swings. Chain count rewards reach, not usage; the snapshot has no per-chain TVL, so the primary chain is the first one listed. Treat ranks as a starting order for research.</p></article>';
  }

  // ---------- router ----------
  var tabs = document.getElementById('tabs');
  tabs.querySelectorAll('button').forEach(function (b) { b.onclick = function () { location.hash = '#' + b.getAttribute('data-tab'); }; });
  function route() {
    var h = location.hash.replace(/^#/, '') || 'board', qm = /^(board|live)\?(.+)$/.exec(h), tab;
    if (qm) h = qm[1];
    tab = h === 'model' || h === 'watch' ? h : 'board';
    if (['board', 'live', 'model', 'watch'].indexOf(h) < 0 && h.indexOf('p/') !== 0) h = 'board';
    tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab); });
    if (h.indexOf('p/') === 0) { app.className = ''; detailView(decodeURIComponent(h.slice(2))); window.scrollTo(0, 0); }
    else if (h === 'model') { app.className = ''; modelView(); }
    else if (h === 'watch') { watchView(); window.scrollTo(0, 0); }
    else { S.mode = h === 'live' ? 'live' : 'pre'; if (qm) Object.assign(S, dec(qm[2])); boardView(); }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', syncCtl);
  document.getElementById('sub').textContent = 'Snapshot ' + R.as_of + ' · ' + R.source.split(' ')[0] + ' · model ' + R.model_version + ' · ' + R.board_size + ' pre-token rows';
  document.getElementById('foot').innerHTML = '<span>Values derive only from the snapshot. No network, no clock. Floor TVL ' + usd(R.floor_usd) + '.</span><span class="kbh"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> detail · <kbd>/</kbd> search · <kbd>Esc</kbd> close <button class="ghost" id="kb" aria-expanded="false">Keys</button></span><div class="kbh" id="kp" hidden><kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> open detail · <kbd>/</kbd> focus search · <kbd>Esc</kbd> back or clear · <kbd>Home</kbd><kbd>End</kbd> first / last</div>';
  document.getElementById('kb').onclick = function () { var p = document.getElementById('kp'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden)); };
  route();
})();
