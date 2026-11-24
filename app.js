/* =========================================================
   Checklist Diário de Equipamentos — lógica da aplicação
   Vanilla JS (ES6+), localStorage + Firebase (Firestore)
   ========================================================= */
'use strict';

/* ---------- 1. Constantes e estado ---------- */
const KEYS = { equip: 'ced_equip', hist: 'ced_history', session: 'ced_session', prefs: 'ced_prefs', meta: 'ced_meta' };

const DEFAULT_EQUIP = [
  { id: 'tablets',     name: 'Tablets',         expected: 15 },
  { id: 'celulares',   name: 'Celulares',       expected: 15 },
  { id: 'carregadores',name: 'Carregadores',    expected: 30, auto: true },
  { id: 'smartwatches',name: 'Smartwatches',    expected: 10 },
  { id: 'vrbox',       name: 'VR Box',          expected: 10 },
  { id: 'metaverso',   name: 'Óculos Metaverso',expected: 5 }
];

const state = {
  equip: [],
  counts: {},
  notes: '',
  history: [],
  prefs: { instrutor: '', escola: '', turno: 'Manhã', theme: 'light', declare: true },
  currentReport: null,
  laudoCounter: 1,           // próximo número de laudo
  firebase: null,            // instância do Firebase
  db: null,                  // referência do Firestore
  firebaseReady: false,      // se o Firebase foi inicializado com sucesso
  online: navigator.onLine   // estado de conexão
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ---------- 2. Firebase ---------- */
function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      state.firebaseReady = false;
      return;
    }
    // Verifica se as credenciais foram preenchidas (não são placeholders)
    const cfg = firebaseConfig || {};
    if (!cfg.apiKey || cfg.apiKey.includes('SUA_API_KEY')) {
      state.firebaseReady = false;
      toast('Firebase não configurado. Usando apenas armazenamento local.');
      return;
    }
    firebase.initializeApp(cfg);
    state.db = firebase.firestore();
    // Habilita persistência offline do Firestore
    state.db.enablePersistence().catch(() => {});
    state.firebase = firebase;
    state.firebaseReady = true;
    toast('Firebase conectado. Dados sincronizados na nuvem.');
  } catch (e) {
    console.warn('Falha ao inicializar Firebase:', e);
    state.firebaseReady = false;
  }
}

/* ---------- 3. Persistência híbrida (local + nuvem) ---------- */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { toast('Armazenamento local cheio ou bloqueado.'); }
}
const saveEquip = () => save(KEYS.equip, state.equip);
const saveHist = () => save(KEYS.hist, state.history);
const savePrefs = () => save(KEYS.prefs, state.prefs);
const saveSession = () => save(KEYS.session, { counts: state.counts, notes: state.notes });
const saveMeta = () => save(KEYS.meta, { laudoCounter: state.laudoCounter });

// Salva no Firestore (nuvem) quando disponível
async function saveToCloud(collection, docId, data) {
  if (!state.firebaseReady || !state.db) return;
  try {
    await state.db.collection(collection).doc(docId).set(data, { merge: true });
  } catch (e) {
    // Silencioso: se estiver offline, o localStorage mantém o dado
  }
}

// Carrega histórico do Firestore se disponível
async function loadHistoryFromCloud() {
  if (!state.firebaseReady || !state.db) return [];
  try {
    const snap = await state.db.collection('reports').orderBy('ts', 'desc').get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    return [];
  }
}

async function savePrefsToCloud() {
  await saveToCloud('prefs', 'user', state.prefs);
}
async function saveEquipToCloud() {
  await saveToCloud('equip', 'list', { equip: state.equip });
}
async function saveReportToCloud(report) {
  await saveToCloud('reports', report.id, report);
}
async function saveMetaToCloud() {
  await saveToCloud('meta', 'counter', { laudoCounter: state.laudoCounter });
}

/* ---------- 4. Número de laudo ---------- */
function getNextLaudoNumber() {
  const n = state.laudoCounter;
  state.laudoCounter = n + 1;
  saveMeta(); saveMetaToCloud();
  return n;
}
function formatLaudo(n) {
  const year = new Date().getFullYear();
  return `LAUDO-${year}-${String(n).padStart(4, '0')}`;
}

/* ---------- 5. Regra dos carregadores ---------- */
function recalcAuto() {
  const t = state.equip.find(e => e.id === 'tablets');
  const c = state.equip.find(e => e.id === 'celulares');
  const car = state.equip.find(e => e.id === 'carregadores');
  if (t && c && car && car.auto) car.expected = (+t.expected || 0) + (+c.expected || 0);
}

/* ---------- 6. Utilidades de data e status ---------- */
function nowParts() {
  const d = new Date();
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    ts: d.toISOString()
  };
}
const diffOf = (found, expected) => found - expected;
function diffLabel(d) { return d < 0 ? `${d} faltando` : `+${d} excedente`; }

/* ---------- 7. Sincronização visual dos checkboxes ---------- */
function syncQuickCheck(id) {
  const e = state.equip.find(x => x.id === id);
  if (!e) return;
  const item = $(`.check-item[data-id="${id}"]`);
  if (!item) return;
  const cb = $('input[type="checkbox"]', item);
  const found = state.counts[id];
  const checked = found != null && found >= e.expected;
  if (cb) cb.checked = checked;
  if (checked) item.classList.add('checked'); else item.classList.remove('checked');
}

/* ---------- 8. Renderização do checklist ---------- */
function renderItems() {
  const box = $('#items');
  if (!state.equip.length) {
    box.innerHTML = '<div class="empty">Nenhum equipamento cadastrado. Use “Gerenciar equipamentos” para adicionar.</div>';
    updateProgress();
    return;
  }
  box.innerHTML = state.equip.map(e => {
    const found = state.counts[e.id];
    return `<article class="item" data-id="${e.id}">
      <div class="item-head">
        <div><div class="item-name">${esc(e.name)}</div><div class="item-exp">Esperado: <strong>${e.expected}</strong></div></div>
        <span class="badge"></span>
      </div>
      <div class="counter">
        <button type="button" data-act="minus" aria-label="Diminuir ${esc(e.name)}">−</button>
        <input type="number" inputmode="numeric" min="0" value="${found ?? ''}" placeholder="—" aria-label="Quantidade encontrada de ${esc(e.name)}">
        <button type="button" data-act="plus" aria-label="Aumentar ${esc(e.name)}">+</button>
        <button type="button" class="ok-btn" data-act="ok">OK</button>
      </div>
    </article>`;
  }).join('');
  state.equip.forEach(e => paintItem(e.id));
  updateProgress();
}

function paintItem(id) {
  const e = state.equip.find(x => x.id === id);
  const card = $(`.item[data-id="${id}"]`);
  if (!e || !card) return;
  const found = state.counts[id];
  const badge = $('.badge', card);
  card.className = 'item';
  if (found == null) { card.classList.add('pending'); badge.className = 'badge pending'; badge.textContent = 'Não conferido'; syncQuickCheck(id); return; }
  const d = diffOf(found, e.expected);
  if (d === 0) { card.classList.add('match'); badge.className = 'badge match'; badge.textContent = '✓ Confere'; }
  else {
    card.classList.add('diff'); if (d > 0) card.classList.add('excess');
    badge.className = 'badge ' + (d < 0 ? 'missing' : 'excess');
    badge.textContent = '⚠ ' + diffLabel(d);
  }
  syncQuickCheck(id);
}

function updateProgress() {
  const done = state.equip.filter(e => state.counts[e.id] != null).length;
  const divs = state.equip.filter(e => state.counts[e.id] != null && state.counts[e.id] !== e.expected).length;
  $('#progress').textContent = `${done} de ${state.equip.length} conferidos` + (divs ? ` · ${divs} com divergência` : '');
}

function setCount(id, value) {
  state.counts[id] = value === null || value === '' || isNaN(value) ? null : Math.max(0, Math.floor(+value));
  const input = $(`.item[data-id="${id}"] input`);
  if (input && document.activeElement !== input) input.value = state.counts[id] ?? '';
  paintItem(id); updateProgress(); saveSession();
}

function onItemsClick(ev) {
  const btn = ev.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('.item').dataset.id;
  const e = state.equip.find(x => x.id === id);
  const cur = state.counts[id];
  const act = btn.dataset.act;
  if (act === 'plus') setCount(id, (cur ?? 0) + 1);
  if (act === 'minus') setCount(id, Math.max(0, (cur ?? e.expected) - 1));
  if (act === 'ok') setCount(id, e.expected);
}
function onItemsInput(ev) {
  if (ev.target.matches('.item input')) setCount(ev.target.closest('.item').dataset.id, ev.target.value);
}

function resetCounts() {
  if (!confirm('Zerar a conferência de hoje? Os equipamentos cadastrados serão mantidos.')) return;
  state.counts = {}; state.notes = ''; $('#inNotes').value = '';
  saveSession(); renderItems(); renderQuickChecks(); toast('Contagem resetada');
}

/* ---------- 9. Marcação rápida por checkboxes ---------- */
function renderQuickChecks() {
  const box = $('#quickChecks');
  if (!state.equip.length) { box.innerHTML = ''; return; }
  box.innerHTML = state.equip.map(e => {
    const checked = state.counts[e.id] != null && state.counts[e.id] >= e.expected;
    return `<div class="check-item${checked ? ' checked' : ''}" data-id="${e.id}">
      <label><input type="checkbox" ${checked ? 'checked' : ''} aria-label="Marcar ${esc(e.name)} como encontrado">${esc(e.name)}</label>
      <span class="check-expected">Esperado: ${e.expected}</span>
    </div>`;
  }).join('');
}

function handleQuickCheckClick(ev) {
  const item = ev.target.closest('.check-item'); if (!item) return;
  const id = item.dataset.id;
  const e = state.equip.find(x => x.id === id);
  if (!e) return;
  const cb = $('input[type="checkbox"]', item);
  if (!cb) return;
  cb.checked = !cb.checked;
  if (cb.checked) setCount(id, e.expected);
  else setCount(id, null);
}

function selectAllQuick() {
  state.equip.forEach(e => setCount(e.id, e.expected));
  renderQuickChecks();
  renderItems();
  toast('Todos os itens selecionados');
}

function selectNoneQuick() {
  state.equip.forEach(e => setCount(e.id, null));
  renderQuickChecks();
  renderItems();
  toast('Seleção limpa');
}

/* ---------- 10. Gerenciar equipamentos (CRUD) ---------- */
function renderManage() {
  $('#manageList').innerHTML = state.equip.map(e => `
    <div class="m-row" data-id="${e.id}">
      <input type="text" value="${esc(e.name)}" data-f="name" aria-label="Nome">
      <input type="number" min="0" value="${e.expected}" data-f="expected" aria-label="Quantidade esperada">
      <button class="btn danger small" data-del type="button">Remover</button>
      ${e.id === 'carregadores' ? `<label class="auto"><input type="checkbox" data-f="auto" ${e.auto ? 'checked' : ''}> Calcular automaticamente (Tablets + Celulares)</label>` : ''}
    </div>`).join('') || '<div class="empty">Lista vazia.</div>';
}

function onManageInput(ev) {
  const row = ev.target.closest('.m-row'); if (!row) return;
  const e = state.equip.find(x => x.id === row.dataset.id);
  const f = ev.target.dataset.f;
  if (f === 'name') e.name = ev.target.value.trim() || e.name;
  if (f === 'expected') {
    e.expected = Math.max(0, Math.floor(+ev.target.value || 0));
    if (e.id === 'carregadores') e.auto = false;
  }
  if (f === 'auto') e.auto = ev.target.checked;
  recalcAuto();
  const car = state.equip.find(x => x.id === 'carregadores');
  if (car) {
    const carRow = $(`.m-row[data-id="carregadores"]`);
    if (carRow) {
      $('[data-f="expected"]', carRow).value = car.expected;
      $('[data-f="auto"]', carRow).checked = !!car.auto;
    }
  }
  saveEquip(); saveEquipToCloud(); renderItems(); renderQuickChecks();
}

function onManageClick(ev) {
  if (!ev.target.matches('[data-del]')) return;
  const id = ev.target.closest('.m-row').dataset.id;
  const e = state.equip.find(x => x.id === id);
  if (!confirm(`Remover “${e.name}” da lista?`)) return;
  state.equip = state.equip.filter(x => x.id !== id);
  delete state.counts[id];
  recalcAuto(); saveEquip(); saveEquipToCloud(); saveSession(); renderManage(); renderItems();
}

function onAddItem(ev) {
  ev.preventDefault();
  const name = $('#newName').value.trim();
  const qty = Math.max(0, Math.floor(+$('#newQty').value || 0));
  if (!name) return;
  state.equip.push({ id: uid(), name, expected: qty });
  saveEquip(); saveEquipToCloud(); renderManage(); renderItems(); renderQuickChecks();
  $('#newName').value = ''; $('#newQty').value = 1; toast('Equipamento adicionado');
}

/* ---------- 11. Relatório ---------- */
function finishChecklist() {
  if (!state.equip.length) return toast('Cadastre ao menos um equipamento.');

  const instrutor = $('#inInstrutor').value.trim();
  const escola = $('#inEscola').value.trim();
  const declare = $('#inDeclarante').checked;
  if (!instrutor) { $('#inInstrutor').focus(); return toast('Informe o nome do(a) instrutor(a).'); }
  if (!escola) { $('#inEscola').focus(); return toast('Informe o nome da escola.'); }
  if (!declare) { $('#inDeclarante').focus(); return toast('Marque a declaração de responsabilidade.'); }

  const pending = state.equip.filter(e => state.counts[e.id] == null);
  if (pending.length && !confirm(`${pending.length} item(ns) não conferido(s) será(ão) registrado(s) como 0. Continuar?`)) return;

  const t = nowParts();
  const laudoNum = getNextLaudoNumber();
  const items = state.equip.map(e => ({ name: e.name, expected: e.expected, found: state.counts[e.id] ?? 0 }));
  const report = {
    id: uid(), laudo: formatLaudo(laudoNum), date: t.date, time: t.time, iso: t.iso, ts: t.ts,
    instrutor: instrutor,
    escola: escola,
    turno: state.prefs.turno,
    declare: declare,
    items, notes: state.notes.trim(),
    hasDivergence: items.some(i => i.found !== i.expected)
  };
  state.history.unshift(report);
  saveHist(); saveReportToCloud(report); renderHistory();
  openReport(report);
  toast('Relatório salvo (laudo ' + report.laudo + ')');
}

function reportHTML(r) {
  const rows = r.items.map(i => {
    const d = i.found - i.expected;
    return `<tr><td>${esc(i.name)}</td><td>${i.found}</td><td>${i.expected}</td>
      <td class="${d ? 'st-div' : 'st-ok'}">${d ? 'Divergência ' + (d > 0 ? '+' : '') + d : 'OK'}</td></tr>`;
  }).join('');
  return `<h3>Checklist de Equipamentos — Laudo ${esc(r.laudo || '—')}</h3>
    <p><strong>Data/Hora:</strong> ${r.date} às ${r.time}<br>
    <strong>Instrutor(a) / Responsável:</strong> ${esc(r.instrutor || '—')}<br>
    <strong>Escola:</strong> ${esc(r.escola || '—')} · <strong>Turno:</strong> ${esc(r.turno)}<br>
    <strong>Declaração:</strong> ${r.declare ? 'Confiro os itens acima e me responsabilizo pelas informações.' : '—'}</p>
    <table><thead><tr><th>Equipamento</th><th>Encontrado</th><th>Esperado</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p><strong>Resumo:</strong> ${r.items.length} itens conferidos —
      <span class="${r.hasDivergence ? 'st-div' : 'st-ok'}">${r.hasDivergence ? 'Com divergências' : 'Sem divergências'}</span></p>
    <p><strong>Divergências / Observações:</strong></p>
    <div class="notes">${esc(r.notes) || 'Nenhuma observação registrada.'}</div>
    <p style="margin-top:1.5rem;font-size:.8rem;color:var(--muted)">Documento gerado em ${r.date} às ${r.time} — Checklist Diário de Equipamentos</p>`;
}

function reportText(r) {
  const L = [];
  L.push(`*📋 CHECKLIST DE EQUIPAMENTS — Laudo ${r.laudo || '—'}*`, '');
  L.push(`📅 *Data/Hora:* ${r.date} às ${r.time}`, `👤 *Instrutor(a):* ${r.instrutor || '—'}`, `🏫 *Escola:* ${r.escola || '—'}`, `🌓 *Turno:* ${r.turno}`, '');
  L.push('*Equipamentos:*');
  r.items.forEach(i => {
    const d = i.found - i.expected;
    L.push(`${d ? '⚠️' : '✅'} ${i.name} — Encontrado: ${i.found} / Esperado: ${i.expected} (${d ? 'Divergência de ' + (d > 0 ? '+' : '') + d : 'OK'})`);
  });
  L.push('', `*Resumo:* ${r.items.length} itens conferidos — ${r.hasDivergence ? '⚠️ *Com divergências*' : '✅ *Sem divergências*'}`, '');
  L.push('*Observações:*', r.notes || 'Nenhuma observação registrada.');
  return L.join('\n');
}

function openReport(r) {
  state.currentReport = r;
  $('#reportView').innerHTML = reportHTML(r);
  $('#reportModal').showModal();
}

async function copyReport() {
  const text = reportText(state.currentReport);
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {} ta.remove();
  }
  toast('Relatório copiado!');
}

/* Geração de PDF real com jsPDF */
function generatePDF() {
  const r = state.currentReport;
  if (!r) return toast('Nenhum relatório aberto.');
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return toast('Biblioteca PDF não carregada.');

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Checklist de Equipamentos', 20, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Laudo: ${r.laudo || '—'}`, 20, y);
  y += 6;
  doc.text(`Data/Hora: ${r.date} às ${r.time}`, 20, y);
  y += 6;
  doc.text(`Instrutor(a) / Responsável: ${r.instrutor || '—'}`, 20, y);
  y += 6;
  doc.text(`Escola: ${r.escola || '—'}  ·  Turno: ${r.turno}`, 20, y);
  y += 6;
  doc.text(`Declaração: ${r.declare ? 'Confiro os itens acima e me responsabilizo pelas informações.' : '—'}`, 20, y);
  y += 10;

  // Tabela simples
  doc.setFont('helvetica', 'bold');
  doc.text('Equipamentos', 20, y);
  y += 6;
  const headers = ['Equipamento', 'Encontrado', 'Esperado', 'Status'];
  const colX = [20, 70, 110, 150];
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 6;
  doc.setFont('helvetica', 'normal');
  r.items.forEach(i => {
    const d = i.found - i.expected;
    const status = d ? 'Divergência' : 'OK';
    doc.text(i.name, colX[0], y);
    doc.text(String(i.found), colX[1], y);
    doc.text(String(i.expected), colX[2], y);
    doc.text(status, colX[3], y);
    y += 6;
  });
  y += 6;
  doc.text(`Resumo: ${r.items.length} itens — ${r.hasDivergence ? 'Com divergências' : 'Sem divergências'}`, 20, y);
  y += 8;
  doc.text(`Observações: ${r.notes || 'Nenhuma'}`, 20, y);

  const fileName = `laudo-${r.laudo || 'checklist'}-${r.date.replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
  toast('PDF gerado: ' + fileName);
}

function printReport() {
  $('#printArea').innerHTML = reportHTML(state.currentReport);
  window.print();
}

/* ---------- 12. Histórico ---------- */
function renderHistory() {
  const fd = $('#fDate').value, fs = $('#fStatus').value;
  const list = state.history.filter(r =>
    (!fd || r.iso === fd) &&
    (fs === 'all' || (fs === 'div' ? r.hasDivergence : !r.hasDivergence))
  ).sort((a, b) => b.ts - a.ts);

  $('#historyList').innerHTML = list.map(r => `
    <article class="h-card ${r.hasDivergence ? 'div' : ''}" data-id="${r.id}">
      <strong>${r.laudo || '—'} · ${r.date} às ${r.time}</strong>
      <div class="meta">${esc(r.instrutor || '—')} · ${esc(r.escola || '—')} · ${esc(r.turno)}<br>
        <span class="${r.hasDivergence ? 'st-div' : 'st-ok'}" style="font-weight:700;color:var(--${r.hasDivergence ? 'bad' : 'ok'})">${r.hasDivergence ? 'Com divergências' : 'Sem divergências'}</span></div>
      <div class="h-actions">
        <button class="btn small" data-h="view">Abrir</button>
        <button class="btn small" data-h="copy">Copiar WhatsApp</button>
        <button class="btn small" data-h="pdf">Gerar PDF</button>
        <button class="btn small" data-h="print">PDF / Imprimir</button>
        <button class="btn small danger" data-h="del">Excluir</button>
      </div>
    </article>`).join('') ||
    `<div class="empty">${state.history.length ? 'Nenhum relatório com esses filtros.' : 'Nenhum relatório finalizado ainda.'}</div>`;
}

function onHistoryClick(ev) {
  const b = ev.target.closest('[data-h]'); if (!b) return;
  const r = state.history.find(x => x.id === b.closest('.h-card').dataset.id); if (!r) return;
  state.currentReport = r;
  if (b.dataset.h === 'view') openReport(r);
  if (b.dataset.h === 'copy') copyReport();
  if (b.dataset.h === 'pdf') generatePDF();
  if (b.dataset.h === 'print') printReport();
  if (b.dataset.h === 'del' && confirm('Excluir este relatório definitivamente?')) {
    state.history = state.history.filter(x => x.id !== r.id);
    saveHist(); saveHistToCloud(); renderHistory(); toast('Relatório excluído');
  }
}

async function saveHistToCloud() {
  if (!state.firebaseReady) return;
  try {
    // Salva cada relatório individualmente
    for (const r of state.history) {
      await saveToCloud('reports', r.id, r);
    }
  } catch (e) { /* offline */ }
}

/* ---------- 13. Backup / Restauração ---------- */
function exportBackup() {
  const data = {
    app: 'checklist-equipamentos',
    version: 2,
    exportedAt: new Date().toISOString(),
    equip: state.equip,
    history: state.history,
    prefs: state.prefs,
    laudoCounter: state.laudoCounter
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-checklist-${nowParts().iso}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exportado');
}

function validateBackup(d) {
  if (!d || typeof d !== 'object' || d.app !== 'checklist-equipamentos') return 'Arquivo não é um backup deste aplicativo.';
  if (!Array.isArray(d.equip) || !Array.isArray(d.history)) return 'Estrutura do backup inválida.';
  if (d.prefs && (typeof d.prefs !== 'object' || Array.isArray(d.prefs))) return 'Preferências do backup inválidas.';
  const okEq = d.equip.every(e => e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(+e.expected));
  if (!okEq) return 'Lista de equipamentos corrompida.';
  const okH = d.history.every(r => r && typeof r.id === 'string' && Array.isArray(r.items) && typeof r.date === 'string' &&
    r.items.every(i => typeof i.name === 'string' && Number.isFinite(+i.found) && Number.isFinite(+i.expected)));
  if (!okH) return 'Histórico de relatórios corrompido.';
  return null;
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { return toast('Arquivo JSON inválido.'); }
    const err = validateBackup(data);
    if (err) return toast(err);
    if (!confirm(`Restaurar ${data.equip.length} equipamentos e ${data.history.length} relatórios? Os dados atuais serão substituídos.`)) return;
    state.equip = data.equip.map(e => ({ ...e, expected: +e.expected }));
    state.history = data.history;
    state.history.forEach(r => { r.ts = r.ts || 0; r.iso = r.iso || ''; });
    if (data.prefs) {
      Object.assign(state.prefs, data.prefs);
      $('#inInstrutor').value = state.prefs.instrutor || '';
      $('#inEscola').value = state.prefs.escola || '';
      $('#inTurno').value = state.prefs.turno || 'Manhã';
      $('#inDeclarante').checked = state.prefs.declare !== false;
    }
    state.laudoCounter = data.laudoCounter || 1;
    state.counts = {}; recalcAuto();
    saveEquip(); saveEquipToCloud(); saveHist(); saveHistToCloud(); savePrefs(); savePrefsToCloud(); saveSession(); saveMeta(); saveMetaToCloud();
    renderItems(); renderHistory(); renderStorageInfo(); renderQuickChecks(); toast('Backup restaurado!');
  };
  reader.readAsText(file);
}

function renderStorageInfo() {
  $('#storageInfo').innerHTML = `<h2>Resumo</h2><p>${state.equip.length} equipamentos · ${state.history.length} relatórios salvos neste navegador.</p>`;
}

/* ---------- 14. Interface: tema, abas, toast, sincronia ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.prefs.theme;
  $('meta[name="theme-color"]').content = state.prefs.theme === 'dark' ? '#101827' : '#1f3a5f';
}
function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'history') renderHistory();
  if (name === 'data') renderStorageInfo();
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function updateSyncBadge() {
  const badge = $('#syncStatus');
  if (!badge) return;
  if (!state.firebaseReady) {
    badge.className = 'sync-badge offline';
    badge.title = 'Firebase não configurado (apenas local)';
  } else if (!navigator.onLine) {
    badge.className = 'sync-badge offline';
    badge.title = 'Offline — dados salvos localmente';
  } else {
    badge.className = 'sync-badge online';
    badge.title = 'Online — sincronizado com Firebase';
  }
}

/* ---------- 15. Inicialização ---------- */
async function init() {
  initFirebase();
  updateSyncBadge();

  // Estado online/offline
  window.addEventListener('online', () => { state.online = true; updateSyncBadge(); });
  window.addEventListener('offline', () => { state.online = false; updateSyncBadge(); });

  const storedEquip = load(KEYS.equip, null);
  state.equip = Array.isArray(storedEquip) ? storedEquip : JSON.parse(JSON.stringify(DEFAULT_EQUIP));
  recalcAuto();
  if (!Array.isArray(storedEquip)) saveEquip();
  state.history = load(KEYS.hist, []);
  // Se houver Firebase, tenta mesclar com histórico da nuvem (mais recente vence)
  if (state.firebaseReady) {
    try {
      const cloudHist = await loadHistoryFromCloud();
      if (cloudHist && cloudHist.length) {
        // Mantém os locais e adiciona os da nuvem que não existam
        const localIds = new Set(state.history.map(r => r.id));
        cloudHist.forEach(r => { if (!localIds.has(r.id)) state.history.unshift(r); });
        state.history.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      }
    } catch (e) { /* ignora falha de nuvem na leitura */ }
  }
  Object.assign(state.prefs, load(KEYS.prefs, {}));
  const sess = load(KEYS.session, { counts: {}, notes: '' });
  state.counts = sess.counts || {}; state.notes = sess.notes || '';
  const meta = load(KEYS.meta, { laudoCounter: 1 });
  state.laudoCounter = meta.laudoCounter || 1;

  $('#inInstrutor').value = state.prefs.instrutor;
  $('#inEscola').value = state.prefs.escola;
  $('#inTurno').value = state.prefs.turno;
  $('#inDeclarante').checked = state.prefs.declare !== false;
  $('#inNotes').value = state.notes;

  $('#inInstrutor').addEventListener('input', e => { state.prefs.instrutor = e.target.value; savePrefs(); savePrefsToCloud(); });
  $('#inEscola').addEventListener('input', e => { state.prefs.escola = e.target.value; savePrefs(); savePrefsToCloud(); });
  $('#inTurno').addEventListener('change', e => { state.prefs.turno = e.target.value; savePrefs(); savePrefsToCloud(); });
  $('#inDeclarante').addEventListener('change', e => { state.prefs.declare = e.target.checked; savePrefs(); savePrefsToCloud(); });
  $('#inNotes').addEventListener('input', e => { state.notes = e.target.value; saveSession(); });
  $('#items').addEventListener('click', onItemsClick);
  $('#items').addEventListener('input', onItemsInput);
  $('#btnReset').addEventListener('click', resetCounts);
  $('#btnFinish').addEventListener('click', finishChecklist);

  $('#btnManage').addEventListener('click', () => { renderManage(); $('#manageModal').showModal(); });
  $('#manageList').addEventListener('input', onManageInput);
  $('#manageList').addEventListener('click', onManageClick);
  $('#addForm').addEventListener('submit', onAddItem);

  $('#btnCopy').addEventListener('click', copyReport);
  $('#btnPdf').addEventListener('click', generatePDF);
  $('#btnPrint').addEventListener('click', printReport);
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('#fDate').addEventListener('change', renderHistory);
  $('#fStatus').addEventListener('change', renderHistory);
  $('#btnClearFilter').addEventListener('click', () => { $('#fDate').value = ''; $('#fStatus').value = 'all'; renderHistory(); });
  $('#historyList').addEventListener('click', onHistoryClick);

  $('#btnExport').addEventListener('click', exportBackup);
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });

  $('#btnSelectAll').addEventListener('click', selectAllQuick);
  $('#btnSelectNone').addEventListener('click', selectNoneQuick);
  $('#btnSyncNow').addEventListener('click', async () => {
    if (!state.firebaseReady) return toast('Firebase não configurado.');
    await saveEquipToCloud();
    await saveHistToCloud();
    await savePrefsToCloud();
    await saveMetaToCloud();
    toast('Sincronizado com a nuvem');
  });

  $('#themeBtn').addEventListener('click', () => {
    state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark'; savePrefs(); savePrefsToCloud(); applyTheme();
  });
  if (!load(KEYS.prefs, {}).theme && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) state.prefs.theme = 'dark';
  applyTheme();

  renderItems(); renderHistory(); renderStorageInfo(); renderQuickChecks();

  if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW não registrado:', err));
  }
}

document.addEventListener('DOMContentLoaded', init);

