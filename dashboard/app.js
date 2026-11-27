// UNMINTED's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a detail view for every protocol with the model's workings, its own reading
// of its rank and the farm plan from board.json itself, a separate live-token view, and a
// methodology view that walks the whole pipeline — ingest, the pre-token test, the watchlist
// floor, the scoring and how a row earns its farm steps — with the model stated in full.
// No network: every byte it shows arrived in data.js. State lives in the location hash, so a
// view can be linked and reproduced exactly: #cat=Lending, #slug=<protocol>, #view=live,
// #view=method.
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
      if (k === 'view') {
        if (state.view === 'live' || state.view === 'method') parts.push('view=' + state.view);
        return;
      }
      if (state[k] && state[k] !== 'board' && state[k] !== 'all' && state[k] !== 'implied') parts.push(k + '=' + encodeURIComponent(state[k]));
    });
    history.replaceState(null, '', '#' + parts.join('&'));
    render();
  }

  // The three top-level views, as one switcher used by every view's chrome.
  function viewTabs() {
    return '<div class="views"><button id="v-board" class="' + (state.view !== 'live' && state.view !== 'method' ? 'on' : '') + '">Pre-token board</button>' +
      '<button id="v-live" class="' + (state.view === 'live' ? 'on' : '') + '">Live tokens</button>' +
      '<button id="v-method" class="' + (state.view === 'method' ? 'on' : '') + '">Methodology</button></div>';
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
    html += '<div class="formula">implied value = TVL x <b>0.25</b> x <b>category factor</b> x <b>growth factor</b> x <b>maturity factor</b> &nbsp;·&nbsp; model ' + esc(R.model_version) + ' — the Methodology view states it in full, with the pipeline that produced this board</div>';
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
      viewTabs() + '</div>';
    html += '<div class="count">Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols · click any row for its value breakdown and farm plan</div>';
    html += '<div class="legend"><span><span class="badge wl">WATCHLIST</span> above the ' + money(R.floor_usd) + ' floor, house-listed</span>' +
      '<span><span class="badge er">EARLY</span> below-floor early radar</span>' +
      '<span>teal bar under a value: its place on the board\u2019s log scale</span>' +
      '<span>bar beside a 7d change: its size, capped at 60%</span>' +
      '<span>top-3 rows are tinted amber</span></div>';
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

  // ---------- methodology ----------
  // The fourth view: the radar explained as a working system — the pipeline that produced the
  // board, why the score is shaped the way it is, where every figure comes from, and how a row
  // earns its farm steps. Everything stated here is computed from the same data.js the board
  // renders, so the view cannot drift from the board it explains.
  function methodView() {
    var m = R.model;
    var traded = R.scanned_size - R.pretoken_size;
    var cats = R.categories.filter(function (c) { return c.live_count > 0; }).sort(function (a, b) { return b.factor - a.factor; });
    var catHtml = cats.map(function (c) {
      return '<div><span><b>' + esc(c.category || 'Uncategorized') + '</b> · ' + c.live_count + ' live</span><span>median ' +
        (c.median_ratio === null ? '—' : c.median_ratio) + ' · <span class="f">' + mult(c.factor) + '</span></span></div>';
    }).join('');
    var top = R.rows[0];
    var tags = [
      'wallet hygiene — priced from its first chain\u2019s gas tier',
      'the core action — from its category, its TVL capital tier and its first chain',
      'the weekly beat — from its category family',
      'the hold — from its time tokenless',
      'claim hygiene — the same for every row',
      'the log and the stop rule — the same for every row',
    ];
    var anatomy = top.farm_steps.map(function (s, i) {
      var p = splitStep(s);
      return '<li><span class="n">' + (i + 1) + '</span><div><p>' + esc(p.text) + '</p>' +
        '<div class="chips"><span class="chip">cost <b>' + esc(p.cost) + '</b></span><span class="chip">time <b>' + esc(p.time) + '</b></span>' +
        '<span class="chip src">' + tags[i] + '</span></div></div></li>';
    }).join('');
    var html = '';
    html += '<section class="hero"><h1>How this radar works — <em>the live method</em>, end to end.</h1>' +
      '<div class="stats">' +
      '<div class="stat"><b>5</b><span>pipeline stages</span></div>' +
      '<div class="stat"><b>10</b><span>fields per record</span></div>' +
      '<div class="stat"><b>0</b><span>names special-cased</span></div>' +
      '<div class="stat"><b>' + R.board_size + '</b><span>rows ranked</span></div>' +
      '</div></section>';
    html += '<div class="controls">' + viewTabs() + '</div>';

    html += '<section class="method"><h2>The signal pipeline — from one sealed snapshot to this board</h2>' +
      '<div class="pipe">' +
      '<div class="stage"><span class="sn">1</span><div><h3>Ingest — one sealed snapshot</h3><p>' + R.scanned_size +
      ' protocol records from the DefiLlama index, fetched once and sealed (' + esc(R.source) + ', as of ' + esc(R.as_of) +
      '). Ten fields per record. The program reads that file and nothing else — never the network — so the board it writes can be reproduced byte for byte.</p></div><span class="cnt">' + R.scanned_size + ' records</span></div>' +
      '<div class="stage"><span class="sn">2</span><div><h3>The pre-token test</h3><p>A record <b>records no token</b> when its market cap, CoinGecko id and symbol are all empty. ' +
      R.pretoken_size + ' records pass. The ' + traded + ' that already trade are set aside: never ranked here, and kept as the yardstick the category factors are priced from.</p></div><span class="cnt">' + R.pretoken_size + ' record no token</span></div>' +
      '<div class="stage"><span class="sn">3</span><div><h3>The watchlist floor</h3><p>At or above ' + full(R.floor_usd) +
      ' of TVL, the house\u2019s listing rule applies: not a wrapped, staked or bridged product of a token that trades, not an exchange house, no version marker in the name. ' +
      R.watchlist_size + ' slugs pass — and the board must cover every one. Coverage is a gate, not a goal.</p></div><span class="cnt">' + R.watchlist_size + ' slugs · 100% covered</span></div>' +
      '<div class="stage"><span class="sn">4</span><div><h3>The early radar</h3><p>Below the floor, every other rankable pre-token protocol joins the board: not an exchange record, not a versioned pool of another protocol. Above the floor, a pre-token record the watchlist leaves out is a product of another protocol\u2019s record, so the radar leaves it out too.</p></div><span class="cnt">' + R.early_size + ' early rows</span></div>' +
      '<div class="stage"><span class="sn">5</span><div><h3>Score and rank</h3><p>One function prices every chosen record (the scoring below), and the board sorts by that value, ties broken by slug. No name is read twice and no name is special-cased: change the record and the rank follows, change nothing else and it cannot.</p></div><span class="cnt">' + R.board_size + ' rows ranked</span></div>' +
      '</div></section>';

    html += '<section class="method"><h2>Scoring rationale — why the value is shaped this way</h2>' +
      '<div class="fx">implied = round( TVL x <span>' + m.base_multiple + '</span> x <span>category factor</span> x <span>(1 + clamp(7d change, ' +
      m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')</span> x <span>(' + m.maturity_floor + ' + min(tokenless days, ' +
      m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')</span> )</div>' +
      '<ul>' +
      '<li><b>Base — TVL x ' + m.base_multiple + '.</b> The house radar-1 spine, kept unchanged so this board stays comparable with the house\u2019s own. TVL is the one size figure every record carries, so it is the only honest base.</li>' +
      '<li><b>Category factor — what its market pays.</b> A launch is worth what launched protocols in its category actually trade at: the median market-cap / TVL of the category\u2019s live protocols in this snapshot, divided by the all-category median (' + R.global_median_ratio + '). A median, not a mean, so one giant cannot bend it. Fewer than ' + m.category_min_live + ' live peers and the factor stays x1 — the snapshot is too thin to price that category — and it is bounded to [' + m.category_factor_min + ', ' + m.category_factor_max + '], so it can adjust a value, never decide one.</li>' +
      '<li><b>Growth factor — momentum, halved and clamped.</b> The record\u2019s own 7-day TVL change, weighted ' + m.growth_weight + ' and clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%] before it is applied: momentum counts, but one hot week cannot buy the top of the board.</li>' +
      '<li><b>Maturity factor — time tokenless as evidence.</b> Days since the index began tracking the protocol, saturating at ' + m.maturity_days + '. A protocol that has run for years with no token is priced as a larger, later launch than one listed last month. An unrecorded listing date counts as ' + m.unknown_age_days + ' days — stated openly, not treated as zero and not as forever.</li>' +
      '</ul>' +
      '<p><b>What the model refuses to read:</b> names (no protocol is boosted or buried by hand), prices from anywhere else, points programmes, social signals and launch rumours. If a figure is not in the sealed record, it cannot move a row — that is what makes this board checkable from this page alone.</p>' +
      '<p><b>The category table the factors were priced from</b> — every figure measured on this snapshot\u2019s live set, nothing imported:</p>' +
      '<div class="cats">' + catHtml + '</div>' +
      '</section>';

    html += '<section class="method"><h2>Data sources — one snapshot, ten fields, each with a job</h2>' +
      '<p>The only source is the sealed snapshot named in the header (' + esc(R.source) + ', as of ' + esc(R.as_of) + ', floor ' + full(R.floor_usd) + '). The fields and what each one does:</p>' +
      '<ul>' +
      '<li><b>tvl_usd</b> — the base of every value, and the floor test at stage 3.</li>' +
      '<li><b>change_7d</b> — the growth factor, clamped before use.</li>' +
      '<li><b>listed_at</b> — the maturity factor: how long the protocol has run tokenless.</li>' +
      '<li><b>category</b> — the category factor, and the farm plan\u2019s core action.</li>' +
      '<li><b>chains</b> — the farm plan\u2019s venue and gas tier (the first chain named).</li>' +
      '<li><b>mcap_usd, gecko_id, symbol</b> — read only as the pre-token test at stage 2, and, for protocols that trade, as the live yardstick.</li>' +
      '<li><b>name, slug</b> — carried for display and for the version-marker rule; never scored.</li>' +
      '</ul>' +
      '<p><b>Refresh:</b> the radar is a program, not a page someone edits. Run it on a newer snapshot and the same function writes a new board; every figure in every view traces to the snapshot named above, and to nothing else.</p>' +
      '</section>';

    html += '<section class="method"><h2>How a row earns its farm steps</h2>' +
      '<p>Every row hands in six steps, generated from the row\u2019s own record by four lookups — never written per name:</p>' +
      '<ul>' +
      '<li><b>category</b> &rarr; the core action and the weekly beat (twenty category families — supply, provide, bridge, stake, mint, hedge and more — with a plain deposit where no family matches);</li>' +
      '<li><b>first chain</b> &rarr; the gas tier (under $1 on Solana- and Polygon-class chains, about $12 on Ethereum, tiers between);</li>' +
      '<li><b>TVL</b> &rarr; the capital tier ($50 below $100M of TVL, rising to $250 at $5B and above);</li>' +
      '<li><b>age</b> &rarr; the hold window (60 days under six months tokenless, 30 days past a year).</li>' +
      '</ul>' +
      '<p>The six beats never change shape: set up a clean wallet; take the core position; do one small qualifying action every week; hold across more than one weekly snapshot; check the protocol\u2019s own page before claiming anything, and never pay a fee to claim; keep a farm log, and stop the week a token appears. Each step states its cost and its time, because a plan without either is a wish.</p>' +
      '<p><b>The anatomy of one real plan</b> — rank 1, ' + esc(top.name) + ', with the record each step was priced from:</p>' +
      '<ol class="steps">' + anatomy + '</ol>' +
      '</section>';

    html += '<section class="method"><h2>Legends — reading the board</h2>' +
      '<div class="legends">' +
      '<div><span class="badge wl">WATCHLIST</span><p>Above the ' + money(R.floor_usd) + ' floor and on the house\u2019s list: the top tier, covered in full.</p></div>' +
      '<div><span class="badge er">EARLY</span><p>Below the floor: the early radar\u2019s own finds, ranked by the same function.</p></div>' +
      '<div><span class="bar demo"><i style="width:62%"></i></span><p>The teal bar under a value: its place between the board\u2019s smallest and largest implied value, on a log scale — values span orders of magnitude, and a linear bar would flatten all but the top rows.</p></div>' +
      '<div><span class="bar amber demo"><i style="width:45%"></i></span><p>The bar beside a 7d change: amber when the week rose, plain when it fell, as wide as the move and capped at 60%.</p></div>' +
      '<div><span class="mono-chip">x1.00</span><p>A neutral factor: the snapshot gave that term nothing to say — too few live peers, no recorded growth, or an unrecorded age priced at the stated default.</p></div>' +
      '<div><span class="mono-chip">records no token</span><p>A statement about the record — no market cap, no CoinGecko id, no symbol in this snapshot — not proof that no token exists anywhere.</p></div>' +
      '</div></section>';
    return html;
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

  // One row read back in words: where it stands, what moves its value most, and what would have
  // to change in its record for the value to move. Every figure is the row's own or the board's.
  function reasonPanel(r) {
    var sorted = R.rows.map(function (x) { return x.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var terms = [
      ['category factor', r.category_factor, 'priced from ' + r.category_live_count + ' live ' + (r.category || 'uncategorized') + ' protocols in this snapshot'],
      ['growth factor', r.growth_multiplier, 'its own 7d TVL change of ' + pct(r.change_7d) + ', clamped and halved'],
      ['maturity factor', r.maturity_multiplier, 'tokenless for ' + days(r.age_days)],
    ];
    var dom = terms[0];
    terms.forEach(function (t) { if (Math.abs(Math.log(t[1])) > Math.abs(Math.log(dom[1]))) dom = t; });
    var topShare = Math.round(r.rank / R.board_size * 100);
    var standing = r.rank <= 3 ? 'on the podium' : topShare <= 10 ? 'inside the top tenth of the board' : topShare <= 50 ? 'in the board\u2019s top half' : 'in the board\u2019s lower half';
    var driver = Math.abs(Math.log(dom[1])) < 0.01
      ? 'No factor moves it: all three multipliers sit at or near x1, so this rank is its TVL speaking almost alone.'
      : 'The term that moves it most is its <b>' + dom[0] + '</b> at ' + mult(dom[1]) + ' — ' + dom[2] + '.';
    var vsMedian = 'Its implied value is <b>' + (Math.round(r.implied_value_usd / median * 100) / 100) + 'x the board median</b> (' + money(median) + ').';
    var sens = 'The value is linear in TVL: on the same record with 10% more TVL it would read ' + full(Math.round(r.implied_value_usd * 1.1)) + ' instead of ' + full(r.implied_value_usd) + '.';
    return '<div class="panel"><h2>Why it ranks here</h2>' +
      '<p class="why">Rank ' + r.rank + ' of ' + R.board_size + ' — ' + standing + ', ' + (r.watchlist ? 'in the watchlist tier' : 'an early-radar row below the floor') + '. ' + vsMedian + '</p>' +
      '<p class="why">' + driver + '</p>' +
      '<p class="why">' + sens + ' Nothing else about the record is read: no name, no reputation, no signal from outside the snapshot.</p></div>';
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
      reasonPanel(r) +
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
      '<div class="controls">' + viewTabs() + '</div>';
  }

  // ---------- render + wiring ----------
  function render() {
    app.setAttribute('aria-busy', 'false');
    if (state.view === 'detail') app.innerHTML = detailView();
    else if (state.view === 'live') app.innerHTML = liveView();
    else if (state.view === 'method') app.innerHTML = methodView();
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
    var vm = document.getElementById('v-method');
    if (vm) vm.addEventListener('click', function () { setHash({ view: 'method', slug: '' }); });
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
