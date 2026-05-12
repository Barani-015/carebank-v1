
// ══════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════
const API = 'http://localhost:3000/api';

// ══════════════════════════════════════════════
// STATE (in-memory only)
// ══════════════════════════════════════════════
const state = {
  token: null,
  user: null,
  plan: null,
  transactions: [],
  selectedPlan: null,
  modalSelectedPlan: null,
  pendingCouponPlan: null,
  pendingCouponCode: null,
  pendingCouponDiscount: 0,
  redirectTimer: null,
  spendChart: null
};

const PLANS = {
  free:    { name:'Free',        price:0,    billing:'free',    emoji:'🌟', isPremium:false, key:'free' },
  monthly: { name:'Pro Monthly', price:499,  billing:'monthly', emoji:'🚀', isPremium:true,  key:'monthly' },
  yearly:  { name:'Pro Yearly',  price:4999, billing:'yearly',  emoji:'💎', isPremium:true,  key:'yearly' }
};

// ══════════════════════════════════════════════
// HTTP HELPERS
// ══════════════════════════════════════════════
async function apiPost(path, body) {
  const headers = { 'Content-Type':'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const r = await fetch(API + path, { method:'POST', headers, body: JSON.stringify(body) });
  return r.json();
}
async function apiPut(path, body) {
  const headers = { 'Content-Type':'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const r = await fetch(API + path, { method:'PUT', headers, body: JSON.stringify(body) });
  return r.json();
}
async function apiGet(path) {
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const r = await fetch(API + path, { headers });
  return r.json();
}

// ══════════════════════════════════════════════
// SCREEN HELPERS
// ══════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showAlert(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-alert ${type}`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3500);
}

function showImport(type, msg) {
  const el = document.getElementById('importStatus');
  if (!el) return;
  el.className = `import-status ${type}`;
  el.innerHTML = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

function showForm(which) {
  document.getElementById('loginForm').style.display = which === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = which === 'register' ? 'block' : 'none';
  document.getElementById('authAlert').style.display = 'none';
}

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) { showAlert('authAlert','Please enter email and password','error'); return; }
  showAlert('authAlert','🔐 Logging in...','info');
  try {
    const res = await apiPost('/auth/login', { email, password: pass });
    if (res.success) {
      state.token = res.token;
      state.user  = res.user;
      await loadSubscription();
      await loadTransactions();
      goToDashboard();
    } else {
      showAlert('authAlert', res.message || '❌ Invalid credentials', 'error');
    }
  } catch(e) {
    showAlert('authAlert','❌ Cannot reach server. Is it running?','error');
  }
}

async function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  if (!name || !email || !pass) { showAlert('authAlert','Please fill all fields','error'); return; }
  if (pass.length < 6)          { showAlert('authAlert','Password must be at least 6 chars','error'); return; }
  if (pass !== pass2)            { showAlert('authAlert','Passwords do not match','error'); return; }
  showAlert('authAlert','📝 Creating account...','info');
  try {
    const res = await apiPost('/auth/register', { name, email, password: pass });
    if (res.success) {
      state.token = res.token;
      state.user  = res.user;
      await apiPut('/subscription', { planKey: 'free' });
      await loadSubscription();
      showAlert('authAlert','✅ Account created!','success');
      setTimeout(goToDashboard, 1200);
    } else {
      showAlert('authAlert', res.message || '❌ Registration failed', 'error');
    }
  } catch(e) {
    showAlert('authAlert','❌ Cannot reach server','error');
  }
}

async function loadSubscription() {
  try {
    const res = await apiGet('/subscription');
    if (res.success) {
      state.plan = normalizePlan(res.subscription);
    } else {
      const created = await apiPut('/subscription', { planKey: 'free' });
      if (created.success) state.plan = normalizePlan(created.subscription);
      else state.plan = normalizePlan({ planKey: 'free', startDate: new Date().toISOString(), status: 'active' });
    }
  } catch(e) {
    state.plan = normalizePlan({ planKey: 'free', startDate: new Date().toISOString(), status: 'active' });
  }
}

function normalizePlan(sub) {
  const key = sub.planKey || sub.key || sub.plan_key || 'free';
  const defaults = PLANS[key] || PLANS.free;
  return {
    ...defaults,
    ...sub,
    planKey: key,
    name:    sub.name    || defaults.name,
    emoji:   sub.emoji   || defaults.emoji,
    isPremium: sub.isPremium !== undefined ? sub.isPremium : defaults.isPremium,
  };
}

// Update the loadTransactions function
async function loadTransactions() {
    try {
        console.log('🔄 Loading transactions...');
        const res = await apiGet('/transactions');
        console.log('📊 Transactions response:', res);
        
        if (res.success) {
            state.transactions = res.transactions || [];
            console.log('✅ Loaded', state.transactions.length, 'transactions');
            renderTransactions();
            updateChart();
            updateBalanceStats();
        } else {
            state.transactions = [];
        }
    } catch(e) { 
        console.error('Load transactions error:', e);
        state.transactions = []; 
    }
}


// Add this new function for file uploads
async function apiUploadFile(path, file) {
    const formData = new FormData();
    formData.append('csvFile', file);
    
    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    
    const response = await fetch(API + path, {
        method: 'POST',
        headers: headers,  // Don't set Content-Type
        body: formData
    });
    
    return response.json();
}

async function doLogout() {
  let msg = 'Are you sure you want to sign out?';
  if (state.plan && state.plan.endDate) {
    const diff = Math.ceil((new Date(state.plan.endDate) - new Date()) / 86400000);
    if (diff > 0) msg += `\n📅 ${diff} day(s) remaining on ${state.plan.name}.`;
  }
  if (!confirm(msg)) return;
  try { await apiPost('/auth/logout', {}); } catch(e) {}
  state.token = null; state.user = null; state.plan = null;
  state.transactions = []; state.selectedPlan = null;
  state.modalSelectedPlan = null; state.pendingCouponPlan = null;
  if (state.redirectTimer) { clearInterval(state.redirectTimer); state.redirectTimer = null; }
  document.getElementById('loginEmail').value = 'demo@carebank.com';
  document.getElementById('loginPassword').value = 'demo123';
  showForm('login');
  closeUpgradeModal();
  showScreen('authScreen');
}

// ══════════════════════════════════════════════
// SUBSCRIPTION SCREEN
// ══════════════════════════════════════════════
function selectPlan(key, el) {
  state.selectedPlan = key;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

async function confirmSub() {
  if (!state.selectedPlan) { showAlert('subAlert','Please select a plan','error'); return; }
  showAlert('subAlert','🔄 Processing...','info');
  try {
    const res = await apiPut('/subscription', { planKey: state.selectedPlan });
    if (res.success) {
      state.plan = normalizePlan(res.subscription);
      showSuccessScreen();
    } else {
      showAlert('subAlert', res.message || '❌ Failed', 'error');
    }
  } catch(e) {
    showAlert('subAlert','❌ Network error','error');
  }
}

function showSuccessScreen() {
  const fn = (state.user.name || 'User').split(' ')[0];
  const p = state.plan;
  document.getElementById('successTitle').textContent = `🎉 Welcome, ${fn}!`;
  document.getElementById('successMsg').innerHTML = `You've subscribed to <strong>${p.name}</strong>.`;
  const priceStr = p.price === 0 ? 'Free Forever' : `₹${p.price.toLocaleString()}/${p.billing === 'monthly' ? 'month' : 'year'}`;
  const endStr = p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '—';
  document.getElementById('successDetails').innerHTML =
    `<div><strong>Plan:</strong> ${p.emoji} ${p.name}</div>
     <div><strong>Price:</strong> ${priceStr}</div>
     <div><strong>Start Date:</strong> ${new Date(p.startDate).toLocaleDateString()}</div>
     ${p.endDate ? `<div><strong>Valid Until:</strong> ${endStr}</div>` : ''}`;
  showScreen('successScreen');
  let secs = 3;
  if (state.redirectTimer) clearInterval(state.redirectTimer);
  state.redirectTimer = setInterval(() => {
    secs--;
    const el = document.getElementById('successCountdown');
    if (el) el.textContent = secs > 0 ? `Redirecting in ${secs} seconds...` : 'Redirecting now...';
    if (secs <= 0) { clearInterval(state.redirectTimer); state.redirectTimer = null; goToDashboard(); }
  }, 1000);
}

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
function goToDashboard() {
  if (state.redirectTimer) { clearInterval(state.redirectTimer); state.redirectTimer = null; }
  if (!state.user || !state.plan) { showScreen('authScreen'); return; }
  populateDashboard();
  showScreen('dashboardScreen');
  setTimeout(() => {
    renderTransactions();
    initChart();
    renderFinancialSummary();
    syncCSVButton();
  }, 60);
}

function populateDashboard() {
  const u = state.user, p = state.plan;
  const fn = (u.name||'User').split(' ')[0];
  const initial = fn.charAt(0).toUpperCase();
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greet}, ${fn} ✨`;
  ['headerAv','sidebarAv'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = initial; });
  document.getElementById('sidebarName').textContent  = u.name || 'User';
  document.getElementById('sidebarEmail').textContent = u.email || '';

  let daysHtml = '';
  if (p.endDate) {
    const diff = Math.ceil((new Date(p.endDate) - new Date()) / 86400000);
    if (diff > 0) daysHtml = `<div style="font-size:11px;color:${diff <= 7 ? 'var(--amber)':'var(--green)'};margin-top:4px">${diff <= 7 ? '⚠️':'✅'} ${diff} day${diff !== 1 ? 's':''} remaining</div>`;
  } else if (p.key === 'free' || p.planKey === 'free') {
    daysHtml = `<div style="font-size:11px;color:var(--text3);margin-top:4px">✨ Free forever</div>`;
  }
  const planKey = p.planKey || p.key || 'free';
  document.getElementById('sidebarPlanBadge').innerHTML =
    `<span class="plan-pill ${planKey}">${p.emoji} ${p.name}</span>${daysHtml}`;

  const isPremium = p.isPremium;
  ['Budget','Coach','Fraud','Products'].forEach(name => {
    const nav = document.getElementById('nav'+name);
    const lock = document.getElementById('lock'+name);
    if (!nav || !lock) return;
    if (isPremium) { nav.classList.remove('locked'); lock.style.display = 'none'; }
    else           { nav.classList.add('locked');    lock.style.display = ''; }
  });

  const la = document.getElementById('lockedAgentsWrap');
  if (la) la.style.display = isPremium ? 'none' : 'block';
  const pb = document.getElementById('promoBanner');
  if (pb) pb.style.display = isPremium ? 'none' : 'block';

  document.getElementById('greetSub').textContent = isPremium
    ? `${p.name} · All AI agents unlocked 🚀`
    : 'Free Plan · Dashboard & Transactions available';

  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    if (isPremium) { upgradeBtn.textContent = `✨ ${p.name} Active`; upgradeBtn.disabled = true; }
    else           { upgradeBtn.textContent = '⚡ Upgrade Plan'; upgradeBtn.disabled = false; }
  }
}

function updateBalanceStats() {
  let bal = 0, spend = 0, income = 0;
  state.transactions.forEach(t => {
    if (t.type === 'credit') { bal += t.amount; income += t.amount; }
    else { bal -= t.amount; spend += t.amount; }
  });
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('balAmt', `₹${bal.toLocaleString()}`);
  el('statSpend', `₹${spend.toLocaleString()}`);
  const rate = income > 0 ? Math.round((income - spend) / income * 100) : 0;
  el('statRate', `${Math.max(0, rate)}%`);
  const pf = document.getElementById('progFill');
  if (pf) pf.style.width = `${Math.min(Math.max(0, rate), 100)}%`;
}

function syncCSVButton() {
  const btn = document.getElementById('csvBtn');
  if (!btn) return;
  const isPremium = state.plan && state.plan.isPremium;
  if (isPremium) {
    btn.classList.remove('locked');
    btn.style.background = 'linear-gradient(135deg,var(--green),#059669)';
    btn.onclick = () => document.getElementById('csvFile').click();
  } else {
    btn.classList.add('locked');
    btn.style.background = '';
    btn.onclick = openUpgradeModal;
  }
}

function handleCSV() {
  if (state.plan && state.plan.isPremium) {
    openCSVUploadModal(); // Open the upload modal instead of file input directly
  } else {
    openUpgradeModal();
  }
}

// ══════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════
function renderTransactions() {
  const list = document.getElementById('txList');
  if (!list) return;
  const txs = state.transactions;
  if (!txs.length) {
    list.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:14px">No transactions yet. Import a CSV to get started.</div>';
    ['txCount','txTotal','totalCr','totalDr'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '0'; });
    updateDashTxList([]);
    return;
  }
  let cr = 0, dr = 0;
  list.innerHTML = txs.map(t => {
    if (t.type === 'credit') cr += t.amount; else dr += t.amount;
    return txRow(t);
  }).join('');
  document.getElementById('txCount').textContent = txs.length;
  document.getElementById('txTotal').textContent = txs.length;
  document.getElementById('totalCr').textContent = cr.toLocaleString();
  document.getElementById('totalDr').textContent = dr.toLocaleString();
  updateDashTxList(txs.slice(0, 3));
  updateBalanceStats();
}

function txRow(t) {
  const isC = t.type === 'credit';
  return `<div class="tx-item">
    <div class="tx-left">
      <div class="tx-ico ${isC ? 'credit':'debit'}">${isC ? '↑' : '↓'}</div>
      <div>
        <div class="tx-name">${esc(t.name)}</div>
        <div class="tx-meta"><span class="tx-date">${t.date}</span><span class="tx-cat">${t.category}</span></div>
      </div>
    </div>
    <div class="tx-right">
      <div class="tx-status" style="color:${t.status === 'success' ? 'var(--green)' : 'var(--red)'}">${t.status === 'success' ? '✓' : '✗'}</div>
      <div class="tx-amt ${isC ? 'credit':''}">${isC ? '+' : '-'}₹${t.amount.toLocaleString()}</div>
    </div>
  </div>`;
}

function updateDashTxList(txs) {
  const el = document.getElementById('dashTxList');
  if (!el) return;
  el.innerHTML = txs.length ? txs.map(txRow).join('') : '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No recent transactions</div>';
}

// ══════════════════════════════════════════════
// CSV PARSING
// ══════════════════════════════════════════════
// Update processCSV to use the new upload endpoint
function processCSV(input) {
    const file = input.files[0];
    if (!file) return;
    
    showImport('info', '📂 Uploading CSV file...');
    
    const formData = new FormData();
    formData.append('csvFile', file);
    
    fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.token}`
        },
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showImport('success', `✅ ${data.message}`);
            loadTransactions(); // Reload transactions
        } else {
            showImport('error', '❌ ' + (data.message || 'Upload failed'));
        }
    })
    .catch(err => {
        console.error('Upload error:', err);
        showImport('error', '❌ Network error. Please try again.');
    })
    .finally(() => {
        input.value = '';
    });
}
function parseCSV(csv) {
  const lines = csv.split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const fi = kw => headers.findIndex(h => kw.some(k => h.includes(k)));
  const ni = fi(['name','title','description']); const ai = fi(['amount','price','value']);
  const di = fi(['date','time','day']); const ci = fi(['category','tag']);
  const ti = fi(['type','transaction_type']); const si = fi(['status','state']);
  return lines.slice(1).map(line => {
    const line2 = line.trim(); if (!line2) return null;
    const v = parseCSVLine(line2);
    const amt = parseAmt(ai >= 0 ? v[ai] : '0');
    if (amt <= 0) return null;
    const typeRaw = ti >= 0 ? (v[ti]||'').toLowerCase() : '';
    return {
      name:     ni >= 0 ? (v[ni]||'Unknown') : 'Transaction',
      amount:   amt,
      date:     di >= 0 ? fmtDate(v[di]) : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
      category: ci >= 0 ? (v[ci]||'Other') : 'Other',
      type:     typeRaw.includes('credit') ? 'credit' : 'debit',
      status:   si >= 0 ? ((v[si]||'').toLowerCase().includes('fail') ? 'failed' : 'success') : 'success'
    };
  }).filter(Boolean);
}

function parseCSVLine(line) {
  const r=[]; let cur='', inQ=false;
  for (const c of line) {
    if (c==='"') inQ=!inQ;
    else if (c===',' && !inQ) { r.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  r.push(cur.trim()); return r;
}

function parseAmt(v) {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[^0-9.-]/g,''));
  return isNaN(n) ? 0 : Math.abs(n);
}

function fmtDate(s) {
  if (!s) return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  try { const d = new Date(s); if (!isNaN(d)) return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){}
  return s;
}

function esc(s) {
  if (!s) return '';
  return s.replace(/[&<>]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
}

// ══════════════════════════════════════════════
// DYNAMIC CHART
// ══════════════════════════════════════════════
function initChart() {
  const ctx = document.getElementById('spendChart');
  if (!ctx) return;
  if (state.spendChart) state.spendChart.destroy();
  
  const catTotals = {};
  state.transactions.forEach(t => {
    if (t.type === 'debit') {
      catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    }
  });
  
  let labels = Object.keys(catTotals);
  let data = labels.map(l => catTotals[l]);
  
  if (labels.length === 0) {
    labels = ['No Data'];
    data = [1];
  }
  
  Chart.defaults.color = '#5c5c7a';
  state.spendChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: 'rgba(124,106,247,0.7)', borderRadius: 8, borderSkipped: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `₹${ctx.raw.toLocaleString()}` } } },
      scales: { y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 11 }, callback: (val) => '₹'+val.toLocaleString() } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }
    }
  });
}

function updateChart() {
  if (!state.spendChart) { initChart(); return; }
  
  const catTotals = {};
  state.transactions.forEach(t => {
    if (t.type === 'debit') {
      catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    }
  });
  
  let labels = Object.keys(catTotals);
  let data = labels.map(l => catTotals[l]);
  
  if (labels.length === 0) { labels = ['No Data']; data = [1]; }
  
  state.spendChart.data.labels = labels;
  state.spendChart.data.datasets[0].data = data;
  state.spendChart.update();
  
  const totalSpend = state.transactions.filter(t => t.type === 'debit').reduce((s,t) => s + t.amount, 0);
  const totalIncome = state.transactions.filter(t => t.type === 'credit').reduce((s,t) => s + t.amount, 0);
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalSpend) / totalIncome) * 100) : 0;
  const wellnessScore = Math.min(100, Math.max(0, 50 + Math.floor(savingsRate / 2)));
  const gaugeFill = document.getElementById('gaugeBarFill');
  const gaugeVal = document.getElementById('gaugeVal');
  if (gaugeFill) gaugeFill.style.width = `${wellnessScore}%`;
  if (gaugeVal) gaugeVal.textContent = wellnessScore;
  const tip = document.getElementById('wellnessTip');
  if (tip) {
    if (savingsRate >= 30) tip.textContent = "🌟 Excellent! You're a saving superstar!";
    else if (savingsRate >= 20) tip.textContent = "👍 Great job! Keep up the healthy habits.";
    else if (savingsRate >= 10) tip.textContent = "📈 Good start! Try to save a bit more.";
    else tip.textContent = "💡 Aim to save at least 10-20% of your income.";
  }
}

// ══════════════════════════════════════════════
// FINANCIAL SUMMARY
// ══════════════════════════════════════════════
function renderFinancialSummary() {
  const savEl = document.getElementById('savingsContent');
  const lenEl = document.getElementById('lendingContent');
  if (savEl) savEl.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px;line-height:2">📊 AI recommendations will appear based on your data.<br>Consider: <strong>SIP in Mutual Funds</strong> · <strong>Recurring Deposit</strong></div>';
  if (lenEl) lenEl.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px;line-height:2">💳 Custom loan offers based on your spending.<br>Pre-qualified for: <strong>Low-interest Credit Card</strong></div>';

  const el = document.getElementById('summaryContent');
  if (!el) return;
  const txs = state.transactions;
  const spend = txs.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0);
  const income = txs.filter(t => t.type === 'credit').reduce((s,t) => s+t.amount, 0);
  const rate = income > 0 ? Math.round((income-spend)/income*100) : 0;
  const p = state.plan;
  const endText = p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : 'Lifetime';
  el.innerHTML = `<div style="padding:14px;line-height:2.2;font-size:13px;color:var(--text2)">
    <div><strong style="color:var(--text)">👤 Account Holder:</strong> ${esc(state.user.name)}</div>
    <div><strong style="color:var(--text)">📋 Current Plan:</strong> ${p.emoji} ${p.name}</div>
    <div><strong style="color:var(--text)">📅 Valid Until:</strong> ${endText}</div>
    <hr style="margin:10px 0;border:none;border-top:1px solid var(--border)">
    <div><strong style="color:var(--text)">💰 Total Income:</strong> ₹${income.toLocaleString()}</div>
    <div><strong style="color:var(--text)">💸 Total Spending:</strong> ₹${spend.toLocaleString()}</div>
    <div><strong style="color:var(--text)">🏦 Net Balance:</strong> ₹${(income-spend).toLocaleString()}</div>
    <div><strong style="color:var(--text)">📈 Savings Rate:</strong> ${Math.max(0,rate)}%</div>
    <div style="margin-top:10px;padding:10px;background:var(--green-bg);border-radius:10px;color:var(--green)">
      ✨ ${rate > 20 ? "Excellent! You're building wealth consistently." : "Aim for 20% savings rate. Consider reviewing expenses."}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// UPGRADE MODAL
// ══════════════════════════════════════════════
function openUpgradeModal() {
  if (!state.plan) return;
  state.modalSelectedPlan = null;
  document.getElementById('modalPlanView').style.display = 'block';
  document.getElementById('modalSuccessView').style.display = 'none';

  const p = state.plan;
  document.getElementById('currentPlanEmoji').textContent = p.emoji;
  document.getElementById('currentPlanName').textContent  = p.name;
  const start = new Date(p.startDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  const end   = p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Forever';
  document.getElementById('currentPlanDates').textContent = `Since ${start}${p.endDate ? ' · Renews '+end : ''}`;

  document.querySelectorAll('.modal-plan').forEach(c => {
    c.classList.remove('selected','current-active');
    const t = c.querySelector('.modal-current-tag');
    if (t) t.remove();
  });
  const planKey = p.planKey || p.key || 'free';
  const cap = planKey.charAt(0).toUpperCase() + planKey.slice(1);
  const cur = document.getElementById('mPlan' + cap);
  if (cur) {
    cur.classList.add('current-active');
    const tag = document.createElement('div');
    tag.className = 'modal-current-tag';
    tag.textContent = '✓ Current';
    cur.insertBefore(tag, cur.firstChild);
  }
  const btn = document.getElementById('modalConfirmBtn');
  btn.disabled = true; btn.textContent = 'Select a plan to continue';
  document.getElementById('upgradeModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  closeSidebar();
}

function closeUpgradeModal() {
  const bd = document.getElementById('upgradeModal');
  bd.classList.add('closing');
  setTimeout(() => {
    bd.style.display = 'none';
    bd.classList.remove('closing');
    document.body.style.overflow = '';
  }, 180);
}

function backdropClick(e) {
  if (e.target === document.getElementById('upgradeModal')) closeUpgradeModal();
}

function selectModalPlan(key, el) {
  state.modalSelectedPlan = key;
  document.querySelectorAll('.modal-plan').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const btn = document.getElementById('modalConfirmBtn');
  const planKey = (state.plan.planKey || state.plan.key || 'free');
  if (key === planKey) {
    btn.disabled = true; btn.textContent = '✓ This is your current plan'; return;
  }
  const p = PLANS[key];
  btn.disabled = false;
  if (key === 'free')    btn.textContent = 'Downgrade to Free Plan';
  else if (key === 'monthly') btn.textContent = '💰 Apply Coupon & Upgrade →';
  else                   btn.textContent = `Upgrade to ${p.name} — ₹${p.price}/year`;
}

// ══════════════════════════════════════════════
// RAZORPAY PAYMENT INTEGRATION (FIXED)
// ══════════════════════════════════════════════

// Get Razorpay key from backend
async function getRazorpayKey() {
  try {
    const res = await apiGet('/payments/key');
    if (res.success && res.key) {
      return res.key;
    }
  } catch (error) {
    console.error('Failed to get Razorpay key:', error);
  }
  // Fallback test key (replace with your actual test key)
  return 'rzp_test_YourTestKeyHere';
}

// Create payment order
async function createPaymentOrder(planKey, couponCode = null, discountPercent = 0) {
  try {
    showToast('Creating payment order...', 'info');
    
    const response = await fetch(`${API}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        planKey,
        couponCode,
        discountPercent
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      showToast(data.message || 'Failed to create payment order', 'error');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Create order error:', error);
    showToast('Network error. Please try again.', 'error');
    return null;
  }
}

// Verify payment
async function verifyPayment(orderId, paymentId, signature, planKey, couponCode, discountPercent) {
  try {
    const response = await fetch(`${API}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        planKey,
        couponCode,
        discountPercent
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Verify payment error:', error);
    return { success: false, message: 'Verification failed' };
  }
}

// Open Razorpay checkout
async function openRazorpayCheckout(planKey, planName, originalAmount, couponCode = null, discountPercent = 0) {
  try {
    // Check if Razorpay is loaded
    if (typeof Razorpay === 'undefined') {
      showToast('Payment system is loading. Please try again.', 'error');
      console.error('Razorpay not loaded');
      return;
    }
    
    // Validate state
    if (!state.token) {
      showToast('Please login first', 'error');
      return;
    }
    
    // Create order
    const order = await createPaymentOrder(planKey, couponCode, discountPercent);
    
    if (!order || !order.success) {
      showToast(order?.message || 'Failed to create payment order', 'error');
      return;
    }
    
    // Get Razorpay key
    const razorpayKey = await getRazorpayKey();
    
    // Configure Razorpay options
    const options = {
      key: razorpayKey,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'CareBank',
      description: `${planName} Plan Subscription`,
      order_id: order.orderId,
      image: 'https://carebank.com/logo.png',
      prefill: {
        name: state.user?.name || 'CareBank User',
        email: state.user?.email || 'user@carebank.com',
        contact: ''
      },
      notes: {
        plan_key: planKey,
        plan_name: planName,
        user_id: state.user?.id || 'unknown',
        coupon_code: couponCode || 'none',
        discount_percent: discountPercent || 0
      },
      theme: {
        color: '#7c6af7'
      },
      modal: {
        ondismiss: function() {
          showToast('Payment cancelled', 'info');
        }
      },
      handler: async function(response) {
        showToast('Payment successful! Verifying...', 'success');
        
        const verifyResult = await verifyPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
          planKey,
          couponCode,
          discountPercent
        );
        
        if (verifyResult.success) {
          showToast(`🎉 Successfully upgraded to ${planName}!`, 'success');
          
          if (verifyResult.subscription) {
            state.plan = normalizePlan(verifyResult.subscription);
          } else {
            await loadSubscription();
          }
          
          populateDashboard();
          syncCSVButton();
          renderTransactions();
          updateChart();
          
          closeUpgradeModal();
          const couponModal = document.getElementById('couponModal');
          if (couponModal) couponModal.style.display = 'none';
          
          const upgradeModal = document.getElementById('upgradeModal');
          const modalPlanView = document.getElementById('modalPlanView');
          const modalSuccessView = document.getElementById('modalSuccessView');
          
          if (upgradeModal && upgradeModal.style.display === 'flex' && modalPlanView && modalSuccessView) {
            modalPlanView.style.display = 'none';
            modalSuccessView.style.display = 'block';
            
            const p = state.plan;
            const endDate = p.endDate ? new Date(p.endDate) : null;
            const priceStr = p.price === 0 ? 'Free Forever' : `₹${p.price.toLocaleString()}/${p.billing === 'monthly' ? 'month' : 'year'}`;
            
            document.getElementById('modalSuccessTitle').textContent = `${p.emoji} Plan Updated!`;
            document.getElementById('modalSuccessSub').textContent = `You're now on the ${p.name} plan.`;
            document.getElementById('modalSuccessDetails').innerHTML = `
              <div><strong>Plan:</strong> ${p.emoji} ${p.name}</div>
              <div><strong>Price:</strong> ${priceStr}</div>
              <div><strong>Active from:</strong> ${new Date(p.startDate).toLocaleDateString()}</div>
              ${endDate ? `<div><strong>Valid until:</strong> ${endDate.toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'})}</div>` : ''}
              ${discountPercent > 0 ? `<div><strong>✨ Discount Applied:</strong> ${discountPercent}% off!</div>` : ''}
            `;
          }
          
          state.pendingCouponPlan = null;
          state.pendingCouponCode = null;
          state.pendingCouponDiscount = 0;
          
        } else {
          showToast(verifyResult.message || 'Payment verification failed', 'error');
        }
      }
    };
    
    const razorpayInstance = new Razorpay(options);
    razorpayInstance.open();
    
  } catch (error) {
    console.error('Razorpay error:', error);
    showToast('Payment initialization failed. Please try again.', 'error');
  }
}

// Confirm upgrade with Razorpay
async function confirmUpgradeWithRazorpay() {
  if (!state.modalSelectedPlan) {
    showToast('Please select a plan first', 'warning');
    return;
  }
  
  const currentPlanKey = state.plan.planKey || state.plan.key || 'free';
  const selectedPlanKey = state.modalSelectedPlan;
  
  if (selectedPlanKey === currentPlanKey) {
    showToast('This is already your current plan', 'info');
    return;
  }
  
  const selectedPlan = PLANS[selectedPlanKey];
  if (!selectedPlan) {
    showToast('Invalid plan selected', 'error');
    return;
  }
  
  // Handle free plan downgrade
  if (selectedPlanKey === 'free') {
    const confirmed = confirm('⚠️ Are you sure you want to downgrade to Free Plan?\n\nYou will lose access to:\n• CSV Import\n• AI Agents (Budgeting, Coach, Fraud Detection)\n• Financial Summary\n• Premium Features\n\nYour transaction history will remain accessible.');
    
    if (confirmed) {
      await doUpgrade(selectedPlanKey, null, 0);
      showToast('Downgraded to Free Plan', 'info');
    }
    return;
  }
  
  // Handle monthly plan - check if coupon should be applied first
  if (selectedPlanKey === 'monthly' && !state.pendingCouponPlan && !state.pendingCouponCode) {
    closeUpgradeModal();
    openCouponModal('monthly');
    return;
  }
  
  const planName = selectedPlan.name;
  const amount = selectedPlan.price;
  const couponCode = state.pendingCouponCode || null;
  const discountPct = state.pendingCouponDiscount || 0;
  
  state.pendingCouponPlan = null;
  state.pendingCouponCode = null;
  state.pendingCouponDiscount = 0;
  
  await openRazorpayCheckout(selectedPlanKey, planName, amount, couponCode, discountPct);
}

async function doUpgrade(planKey, couponCode, discountPct) {
  try {
    const body = { planKey };
    if (couponCode) { body.couponCode = couponCode; body.discount = discountPct; }
    const res = await apiPut('/subscription', body);
    if (res.success) {
      state.plan = normalizePlan(res.subscription);
      populateDashboard();
      syncCSVButton();
      renderTransactions();
      showToast(`Successfully upgraded to ${state.plan.name}!`, 'success');
      closeUpgradeModal();
    } else {
      showToast(res.message || 'Upgrade failed', 'error');
    }
  } catch(e) {
    showToast('Network error. Please try again.', 'error');
  }
}

// ══════════════════════════════════════════════
// COUPON MODAL
// ══════════════════════════════════════════════
function openCouponModal(plan) {
  state.pendingCouponPlan = plan;
  document.getElementById('couponCode').value = '';
  const msg = document.getElementById('couponMsg');
  msg.style.display = 'none';
  document.getElementById('upgradeModal').style.display = 'none';
  document.getElementById('couponModal').style.display = 'flex';
}

function showCouponMsg(type, text) {
  const el = document.getElementById('couponMsg');
  el.textContent = text;
  el.className = `coupon-msg ${type}`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3500);
}

async function applyCoupon() {
  const code = document.getElementById('couponCode').value.trim().toUpperCase();
  if (!code) { showCouponMsg('error', 'Please enter a coupon code'); return; }
  showCouponMsg('info', '🔄 Validating...');
  try {
    const res = await apiPost('/coupons/validate', { couponCode: code });
    if (res.success && res.valid) {
      state.pendingCouponCode = code;
      state.pendingCouponDiscount = res.discount;
      
      showCouponMsg('success', `🎉 ${res.message}`);
      setTimeout(async () => {
        document.getElementById('couponModal').style.display = 'none';
        
        if (res.discount >= 100) {
          showToast('🎉 Free upgrade! Processing...', 'success');
          await doUpgrade('monthly', code, res.discount);
          closeUpgradeModal();
        } else {
          const plan = PLANS['monthly'];
          await openRazorpayCheckout('monthly', plan.name, plan.price, code, res.discount);
        }
      }, 1200);
    } else {
      showCouponMsg('error', res.message || '❌ Invalid coupon code');
    }
  } catch (e) {
    console.error('Coupon error:', e);
    showCouponMsg('error', '❌ Network error. Please try again.');
  }
}

function skipCoupon() {
  const plan = state.pendingCouponPlan;
  state.pendingCouponPlan = null;
  document.getElementById('couponModal').style.display = 'none';
  if (plan) {
    const selectedPlan = PLANS[plan];
    openRazorpayCheckout(plan, selectedPlan.name, selectedPlan.price, null, 0);
  }
}

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
const TABS = ['dashboard','transactions','budget','ai-coach','fraud','products'];

function switchTab(tab, el) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    document.querySelectorAll('.nav-item').forEach(b => {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tab}'`)) b.classList.add('active');
    });
  }
  TABS.forEach(t => {
    const e = document.getElementById('tab-' + t);
    if (e) e.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'products') renderFinancialSummary();
  closeSidebar();
}

function navClick(tab, el) {
  if (!state.plan || !state.plan.isPremium) { openUpgradeModal(); return; }
  switchTab(tab, el);
}

// ══════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════
function openSidebar()  { document.getElementById('sidebar').classList.add('open');  document.getElementById('overlay').classList.add('active'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); }

let alertsVisible = false;
function toggleAlerts() {
  alertsVisible = !alertsVisible;
  if (alertsVisible) {
    const a = document.createElement('div');
    a.id = 'alertPopup';
    a.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:500;animation:slideUp .25s ease';
    a.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="font-size:14px">🔔 Proactive Alerts</strong><button onclick="toggleAlerts()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">✕</button></div><div style="font-size:13px;color:var(--text2);line-height:1.8">⚠️ Amazon.in charge flagged<br>✅ Savings goal on track<br>💡 Reduce dining by 12%</div>`;
    document.body.appendChild(a);
  } else {
    const el = document.getElementById('alertPopup');
    if (el) el.remove();
    alertsVisible = false;
  }
}

// ══════════════════════════════════════════════
// AGENT CHAT (Simple - No AI, just logs user prompt)
// ══════════════════════════════════════════════
const agentNames = {
  'budget-planner':'Budget Planner','expense-tracker':'Expense Tracker','savings-optimizer':'Savings Optimizer',
  'financial-coach':'Financial Coach','investment-advisor':'Investment Advisor','savings-coach':'Savings Coach',
  'fraud-detector':'Fraud Detector','risk-analyzer':'Risk Analyzer','security-advisor':'Security Advisor'
};
const agentEmojis = {
  'budget-planner':'📊','expense-tracker':'💰','savings-optimizer':'🎯',
  'financial-coach':'🤖','investment-advisor':'📈','savings-coach':'🎯',
  'fraud-detector':'🛡️','risk-analyzer':'⚠️','security-advisor':'🔐'
};

function addMsg(tab, who, text, emoji, tag) {
  const c = document.getElementById(tab + 'Msgs');
  if (!c) return;
  const initial = state.user ? state.user.name.charAt(0).toUpperCase() : '?';
  const isUser = who === 'user';
  const w = document.createElement('div');
  w.className = 'msg-row ' + (isUser ? 'user' : 'agent');
  w.innerHTML = `<div class="msg-av">${isUser ? initial : (emoji || '🤖')}</div>
    <div class="msg-bubble">
      ${!isUser ? `<div class="msg-agent-tag">${esc(tag || '')}</div>` : ''}
      ${esc(text)}
      <div class="msg-time">${new Date().toLocaleTimeString()}</div>
    </div>`;
  c.appendChild(w);
  c.scrollTop = c.scrollHeight;
}

function selAgent(section, agentId, el) {
  document.querySelectorAll(`#${section}Agents .agent-card`).forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const name = agentNames[agentId] || agentId;
  const emoji = agentEmojis[agentId] || '🤖';
  if (section === 'coach') document.getElementById('coachHdrTitle').textContent = name + ' · Online';
  if (section === 'fraud') document.getElementById('fraudHdrTitle').textContent = name + ' · Online';
  addMsg(section, 'agent', `Switched to ${name}. How can I help you today?`, emoji, name);
}

// Simple send message - just logs user prompt to console


function quickSimpleChat(section, message) {
  const input = document.getElementById(`${section}Input`);
  if (input) {
    input.value = message;
    sendSimpleChat(section);
  }
}

function agentCollab(section) {
  console.log(`[COLLAB REQUEST - ${section.toUpperCase()}]`, 'User triggered agent collaboration');
  addMsg(section, 'agent', '🤝 Starting multi-agent collaboration — all agents are now analyzing your data in real-time...', '🤝', 'System');
}

// Override existing functions
window.sendChat = sendSimpleChat;
window.quickSimpleChat = quickSimpleChat;
window.confirmUpgrade = confirmUpgradeWithRazorpay;
window.applyCoupon = applyCoupon;
window.skipCoupon = skipCoupon;

// ══════════════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// ══════════════════════════════════════════════
function showToast(message, type = 'success') {
  const existingToasts = document.querySelectorAll('.custom-toast');
  existingToasts.forEach(toast => toast.remove());
  
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  
  let emoji = '✅';
  if (type === 'error') emoji = '❌';
  if (type === 'info') emoji = 'ℹ️';
  if (type === 'warning') emoji = '⚠️';
  
  toast.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: ${getToastColor(type)};
      color: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
      min-width: 280px;
      max-width: 400px;
      animation: toastSlideIn 0.3s ease;
    ">
      <span style="font-size: 20px;">${emoji}</span>
      <span style="flex: 1; font-size: 13px; font-weight: 500; line-height: 1.4;">${escapeHtml(message)}</span>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: none;
        border: none;
        color: white;
        font-size: 16px;
        cursor: pointer;
        opacity: 0.7;
        padding: 4px;
      ">✕</button>
    </div>
  `;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 10000;
    font-family: 'Instrument Sans', sans-serif;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.style.animation = 'toastSlideOut 0.3s ease';
      setTimeout(() => {
        if (toast && toast.parentElement) toast.remove();
      }, 300);
    }
  }, 4000);
}

function getToastColor(type) {
  switch(type) {
    case 'success': return 'linear-gradient(135deg, #10b981, #059669)';
    case 'error': return 'linear-gradient(135deg, #ef4444, #dc2626)';
    case 'warning': return 'linear-gradient(135deg, #f59e0b, #d97706)';
    case 'info': return 'linear-gradient(135deg, #3b82f6, #2563eb)';
    default: return 'linear-gradient(135deg, #7c6af7, #5b4de0)';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const toastStyles = document.createElement('style');
toastStyles.textContent = `
  @keyframes toastSlideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes toastSlideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(toastStyles);

// ══════════════════════════════════════════════
// SMS INTEGRATION FROM ANDROID
// ══════════════════════════════════════════════
window.androidSmsData = [];
window.smsCallbacks = [];

window.receiveSmsFromAndroid = function(smsData) {
    console.log('📱 Received SMS data from Android:', smsData);
    
    window.androidSmsData = smsData;
    
    const transactions = convertSmsToTransactions(smsData);
    
    if (typeof state !== 'undefined' && state.transactions) {
        const existingIds = new Set(state.transactions.map(t => t.id));
        const newTransactions = transactions.filter(t => !existingIds.has(t.id));
        
        if (newTransactions.length > 0) {
            state.transactions = [...state.transactions, ...newTransactions];
            
            if (typeof renderTransactions === 'function') renderTransactions();
            if (typeof updateChart === 'function') updateChart();
            if (typeof updateBalanceStats === 'function') updateBalanceStats();
            
            showToast(`📱 Imported ${newTransactions.length} SMS transactions`, 'success');
        } else {
            showToast(`📱 SMS data synced (${smsData.length} messages)`, 'info');
        }
    }
    
    window.smsCallbacks.forEach(cb => cb(smsData));
};

window.requestSmsFromAndroid = function() {
    if (typeof AndroidSms !== 'undefined' && AndroidSms.getSmsData) {
        const data = AndroidSms.getSmsData();
        try {
            const parsed = JSON.parse(data);
            window.receiveSmsFromAndroid(parsed);
        } catch(e) {
            console.error('Failed to parse SMS data:', e);
        }
    } else {
        console.log('Android SMS interface not available');
    }
};

window.refreshSmsFromAndroid = function() {
    if (typeof AndroidSms !== 'undefined' && AndroidSms.refreshSms) {
        AndroidSms.refreshSms();
        AndroidSms.showToast('Refreshing SMS data...');
    }
};

window.onSmsReceived = function(callback) {
    if (typeof callback === 'function') {
        window.smsCallbacks.push(callback);
    }
};

function convertSmsToTransactions(smsArray) {
    const transactions = [];
    
    smsArray.forEach(sms => {
        const transaction = parseSmsForTransaction(sms);
        if (transaction) {
            transactions.push(transaction);
        }
    });
    
    return transactions;
}

function parseSmsForTransaction(sms) {
    const message = sms.message || '';
    
    const patterns = [
        /(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)\s+(?:spent|debited|paid|charged).*?(?:at|on|to)\s+([A-Za-z0-9\s&]+?)(?:\s+on|\s+at|\s+via|$)/i,
        /(?:debited|credited|spent)\s+(?:by\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i,
        /(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/i
    ];
    
    let amount = null;
    let merchant = 'Bank Transaction';
    let type = 'debit';
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            if (match[2]) {
                merchant = match[2].trim();
            }
            break;
        }
    }
    
    if (message.toLowerCase().includes('credited') || message.toLowerCase().includes('received')) {
        type = 'credit';
    }
    
    if (!amount || isNaN(amount)) return null;
    
    return {
        id: `sms_${sms.id || Date.now()}`,
        name: merchant,
        amount: amount,
        date: sms.dateFormatted || new Date(sms.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\//g, ' '),
        category: guessCategory(merchant, message),
        type: type,
        status: 'success',
        source: 'sms',
        rawSms: sms
    };
}

function guessCategory(merchant, message) {
    const text = (merchant + ' ' + message).toLowerCase();
    
    if (text.includes('swiggy') || text.includes('zomato') || text.includes('restaurant') || text.includes('food')) return 'Food';
    if (text.includes('amazon') || text.includes('flipkart') || text.includes('myntra') || text.includes('shopping')) return 'Shopping';
    if (text.includes('uber') || text.includes('ola') || text.includes('metro') || text.includes('petrol')) return 'Transport';
    if (text.includes('netflix') || text.includes('movie') || text.includes('entertainment')) return 'Entertainment';
    if (text.includes('electricity') || text.includes('water') || text.includes('gas') || text.includes('bill')) return 'Utilities';
    
    return 'Other';
}

function addSmsButtonToUI() {
    if (document.getElementById('smsImportBtn')) return;
    
    const txHeader = document.querySelector('#tab-transactions .card div[style*="display:flex"]');
    if (!txHeader) return;
    
    const smsBtn = document.createElement('button');
    smsBtn.id = 'smsImportBtn';
    smsBtn.className = 'csv-btn';
    smsBtn.style.background = 'linear-gradient(135deg, #7c6af7, #5b4de0)';
    smsBtn.style.marginLeft = '10px';
    smsBtn.innerHTML = '📱 Import SMS';
    smsBtn.onclick = function() {
        if (typeof AndroidSms !== 'undefined') {
            window.refreshSmsFromAndroid();
        } else {
            showToast('📱 Requesting SMS data...', 'info');
            setTimeout(() => {
                const mockSms = [
                    { id: 1, sender: 'HDFC Bank', message: 'Rs.500 spent on Swiggy', timestamp: Date.now() },
                    { id: 2, sender: 'ICICI Bank', message: 'Rs.1200 credited from Salary', timestamp: Date.now() }
                ];
                window.receiveSmsFromAndroid(mockSms);
            }, 500);
        }
    };
    
    txHeader.appendChild(smsBtn);
}

function initSmsIntegration() {
    console.log('📱 SMS Integration initialized');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addSmsButtonToUI);
    } else {
        addSmsButtonToUI();
    }
    
    setTimeout(() => {
        if (typeof AndroidSms !== 'undefined') {
            console.log('📱 Android SMS interface detected');
            window.requestSmsFromAndroid();
        } else {
            console.log('📱 Running in browser - Android SMS interface not available');
        }
    }, 1000);
    
    const originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function') {
        window.switchTab = function(tab, el) {
            originalSwitchTab(tab, el);
            if (tab === 'transactions') {
                setTimeout(addSmsButtonToUI, 100);
            }
        };
    }
}

initSmsIntegration();






// ai integration

// Replace the existing sendSimpleChat function
async function sendSimpleChat(section) {
  const input = document.getElementById(`${section}Input`);
  if (!input || !input.value.trim()) return;
  
  const userMessage = input.value.trim();
  input.value = '';
  
  // LOG USER PROMPT TO CONSOLE
  console.log(`[USER PROMPT - ${section.toUpperCase()}]`, userMessage);
  
  // Add user message to chat
  addMsg(section, 'user', userMessage);
  
  // Get active agent info
  const activeCard = document.querySelector(`#${section}Agents .agent-card.active`);
  let agentName = 'Agent';
  let agentEmoji = '🤖';
  
  if (activeCard) {
    const agentText = activeCard.querySelector('.agent-name')?.textContent || '';
    agentName = agentText;
    agentEmoji = activeCard.querySelector('.agent-icon')?.textContent || '🤖';
  }
  
  // Show typing indicator
  showTyping(section);
  
  try {
    // Get user ID from state (you need to store the user's folder ID)
    // For now, we'll use the user's email or ID from the backend
    const userId = state.user?.id || state.user?._id || state.user?.email;
    
    // Determine which endpoint to use based on section
    let apiUrl;
    let requestBody;
    
    if (section === 'budget') {
      // For Budget Planner - use transaction CSV endpoint
      apiUrl = 'http://localhost:5000/chat/transaction';
      requestBody = {
        user_id: userId,
        question: userMessage
      };
    } else {
      // For other sections - use simple chat
      apiUrl = 'http://localhost:5000/chat';
      requestBody = {
        prompt: `You are a ${agentName} financial assistant. ${userMessage}`
      };
    }
    
    console.log(`📡 Calling AI service: ${apiUrl}`);
    console.log(`📤 Request body:`, requestBody);
    
    // Call your Python Ollama service
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    console.log(`📥 Response:`, data);
    
    // Hide typing indicator
    hideTyping(section);
    
    if (data.success) {
      // Add AI response to chat
      let aiResponse = data.response;
      
      // If it's a transaction query and we have CSV info, show it
      if (data.csv_files_loaded) {
        aiResponse = `📊 Based on ${data.total_files} CSV file(s) (${data.total_rows} transactions):\n\n${data.response}`;
      }
      
      addMsg(section, 'agent', aiResponse, agentEmoji, agentName);
    } else {
      // Handle error
      addMsg(section, 'agent', `Sorry, I encountered an error: ${data.response || data.message || 'Please try again later.'}`, agentEmoji, agentName);
    }
    
  } catch (error) {
    console.error('Chat error:', error);
    hideTyping(section);
    addMsg(section, 'agent', `Sorry, I'm having trouble connecting to the AI service. Please make sure the Python service is running on port 5000.\n\nError: ${error.message}`, agentEmoji, agentName);
  }
}

// Add this function to get the user's CSV folder ID
async function getUserCSVFolderId() {
  // First, try to get from backend where user's folder is stored
  try {
    const response = await fetch(`${API}/user/csv-folder`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await response.json();
    if (data.success && data.folderId) {
      return data.folderId;
    }
  } catch (error) {
    console.log('Could not fetch CSV folder from backend, using fallback');
  }
  
  // Fallback: use user ID or email as folder name
  // In your uploadsCSVs folder, you have folders like "69ddec0ea6caed6e9922a769"
  // You need to map your user to these folder IDs
  const userId = state.user?.id || state.user?._id;
  
  // If you have a mapping in your database, use it
  // For demo, we'll use the user's ID
  return userId;
}

// Typing indicator functions
function showTyping(section) {
  const container = document.getElementById(`${section}Msgs`);
  if (!container) return;
  
  // Remove existing typing indicator
  hideTyping(section);
  
  const indicator = document.createElement('div');
  indicator.className = 'msg-row agent';
  indicator.id = `typing-${section}`;
  indicator.innerHTML = `
    <div class="msg-av">🤖</div>
    <div class="typing-indicator" style="display:flex;gap:4px;padding:12px 16px;background:var(--surface);border-radius:16px;width:fit-content;border:1px solid var(--border)">
      <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:typingBounce 1.4s infinite ease-in-out"></div>
      <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:typingBounce 1.4s infinite ease-in-out 0.2s"></div>
      <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;animation:typingBounce 1.4s infinite ease-in-out 0.4s"></div>
    </div>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hideTyping(section) {
  const indicator = document.getElementById(`typing-${section}`);
  if (indicator) indicator.remove();
}

// Add typing animation styles
const typingStyles = document.createElement('style');
typingStyles.textContent = `
  @keyframes typingBounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-8px);
      opacity: 1;
    }
  }
`;
document.head.appendChild(typingStyles);




// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  showScreen('authScreen');
  showForm('login');
});







// Open CSV upload modal
function openCSVUploadModal() {
    console.log('🔓 Opening CSV upload modal');
    console.log('User plan:', state.plan);
    console.log('Is premium:', state.plan?.isPremium);
    
    if (!state.plan || !state.plan.isPremium) {
        console.log('❌ Not premium, showing upgrade modal');
        openUpgradeModal();
        return;
    }
    
    console.log('✅ Premium user, showing upload modal');
    
    // Populate user info
    if (state.user) {
        document.getElementById('uploadUserName').textContent = state.user.name || 'User';
        document.getElementById('uploadUserEmail').textContent = state.user.email || '';
        document.getElementById('uploadUserId').textContent = state.user.id || state.user._id || 'N/A';
        document.getElementById('uploadUserPlan').textContent = state.plan?.name || 'Free Plan';
    }
    
    document.getElementById('csvUploadModal').style.display = 'flex';
    resetUploadUI();
}

function closeCSVUploadModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('csvUploadModal').style.display = 'none';
  resetUploadForm();
}

function resetUploadForm() {
  document.getElementById('uploadFileInfo').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('csvUploadInput').value = '';
}

// Handle file selection
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Validate file size (50MB)
  if (file.size > 50 * 1024 * 1024) {
    showToast('File size exceeds 50MB limit', 'error');
    input.value = '';
    return;
  }
  
  // Validate file type
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    showToast('Only CSV files are allowed', 'error');
    input.value = '';
    return;
  }
  
  // Show selected file info
  document.getElementById('selectedFileName').textContent = `${file.name} (${formatFileSize(file.size)})`;
  document.getElementById('uploadFileInfo').style.display = 'block';
  
  // Upload the file
  uploadFile(file);
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload file to server
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('csvFile', file);
  
  // Show progress bar
  const progressDiv = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('uploadProgressBar');
  const percentSpan = document.getElementById('uploadPercent');
  progressDiv.style.display = 'block';
  
  try {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percent + '%';
        percentSpan.textContent = percent + '%';
      }
    });
    
    // Handle response
    const response = await new Promise((resolve, reject) => {
      xhr.open('POST', `${API}/files/upload`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.statusText));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });
    
    if (response.success) {
      showToast(response.message, 'success');
      
      // Add transactions to state
      if (response.transactions && response.transactions.length > 0) {
        state.transactions = [...response.transactions, ...state.transactions];
        renderTransactions();
        updateChart();
        updateBalanceStats();
      }
      
      // Reset and close modal after short delay
      setTimeout(() => {
        resetUploadForm();
        closeCSVUploadModal();
        loadUserFiles(); // Refresh file list
      }, 1500);
    } else {
      showToast(response.message || 'Upload failed', 'error');
      resetUploadForm();
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    showToast('Failed to upload file. Please try again.', 'error');
    resetUploadForm();
  }
}

// Load user's uploaded files
async function loadUserFiles() {
  try {
    const response = await fetch(`${API}/files/files`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await response.json();
    
    if (data.success && data.files) {
      displayUserFiles(data.files);
    }
  } catch (error) {
    console.error('Load files error:', error);
  }
}



// Add after successful upload
async function analyzeCSV(fileId) {
    try {
        const response = await fetch(`${API}/ai/analyze/${fileId}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            addMsg('coach', 'agent', data.analysis.response, '🤖', 'CSV Analyst');
        }
    } catch (error) {
        console.error('Analysis error:', error);
    }
}

// Ask question about CSV
async function askCSVQuestion(fileId, question) {
    try {
        const response = await fetch(`${API}/ai/ask/${fileId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });
        const data = await response.json();
        
        if (data.success) {
            addMsg('coach', 'agent', data.answer.response, '🤖', 'CSV Analyst');
        }
    } catch (error) {
        console.error('Question error:', error);
    }
}

// Display uploaded files
function displayUserFiles(files) {
  const container = document.getElementById('filesListContainer');
  if (!container) return;
  
  if (files.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text3); font-size:13px">No files uploaded yet</div>';
    return;
  }
  
  container.innerHTML = files.map(file => `
    <div style="background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:8px">
      <div style="display:flex; justify-content:space-between; align-items:center">
        <div style="flex:1">
          <div style="font-size:13px; font-weight:600; color:var(--text)">📄 ${escapeHtml(file.originalName)}</div>
          <div style="font-size:11px; color:var(--text3); margin-top:4px">
            ${formatFileSize(file.fileSize)} · ${file.transactionCount} transactions · ${new Date(file.uploadDate).toLocaleDateString()}
          </div>
          <div style="font-size:11px; margin-top:4px">
            <span style="color:${file.status === 'completed' ? 'var(--green)' : 'var(--amber)'}">
              ${file.status === 'completed' ? '✓ Completed' : '⏳ Processing'}
            </span>
          </div>
        </div>
        <button onclick="deleteUploadedFile('${file.id}')" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:8px" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

// Delete uploaded file
async function deleteUploadedFile(fileId) {
  if (!confirm('Are you sure you want to delete this file? Transactions from this file will remain in your account.')) return;
  
  try {
    const response = await fetch(`${API}/files/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await response.json();
    
    if (data.success) {
      showToast('File deleted successfully', 'success');
      loadUserFiles(); // Refresh list
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Failed to delete file', 'error');
  }
}
