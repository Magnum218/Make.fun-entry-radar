// UNMINTED's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a detail view for every protocol with the model's workings and the farm plan
// from board.json itself, a separate live-token view, and the model stated in full. No network:
// every byte it shows arrived in data.js. State lives in the location hash, so a view can be
// linked and reproduced exactly: #cat=Lending, #slug=<protocol>, #view=live.
(function () {
  'use strict';

  var R = window.RADAR;
  var app = document.getElementById('app');
  var prov = document.getElementById('prov');
  var foot = document.getElementById('foot');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function full(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + (Math.round(n * 10) / 10) + '%';
  }
  function days(n) {
    if (n === null || n === undefined) return 'unknown';
    if (n >= 730) return (n / 365).toFixed(1) + ' yrs';
    return n + ' days';
  }
  function mult(n) {
    return 'x' + (Math.round(n * 100) / 100);
  }

  prov.textContent = 'Snapshot ' + R.as_of + ' · ' + R.source;
  foot.innerHTML =
    '<p><b>Provenance.</b> One sealed snapshot of the DefiLlama protocol index, fetched ' + esc(R.as_of) +
    ' (' + esc(R.source) + '). The watchlist floor is ' + full(R.floor_usd) + ' of TVL. This page renders offline from that snapshot alone.</p>' +
    '<p><b>Wording.</b> A protocol here <i>records no token</i> in the snapshot: no market cap, no CoinGecko id, no symbol. That is a statement about the record, not proof no token exists anywhere.</p>' +
    '<p><b>Claims.</b> An implied value is this radar\u2019s own model claim about what a launch would be worth if the record stayed as it is. It is not a prediction that a token will be issued, and not a promise about any airdrop.</p>';

  // ---------- state ----------
  function readHash() {
    var s = { view: 'board', q: '', chain: '', cat: '', tier: 'all', sort: 'implied', slug: '' };
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      if (k in s) s[k] = v;
    });
    if (s.slug) s.view = 'detail';
    return s;
  }
  var state = readHash();
  function setHash(patch) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    var parts = [];
    ['view', 'q', 'chain', 'cat', 'tier', 'sort', 'slug'].forEach(function (k) {
      if (state[k] && state[k] !== 'board' && state[k] !== 'all' && state[k] !== 'implied') parts.push(k + '=' + encodeURIComponent(state[k]));
      if (k === 'view' && state.view === 'live') parts.push('view=live');
    });
    history.replaceState(null, '', '#' + parts.join('&'));
    render();
  }

  var maxImplied = Math.max.apply(null, R.rows.map(function (r) { return r.implied_value_usd; }));
  var minImplied = Math.min.apply(null, R.rows.map(function (r) { return r.implied_value_usd; }));
  function valBar(v) {
    var lo = Math.log10(Math.max(minImplied, 1)), hi = Math.log10(maxImplied);
    var w = hi === lo ? 100 : 10 + 90 * (Math.log10(Math.max(v, 1)) - lo) / (hi - lo);
    return '<span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span>';
  }
  function badge(r) {
    return r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge er">EARLY</span>';
  }
  function chgCell(n) {
    if (n === null || n === undefined) return '<span class="chg">—</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'dn' : '';
    var w = Math.min(100, Math.abs(n) / 60 * 100);
    return '<span class="chg ' + cls + '">' + pct(n) + '</span><span class="bar ' + (n < 0 ? '' : 'amber') + '"><i style="width:' + w.toFixed(0) + '%"></i></span>';
  }

  // ---------- board ----------
  function filtered() {
    var rows = R.rows.filter(function (r) {
      if (state.tier === 'wl' && !r.watchlist) return false;
      if (state.tier === 'er' && r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      implied: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      chg: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    };
    return rows.sort(by[state.sort] || by.implied);
  }

  function options(values, current, allLabel) {
    var out = '<option value="">' + allLabel + '</option>';
    values.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }

  function boardView() {
    var chains = {}, cats = {};
    R.rows.forEach(function (r) {
      r.chains.forEach(function (c) { chains[c] = 1; });
      if (r.category) cats[r.category] = 1;
    });
    var rows = filtered();
    var html = '';
    html += '<section class="hero"><h1>Every protocol that records <em>no token yet</em>, ranked by what its launch would be worth.</h1>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + R.scanned_size + '</b><span>protocols scanned</span></div>' +
      '<div class="stat"><b>' + R.pretoken_size + '</b><span>record no token</span></div>' +
      '<div class="stat"><b>' + R.board_size + '</b><span>ranked</span></div>' +
      '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist tier</span></div>' +
      '</div></section>';
    html += '<div class="formula">implied value = TVL x <b>0.25</b> x <b>category factor</b> x <b>growth factor</b> x <b>maturity factor</b> &nbsp;·&nbsp; model ' + esc(R.model_version) + ', stated in full below</div>';
    html += '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, category, chain" value="' + esc(state.q) + '">' +
      '<label>Chain <select id="chain">' + options(Object.keys(chains).sort(), state.chain, 'All chains') + '</select></label>' +
      '<label>Category <select id="cat">' + options(Object.keys(cats).sort(), state.cat, 'All categories') + '</select></label>' +
      '<label>Tier <select id="tier">' +
      '<option value="all"' + (state.tier === 'all' ? ' selected' : '') + '>All tiers</option>' +
      '<option value="wl"' + (state.tier === 'wl' ? ' selected' : '') + '>Watchlist only</option>' +
      '<option value="er"' + (state.tier === 'er' ? ' selected' : '') + '>Early radar only</option></select></label>' +
      '<label>Sort <select id="sort">' +
      '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="chg"' + (state.sort === 'chg' ? ' selected' : '') + '>7d change</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Time tokenless</option></select></label>' +
      '<div class="views"><button id="v-board" class="' + (state.view !== 'live' ? 'on' : '') + '">Pre-token board</button>' +
      '<button id="v-live" class="' + (state.view === 'live' ? 'on' : '') + '">Live tokens</button></div></div>';
    html += '<div class="count">Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols · click any row for its value breakdown and farm plan</div>';
    if (rows.length === 0) {
      html += '<div class="empty">No ranked protocol matches this filter. Loosen the search, chain or category to see the board again.</div>';
    } else {
      html += '<div class="board-wrap"><table><thead><tr>' +
        '<th>Rank</th><th>Protocol</th><th>Tier</th><th class="num">TVL</th><th class="num">7d change</th><th class="num">Tokenless for</th><th class="num">Implied value</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="top"' : '') + '>' +
          '<td class="rank">' + r.rank + '</td>' +
          '<td class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</span></td>' +
          '<td>' + badge(r) + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + chgCell(r.change_7d) + '</td>' +
          '<td class="num">' + days(r.age_days) + '</td>' +
          '<td class="val">' + money(r.implied_value_usd) + valBar(r.implied_value_usd) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += methodSection();
    return html;
  }

  function methodSection() {
    var m = R.model;
    var cats = R.categories.filter(function (c) { return c.live_count > 0; }).sort(function (a, b) { return b.factor - a.factor; });
    var catHtml = cats.map(function (c) {
      return '<div><span><b>' + esc(c.category || 'Uncategorized') + '</b> · ' + c.live_count + ' live</span><span>median ' +
        (c.median_ratio === null ? '—' : c.median_ratio) + ' · <span class="f">' + mult(c.factor) + '</span></span></div>';
    }).join('');
    return '<section class="method"><h2>How this ranking works — model ' + esc(R.model_version) + '</h2>' +
      '<p>The board ranks only protocols that <b>record no token</b> in the snapshot. It covers <b>all ' + R.watchlist_size +
      ' watchlist protocols</b> (TVL at or above ' + full(R.floor_usd) + ', not a wrapped, staked or bridged product of a token that trades) and adds every other rankable pre-token protocol below that floor — ' +
      R.early_size + ' early rows. Above the floor, a pre-token protocol the watchlist leaves out is a product of another protocol\u2019s record, so the radar does not rank it.</p>' +
      '<div class="fx">implied = round( TVL x <span>' + m.base_multiple + '</span> x <span>category factor</span> x <span>(1 + clamp(7d change, ' +
      m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')</span> x <span>(' + m.maturity_floor + ' + min(tokenless days, ' +
      m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')</span> )</div>' +
      '<ul>' +
      '<li><b>Base.</b> TVL x ' + m.base_multiple + ' — the house radar-1 spine, kept so this board stays comparable with it.</li>' +
      '<li><b>Category factor.</b> The one adjustment this model adds, priced from the snapshot itself: for each category, the median market-cap / TVL of its protocols that <i>already trade</i>, divided by the all-category median (' + R.global_median_ratio + '), bounded to [' + m.category_factor_min + ', ' + m.category_factor_max + ']. A category with fewer than ' + m.category_min_live + ' live peers keeps the neutral factor x1 — the snapshot is too thin there to price it.</li>' +
      '<li><b>Growth factor.</b> The protocol\u2019s own 7-day TVL change, clamped so one hot week cannot buy the top of the board.</li>' +
      '<li><b>Maturity factor.</b> How long the protocol has run with no token, from the day the index began tracking it (' + m.unknown_age_days + ' days when unrecorded): a protocol that has operated tokenless for years is priced as a larger, later launch than a new one.</li>' +
      '</ul>' +
      '<p><b>The category table the factors were priced from</b> — every figure measured on this snapshot\u2019s live set, nothing imported:</p>' +
      '<div class="cats">' + catHtml + '</div>' +
      '<p style="margin-top:12px">No protocol name is special-cased anywhere: one function scores every row from its own record, and each row\u2019s detail view shows its factors multiplied out. Protocols whose token already trades are never ranked here — the Live tokens view shows them separately, at the market\u2019s own values.</p>' +
      '</section>';
  }

  // ---------- detail ----------
  function splitStep(s) {
    var ci = s.lastIndexOf(' Cost: ');
    if (ci < 0) return { text: s, cost: '', time: '' };
    var rest = s.slice(ci + 7);
    var ti = rest.lastIndexOf('. Time: ');
    if (ti < 0) return { text: s.slice(0, ci), cost: rest, time: '' };
    return { text: s.slice(0, ci), cost: rest.slice(0, ti), time: rest.slice(ti + 8).replace(/\.$/, '') };
  }

  function detailView() {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === state.slug) r = x; });
    if (!r) return boardView();
    var afterCat = Math.round(r.base_usd * r.category_factor);
    var afterGrowth = Math.round(afterCat * r.growth_multiplier);
    var catNote = r.category_live_count >= R.model.category_min_live
      ? 'priced from ' + r.category_live_count + ' live ' + esc(r.category || '') + ' protocols in this snapshot, median market-cap / TVL ' + r.category_median_ratio
      : 'only ' + r.category_live_count + ' live peer(s) in this snapshot — too thin to price the category, so the factor stays neutral';
    var steps = r.farm_steps.map(function (s, i) {
      var p = splitStep(s);
      return '<li><span class="n">' + (i + 1) + '</span><div><p>' + esc(p.text) + '</p>' +
        '<div class="chips"><span class="chip">cost <b>' + esc(p.cost) + '</b></span><span class="chip">time <b>' + esc(p.time) + '</b></span></div></div></li>';
    }).join('');
    return '<section class="detail">' +
      '<button class="back" id="back">&larr; Back to the board</button>' +
      '<h1>' + esc(r.name) + ' ' + badge(r) + '</h1>' +
      '<div class="sub">Rank ' + r.rank + ' of ' + R.board_size + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || '—') + '</div>' +
      '<div class="grid">' +
      '<div class="cell"><span>TVL</span><b>' + full(r.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>7d change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div class="cell"><span>Tokenless for</span><b>' + days(r.age_days) + '</b></div>' +
      '<div class="cell"><span>Tracked since</span><b>' + (r.listed_at || 'unrecorded') + '</b></div>' +
      '<div class="cell"><span>Chains</span><b>' + r.chains.length + '</b></div>' +
      '<div class="cell"><span>Implied value</span><b>' + full(r.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<div class="panel"><h2>Where the implied value comes from</h2><div class="water">' +
      '<div class="row"><span>TVL in the snapshot</span><b>' + full(r.tvl_usd) + '</b></div>' +
      '<div class="row"><span>x base multiple (house spine)</span><b>' + mult(R.model.base_multiple) + ' → ' + full(r.base_usd) + '</b></div>' +
      '<div class="row"><span>x category factor — ' + catNote + '</span><b>' + mult(r.category_factor) + ' → ' + full(afterCat) + '</b></div>' +
      '<div class="row"><span>x growth factor (7d change ' + pct(r.change_7d) + ', clamped)</span><b>' + mult(r.growth_multiplier) + ' → ' + full(afterGrowth) + '</b></div>' +
      '<div class="row"><span>x maturity factor (tokenless ' + days(r.age_days) + ')</span><b>' + mult(r.maturity_multiplier) + '</b></div>' +
      '<div class="row total"><span>Implied value if it launched on this record</span><b>' + full(r.implied_value_usd) + '</b></div>' +
      '</div><p class="note">Steps are rounded for display; the board\u2019s figure is the model\u2019s, computed in one pass from the snapshot\u2019s own figures.</p></div>' +
      '<div class="panel"><h2>Farm plan — what to do before any launch</h2><ol class="steps">' + steps + '</ol>' +
      '<p class="note">This is the same plan the board hands in for ' + esc(r.name) + ': six steps, each with its cost and its time, generated from the protocol\u2019s own category, chain, TVL and age — never written per name.</p></div>' +
      '</section>';
  }

  // ---------- live ----------
  function liveView() {
    var html = boardChrome('live');
    html += '<p class="live-note">These protocols already trade, so they are <b>never ranked</b> on the pre-token board. They are shown at the market\u2019s own values — and they are the yardstick the category factors were priced from: the median market-cap / TVL above is what a launched token in that category actually trades at in this snapshot.</p>';
    html += '<div class="board-wrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th><th class="num">7d change</th></tr></thead><tbody>';
    R.live.forEach(function (p) {
      var ratio = p.mcap_usd && p.tvl_usd ? (Math.round(p.mcap_usd / p.tvl_usd * 100) / 100) : null;
      html += '<tr><td class="name"><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.chains.slice(0, 3).join(', ')) + '</span></td>' +
        '<td>' + esc(p.category || 'Uncategorized') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + (ratio === null ? '—' : ratio) + '</td><td class="num">' + chgCell(p.change_7d) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
  function boardChrome(view) {
    return '<section class="hero"><h1>Already trading — <em>the yardstick</em>, not the board.</h1>' +
      '<div class="stats"><div class="stat"><b>' + R.live_size + '</b><span>shown of the live set</span></div>' +
      '<div class="stat"><b>' + R.global_median_ratio + '</b><span>median mcap / TVL</span></div></div></section>' +
      '<div class="controls"><div class="views" style="margin-left:0"><button id="v-board">Pre-token board</button>' +
      '<button id="v-live" class="on">Live tokens</button></div></div>';
  }

  // ---------- render + wiring ----------
  function render() {
    app.setAttribute('aria-busy', 'false');
    if (state.view === 'detail') app.innerHTML = detailView();
    else if (state.view === 'live') app.innerHTML = liveView();
    else app.innerHTML = boardView();
    wire();
    window.scrollTo(0, 0);
  }
  function wire() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; refreshTable(); });
    [['chain', 'chain'], ['cat', 'cat'], ['tier', 'tier'], ['sort', 'sort']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.addEventListener('change', function () { var p = {}; p[pair[1]] = el.value; setHash(p); });
    });
    var vb = document.getElementById('v-board');
    if (vb) vb.addEventListener('click', function () { setHash({ view: 'board', slug: '' }); });
    var vl = document.getElementById('v-live');
    if (vl) vl.addEventListener('click', function () { setHash({ view: 'live', slug: '' }); });
    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { setHash({ view: 'board', slug: '' }); });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { setHash({ view: 'detail', slug: tr.getAttribute('data-slug') }); });
    });
  }
  // Typing in the search box re-renders only the table body and the count, so the box keeps focus.
  function refreshTable() {
    var rows = filtered();
    var tbody = app.querySelector('tbody');
    var count = app.querySelector('.count');
    if (!tbody || !count) { render(); return; }
    count.textContent = 'Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols · click any row for its value breakdown and farm plan';
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="top"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</span></td>' +
        '<td>' + badge(r) + '</td><td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + chgCell(r.change_7d) + '</td><td class="num">' + days(r.age_days) + '</td>' +
        '<td class="val">' + money(r.implied_value_usd) + valBar(r.implied_value_usd) + '</td></tr>';
    }).join('');
    tbody.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { setHash({ view: 'detail', slug: tr.getAttribute('data-slug') }); });
    });
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  window.addEventListener('hashchange', function () { state = readHash(); render(); });
  render();
})();
