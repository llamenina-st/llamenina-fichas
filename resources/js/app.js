/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — App Module (Orquestrador)
   Inicialização, roteamento de views, gestão de feedbacks e controle global
   ═══════════════════════════════════════════════════════════════ */

const App = (() => {
  'use strict';

  let currentView = 'list'; // 'list' | 'form' | 'feedbacks'
  let currentTab = 'fichas'; // 'fichas' | 'feedbacks'
  let fichasCache = [];
  let feedbacksCache = [];
  let activeFeedbackFilter = 'todos'; // 'todos' | 'novo' | 'em_analise' | 'resolvido'

  // ── Versão do aplicativo (atualizar aqui a cada release) ──
  const APP_VERSION = 'v1.4.0';

  /**
   * Inicializa a aplicação
   */
  function init() {
    // Exibir versão no header
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    Config.init();
    FichaForm.init();
    setupEventListeners();
    setupConfigModal();
    setupFeedbackModal();

    // Verificar se há parâmetro ID na URL
    const urlParams = new URLSearchParams(window.location.search);
    const fichaId = urlParams.get('id');

    if (fichaId) {
      if (!Config.isConfigured()) {
        showConfigModal();
        showToast('Configuração necessária', 'Configure o endpoint para carregar a ficha técnica.', 'warning');
      } else {
        switchView('form');
        loadFichaForEdit(fichaId);
      }
    } else {
      // Se não configurado, mostrar modal de config
      if (!Config.isConfigured()) {
        showConfigModal();
      } else {
        switchView('list');
        loadFichas();
        // Carregar feedbacks em background para atualizar o badge de notificações
        loadFeedbacks(false);
      }
    }
  }

  // ═══════════════ EVENT LISTENERS ═══════════════

  function setupEventListeners() {
    // Abas principais do Header (Fichas / Feedbacks)
    const tabFichas = document.getElementById('tab-fichas');
    const tabFeedbacks = document.getElementById('tab-feedbacks');

    if (tabFichas) {
      tabFichas.addEventListener('click', () => {
        switchTab('fichas');
      });
    }

    if (tabFeedbacks) {
      tabFeedbacks.addEventListener('click', () => {
        switchTab('feedbacks');
      });
    }

    // Navegação
    const btnNewFicha = document.getElementById('btn-new-ficha');
    const btnBackToList = document.getElementById('btn-back-list');
    const btnConfig = document.getElementById('btn-config');

    if (btnNewFicha) {
      btnNewFicha.addEventListener('click', () => {
        switchTab('fichas');
        FichaForm.clearForm();
        switchView('form');
        window.history.pushState({}, '', window.location.pathname);
      });
    }

    if (btnBackToList) {
      btnBackToList.addEventListener('click', () => {
        switchTab('fichas');
        switchView('list');
        window.history.pushState({}, '', window.location.pathname);
      });
    }

    if (btnConfig) {
      btnConfig.addEventListener('click', showConfigModal);
    }

    // Ações do formulário de fichas
    const btnSave = document.getElementById('btn-save');
    const btnPrint = document.getElementById('btn-print');
    const btnClear = document.getElementById('btn-clear');

    if (btnSave) {
      btnSave.addEventListener('click', handleSave);
    }

    if (btnPrint) {
      btnPrint.addEventListener('click', handlePrint);
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Limpar todos os campos do formulário?')) {
          FichaForm.clearForm();
          showToast('Formulário limpo', '', 'info');
        }
      });
    }

    // Busca de Fichas
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const debouncedSearch = Security.debounce(handleSearch, 400);
      searchInput.addEventListener('input', debouncedSearch);
    }

    // Refresh de Fichas
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', loadFichas);
    }

    // ── Feedbacks: Busca e Filtros ──
    const feedbackSearchInput = document.getElementById('feedback-search-input');
    if (feedbackSearchInput) {
      const debouncedFeedbackSearch = Security.debounce(handleFeedbackSearch, 300);
      feedbackSearchInput.addEventListener('input', debouncedFeedbackSearch);
    }

    const btnRefreshFeedbacks = document.getElementById('btn-refresh-feedbacks');
    if (btnRefreshFeedbacks) {
      btnRefreshFeedbacks.addEventListener('click', () => loadFeedbacks(true));
    }

    // Filtros por chips de status
    document.querySelectorAll('[data-feedback-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-feedback-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFeedbackFilter = chip.dataset.feedbackFilter;
        renderFeedbacksList(feedbacksCache);
      });
    });
  }

  // ═══════════════ TAB & VIEW MANAGEMENT ═══════════════

  /**
   * Alterna entre as abas principais (Fichas / Feedbacks)
   * @param {'fichas'|'feedbacks'} tab
   */
  function switchTab(tab) {
    currentTab = tab;

    // Atualizar botões de abas no header
    const tabFichas = document.getElementById('tab-fichas');
    const tabFeedbacks = document.getElementById('tab-feedbacks');

    if (tabFichas) tabFichas.classList.toggle('active', tab === 'fichas');
    if (tabFeedbacks) tabFeedbacks.classList.toggle('active', tab === 'feedbacks');

    if (tab === 'fichas') {
      switchView('list');
      loadFichas();
    } else if (tab === 'feedbacks') {
      switchView('feedbacks');
      loadFeedbacks(true);
    }
  }

  /**
   * Alterna entre as views (list, form, feedbacks)
   * @param {string} view - 'list', 'form' ou 'feedbacks'
   */
  function switchView(view) {
    currentView = view;

    document.querySelectorAll('.view-container').forEach(el => {
      el.classList.remove('active');
    });

    const target = document.getElementById(`view-${view}`);
    if (target) {
      target.classList.add('active');
    }

    // Atualizar título do header
    const subtitle = document.querySelector('.app-header__subtitle');
    if (subtitle) {
      if (view === 'form') {
        subtitle.textContent = FichaForm.getCurrentId() ? 'Editando Ficha' : 'Nova Ficha Técnica';
      } else if (view === 'feedbacks') {
        subtitle.textContent = 'Feedbacks de Produção & Qualidade';
      } else {
        subtitle.textContent = 'Lista de Fichas Técnicas';
      }
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ═══════════════ FICHAS LIST ═══════════════

  /**
   * Carrega a lista de fichas do backend
   */
  async function loadFichas() {
    if (!Config.isConfigured()) {
      renderFichasList([]);
      return;
    }

    const listContainer = document.getElementById('fichas-list-container');
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="skeleton skeleton--card"></div>
        <div class="skeleton skeleton--card"></div>
        <div class="skeleton skeleton--card"></div>
      `;
    }

    try {
      const result = await API.listFichas();
      fichasCache = result.fichas || [];
      renderFichasList(fichasCache);
    } catch (error) {
      console.error('[App] Erro ao carregar fichas:', error);
      renderFichasList([]);

      if (error.code !== 'CONFIG_MISSING') {
        showToast('Erro ao carregar', error.message, 'error');
      }
    }
  }

  /**
   * Renderiza a lista de fichas no DOM
   * @param {Array} fichas
   */
  function renderFichasList(fichas) {
    const container = document.getElementById('fichas-list-container');
    if (!container) return;

    // Atualizar contador
    const counter = document.getElementById('fichas-count');
    if (counter) counter.textContent = fichas.length;

    if (fichas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6M12 9v6M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
            </svg>
          </div>
          <div class="empty-state__title">Nenhuma ficha cadastrada</div>
          <div class="empty-state__desc">Clique em "Nova Ficha" para criar a primeira ficha técnica.</div>
          <button class="btn btn--primary" onclick="App.newFicha()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Ficha
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = '<div class="fichas-list">' +
      fichas.map((ficha, index) => {
        const s = Security.sanitizeHTML;
        const statusClass = ficha.statusAprovacao === 'aprovada' ? 'success'
          : ficha.statusAprovacao === 'reprovada' ? 'error' : 'warning';
        const statusLabel = ficha.statusAprovacao === 'aprovada' ? 'Aprovada'
          : ficha.statusAprovacao === 'reprovada' ? 'Reprovada' : 'Pendente';

        return `
          <div class="ficha-card" data-ficha-id="${s(ficha.id)}" style="animation-delay: ${index * 0.05}s">
            <div class="ficha-card__header">
              <div>
                <div class="ficha-card__modelo">${s(ficha.modelo || 'Sem título')}</div>
                <div class="ficha-card__ref">${s(ficha.referencia || '—')}</div>
              </div>
              <span class="badge badge--${statusClass}">${statusLabel}</span>
            </div>
            <div class="ficha-card__meta">
              <span class="ficha-card__meta-item">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${s(ficha.modelista || '—')}
              </span>
              <span class="ficha-card__meta-item">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                OP: ${s(ficha.op || '—')}
              </span>
              ${ficha.tecido ? `
              <span class="ficha-card__meta-item">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                ${s(ficha.tecido)}
              </span>` : ''}
            </div>
          </div>
        `;
      }).join('') + '</div>';

    // Click handlers para cards
    container.querySelectorAll('.ficha-card').forEach(card => {
      card.addEventListener('click', () => {
        const fichaId = card.dataset.fichaId;
        loadFichaForEdit(fichaId);
      });
    });
  }

  /**
   * Carrega uma ficha para edição
   * @param {string} fichaId
   */
  async function loadFichaForEdit(fichaId) {
    try {
      let ficha = fichasCache.find(f => f.id === fichaId);

      if (!ficha) {
        const result = await API.getFicha(fichaId);
        ficha = result.ficha;
      }

      if (ficha) {
        FichaForm.fillForm(ficha);
        switchTab('fichas');
        switchView('form');
        showToast('Ficha carregada', `${ficha.modelo} — ${ficha.referencia}`, 'success');
      }
    } catch (error) {
      showToast('Erro ao carregar ficha', error.message, 'error');
    }
  }

  // ═══════════════ FEEDBACKS MANAGEMENT ═══════════════

  /**
   * Carrega todos os feedbacks do backend
   * @param {boolean} showToastOnSuccess
   */
  async function loadFeedbacks(showToastOnSuccess = false) {
    if (!Config.isConfigured()) {
      renderFeedbacksList([]);
      return;
    }

    const container = document.getElementById('feedbacks-list-container');
    if (container && currentView === 'feedbacks') {
      container.innerHTML = `
        <div class="skeleton skeleton--card"></div>
        <div class="skeleton skeleton--card"></div>
      `;
    }

    try {
      const result = await API.listFeedbacks();
      feedbacksCache = result.feedbacks || [];
      updateFeedbacksBadge();
      renderFeedbacksList(feedbacksCache);
      if (showToastOnSuccess) {
        showToast('Feedbacks atualizados', `${feedbacksCache.length} ocorrência(s) registrada(s)`, 'success');
      }
    } catch (error) {
      console.warn('[App] Falha ao carregar feedbacks:', error.message);
      if (currentView === 'feedbacks') {
        renderFeedbacksList([]);
      }
    }
  }

  /**
   * Atualiza o badge numérico com a quantidade de feedbacks novos/pendentes
   */
  function updateFeedbacksBadge() {
    const badge = document.getElementById('feedbacks-badge');
    if (!badge) return;

    const newCount = feedbacksCache.filter(fb => fb.status === 'novo' || fb.status === 'pendente' || !fb.status).length;

    if (newCount > 0) {
      badge.textContent = newCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  /**
   * Renderiza a lista de feedbacks no DOM
   * @param {Array} feedbacks
   */
  function renderFeedbacksList(feedbacks) {
    const container = document.getElementById('feedbacks-list-container');
    if (!container) return;

    // 1. Filtrar por status
    let filtered = feedbacks;
    if (activeFeedbackFilter === 'novo') {
      filtered = filtered.filter(f => f.status === 'novo' || f.status === 'pendente' || !f.status);
    } else if (activeFeedbackFilter === 'em_analise') {
      filtered = filtered.filter(f => f.status === 'em_analise');
    } else if (activeFeedbackFilter === 'resolvido') {
      filtered = filtered.filter(f => f.status === 'resolvido');
    }

    // 2. Filtrar por busca se houver
    const searchInput = document.getElementById('feedback-search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query) {
      filtered = filtered.filter(f => {
        const text = [f.modelo, f.referencia, f.op, f.parceiro, f.setor, f.tipo, f.descricao].join(' ').toLowerCase();
        return text.includes(query);
      });
    }

    // Atualizar contador
    const countEl = document.getElementById('feedbacks-count');
    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="empty-state__title">Nenhum feedback encontrado</div>
          <div class="empty-state__desc">Nenhuma ocorrência corresponde aos filtros selecionados.</div>
        </div>
      `;
      return;
    }

    const s = Security.sanitizeHTML;

    container.innerHTML = '<div class="feedbacks-list">' +
      filtered.map((fb, idx) => {
        const urgencyClass = (fb.gravidade || '').toLowerCase().includes('urgente') ? 'urgente'
          : (fb.gravidade || '').toLowerCase().includes('aten') ? 'atencao' : 'info';
        
        const statusClass = fb.status === 'resolvido' ? 'resolvido'
          : fb.status === 'em_analise' ? 'em_analise' : 'novo';
        
        const statusLabel = fb.status === 'resolvido' ? '✓ Resolvido'
          : fb.status === 'em_analise' ? '⏳ Em Análise' : '● Novo';

        const dataFormatada = fb.timestamp ? new Date(fb.timestamp).toLocaleString('pt-BR') : '—';
        const hasPhotos = Array.isArray(fb.fotos) && fb.fotos.length > 0;

        return `
          <div class="feedback-card" data-feedback-id="${s(fb.id)}" style="animation-delay: ${idx * 0.04}s">
            <div class="feedback-card__top">
              <div class="feedback-card__piece">
                <span class="feedback-card__modelo">${s(fb.modelo || 'Peça sem modelo')}</span>
                <span class="feedback-card__ref">REF: ${s(fb.referencia || '—')}</span>
                ${fb.op ? `<span class="feedback-card__op">(OP: ${s(fb.op)})</span>` : ''}
              </div>
              <div class="feedback-card__badges">
                <span class="badge badge--${urgencyClass}">${s(fb.gravidade || 'Informativo')}</span>
                <span class="badge badge--${statusClass}">${statusLabel}</span>
              </div>
            </div>

            <div class="feedback-card__partner-row">
              <span>👤 <strong>${s(fb.parceiro || 'Parceiro')}</strong></span>
              <span>📍 Setor: <strong>${s(fb.setor || 'Geral')}</strong></span>
              <span>🏷️ Tipo: <strong>${s(fb.tipo || 'Observação')}</strong></span>
            </div>

            <div class="feedback-card__desc">
              "${s(fb.descricao || '')}"
            </div>

            <div class="feedback-card__footer">
              <span>🕒 ${dataFormatada}</span>
              ${hasPhotos ? `<span style="color: var(--color-brand-accent); font-weight: 600;">📷 ${fb.fotos.length} foto(s) anexada(s)</span>` : ''}
            </div>
          </div>
        `;
      }).join('') + '</div>';

    // Click handler para abrir o modal de detalhes
    container.querySelectorAll('.feedback-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.feedbackId;
        openFeedbackDetailModal(id);
      });
    });
  }

  function handleFeedbackSearch() {
    renderFeedbacksList(feedbacksCache);
  }

  /**
   * Configura o modal de detalhes do feedback
   */
  function setupFeedbackModal() {
    const modalOverlay = document.getElementById('feedback-modal-overlay');
    const closeBtn = document.getElementById('feedback-modal-close');

    if (closeBtn) {
      closeBtn.addEventListener('click', hideFeedbackModal);
    }

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideFeedbackModal();
      });
    }
  }

  function showFeedbackModal() {
    const modalOverlay = document.getElementById('feedback-modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('active');
  }

  function hideFeedbackModal() {
    const modalOverlay = document.getElementById('feedback-modal-overlay');
    if (modalOverlay) modalOverlay.classList.remove('active');
  }

  /**
   * Abre o modal com os detalhes completos do feedback
   * @param {string} feedbackId
   */
  function openFeedbackDetailModal(feedbackId) {
    const fb = feedbacksCache.find(f => f.id === feedbackId);
    if (!fb) return;

    const s = Security.sanitizeHTML;
    const bodyEl = document.getElementById('feedback-modal-body');
    const urgencyBadge = document.getElementById('fb-modal-urgency-badge');
    const statusBadge = document.getElementById('fb-modal-status-badge');

    if (!bodyEl) return;

    // Configurar badges do cabeçalho do modal
    const urgencyClass = (fb.gravidade || '').toLowerCase().includes('urgente') ? 'urgente'
      : (fb.gravidade || '').toLowerCase().includes('aten') ? 'atencao' : 'info';
    if (urgencyBadge) {
      urgencyBadge.className = `badge badge--${urgencyClass}`;
      urgencyBadge.textContent = fb.gravidade || 'Informativo';
    }

    const statusClass = fb.status === 'resolvido' ? 'resolvido'
      : fb.status === 'em_analise' ? 'em_analise' : 'novo';
    const statusLabel = fb.status === 'resolvido' ? '✓ Resolvido'
      : fb.status === 'em_analise' ? '⏳ Em Análise' : '● Novo';
    if (statusBadge) {
      statusBadge.className = `badge badge--${statusClass}`;
      statusBadge.textContent = statusLabel;
    }

    const dataFormatada = fb.timestamp ? new Date(fb.timestamp).toLocaleString('pt-BR') : '—';
    const fotos = Array.isArray(fb.fotos) ? fb.fotos : [];

    bodyEl.innerHTML = `
      <!-- Peça Vinculada -->
      <div class="feedback-detail__header-card">
        <div>
          <div style="font-size: 11px; text-transform: uppercase; color: var(--color-brand-accent); font-weight: 700;">Peça Relacionada:</div>
          <div style="font-size: var(--font-size-lg); font-weight: 800; color: #fff;">${s(fb.modelo || 'Peça sem título')}</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-top: 2px;">
            REF: <strong>${s(fb.referencia || '—')}</strong> &nbsp;|&nbsp; OP: <strong>${s(fb.op || '—')}</strong>
          </div>
        </div>
        ${fb.fichaId ? `
        <button class="btn btn--secondary btn--sm" id="btn-open-linked-ficha">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Abrir Ficha Técnica
        </button>
        ` : ''}
      </div>

      <!-- Grid de Metadados -->
      <div class="feedback-detail__meta-grid">
        <div class="feedback-detail__meta-item">
          <span class="feedback-detail__meta-label">Parceiro / Oficina:</span>
          <span class="feedback-detail__meta-value">${s(fb.parceiro || '—')}</span>
        </div>
        <div class="feedback-detail__meta-item">
          <span class="feedback-detail__meta-label">Setor / Etapa:</span>
          <span class="feedback-detail__meta-value">${s(fb.setor || '—')}</span>
        </div>
        <div class="feedback-detail__meta-item">
          <span class="feedback-detail__meta-label">Tipo de Ocorrência:</span>
          <span class="feedback-detail__meta-value">${s(fb.tipo || '—')}</span>
        </div>
        <div class="feedback-detail__meta-item">
          <span class="feedback-detail__meta-label">Data de Recebimento:</span>
          <span class="feedback-detail__meta-value">${dataFormatada}</span>
        </div>
      </div>

      <!-- Descrição do Defeito -->
      <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-primary); margin-bottom: 6px;">
        Descrição da Observação / Defeito:
      </div>
      <div class="feedback-detail__desc-box">${s(fb.descricao || 'Sem descrição')}</div>

      <!-- Fotos do Defeito (se houver) -->
      ${fotos.length > 0 ? `
      <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-primary); margin-bottom: 8px;">
        Fotos Anexadas pelo Parceiro (${fotos.length}):
      </div>
      <div class="feedback-detail__photos-grid">
        ${fotos.map(fotoUrl => `
          <div class="feedback-detail__photo-item" onclick="window.open('${s(fotoUrl)}', '_blank')">
            <img src="${s(fotoUrl)}" alt="Foto do defeito">
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Painel de Gestão e Resolução Interna -->
      <div style="background: rgba(15, 6, 9, 0.6); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); margin-top: var(--space-4);">
        <div style="font-size: var(--font-size-sm); font-weight: 700; color: var(--color-brand-accent); margin-bottom: var(--space-3);">
          ⚙️ Gestão Interna da Ocorrência
        </div>

        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="fb-detail-status">Status da Ocorrência</label>
          <select id="fb-detail-status" class="form-input">
            <option value="novo" ${fb.status === 'novo' ? 'selected' : ''}>● Novo / Pendente de Análise</option>
            <option value="em_analise" ${fb.status === 'em_analise' ? 'selected' : ''}>⏳ Em Análise / Em Ajuste</option>
            <option value="resolvido" ${fb.status === 'resolvido' ? 'selected' : ''}>✓ Resolvido / Ajustado</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="fb-detail-obs-interna">Observações Internas / Ação Tomada</label>
          <textarea id="fb-detail-obs-interna" class="form-textarea" rows="2" placeholder="Ex: Molde corrigido pela modelista no dia 03/09. Orientado corte a conferir encaixe.">${s(fb.obsInterna || '')}</textarea>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4);">
          <button class="btn btn--ghost" style="color: var(--color-error);" id="btn-delete-feedback">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Excluir Registro
          </button>
          <button class="btn btn--primary" id="btn-save-feedback-status">
            Salvar Alterações
          </button>
        </div>
      </div>
    `;

    // Evento para abrir a ficha técnica correspondente
    const openFichaBtn = document.getElementById('btn-open-linked-ficha');
    if (openFichaBtn && fb.fichaId) {
      openFichaBtn.addEventListener('click', () => {
        hideFeedbackModal();
        loadFichaForEdit(fb.fichaId);
      });
    }

    // Evento para salvar o status do feedback
    const saveStatusBtn = document.getElementById('btn-save-feedback-status');
    if (saveStatusBtn) {
      saveStatusBtn.addEventListener('click', async () => {
        const newStatus = document.getElementById('fb-detail-status').value;
        const obsInterna = document.getElementById('fb-detail-obs-interna').value;

        saveStatusBtn.disabled = true;
        saveStatusBtn.classList.add('loading');

        try {
          await API.updateFeedbackStatus(fb.id, newStatus, obsInterna);
          showToast('Status atualizado', 'A alteração foi gravada na planilha com sucesso.', 'success');
          hideFeedbackModal();
          loadFeedbacks(false);
        } catch (err) {
          showToast('Erro ao atualizar', err.message, 'error');
        } finally {
          saveStatusBtn.disabled = false;
          saveStatusBtn.classList.remove('loading');
        }
      });
    }

    // Evento para excluir o feedback
    const deleteFeedbackBtn = document.getElementById('btn-delete-feedback');
    if (deleteFeedbackBtn) {
      deleteFeedbackBtn.addEventListener('click', async () => {
        if (!confirm('Deseja realmente excluir este registro de feedback permanentemente?')) return;

        deleteFeedbackBtn.disabled = true;
        try {
          await API.deleteFeedback(fb.id);
          showToast('Feedback excluído', 'O registro foi removido com sucesso.', 'info');
          hideFeedbackModal();
          loadFeedbacks(false);
        } catch (err) {
          showToast('Erro ao excluir', err.message, 'error');
          deleteFeedbackBtn.disabled = false;
        }
      });
    }

    showFeedbackModal();
  }

  // ═══════════════ HANDLERS FICHAS ═══════════════

  /**
   * Handler do botão Salvar
   */
  async function handleSave() {
    const saveBtn = document.getElementById('btn-save');

    if (saveBtn && saveBtn.disabled) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('loading');
    }

    // Validar
    const validation = FichaForm.validate();
    if (!validation.valid) {
      showToast('Campos obrigatórios', validation.errors[0], 'warning');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('loading');
      }
      return;
    }

    const data = FichaForm.collectData();
    const isUpdate = !!FichaForm.getCurrentId();

    if (!isUpdate && data.id) {
      FichaForm.setCurrentId(data.id);
    }

    try {
      const result = await API.saveFicha(data, isUpdate);
      showToast(
        'Ficha salva!',
        `${data.modelo} — ${data.referencia}`,
        'success'
      );
      Config.clearDraft();

      if (result.id) {
        try {
          const getResult = await API.getFicha(result.id);
          if (getResult && getResult.ficha) {
            FichaForm.fillForm(getResult.ficha);
          }
        } catch (err) {
          console.warn('[App] Erro ao carregar ficha recém-salva:', err);
        }
      }

      loadFichas();

    } catch (error) {
      showToast('Erro ao salvar', error.message, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('loading');
      }
    }
  }

  /**
   * Handler do botão Imprimir
   */
  function handlePrint() {
    try {
      const fichaId = FichaForm.getCurrentId();
      if (!fichaId) {
        if (confirm('A ficha técnica não foi salva no banco de dados. Os QR Codes de consulta não estarão ativos na impressão. Deseja imprimir mesmo assim?')) {
          PrintModule.print();
        }
      } else {
        PrintModule.print();
      }
    } catch (err) {
      alert('Erro ao processar impressão: ' + err.message);
      console.error('[App] Erro em handlePrint:', err);
    }
  }

  /**
   * Handler da busca de fichas
   */
  async function handleSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;

    const query = input.value.trim();

    if (query.length === 0) {
      renderFichasList(fichasCache);
      return;
    }

    const localResults = fichasCache.filter(ficha => {
      const searchStr = [
        ficha.modelo, ficha.referencia, ficha.op,
        ficha.modelista, ficha.pilotista, ficha.tecido,
        ficha.grade, ficha.quantCorte, ficha.enfesto, ficha.coresTecido
      ].join(' ').toLowerCase();
      return searchStr.includes(query.toLowerCase());
    });

    renderFichasList(localResults);

    if (localResults.length === 0 && Config.isConfigured()) {
      try {
        const result = await API.searchFichas(query);
        if (result.fichas && result.fichas.length > 0) {
          renderFichasList(result.fichas);
        }
      } catch (error) {
        console.warn('[App] Erro na busca remota:', error.message);
      }
    }
  }

  // ═══════════════ CONFIG MODAL ═══════════════

  function setupConfigModal() {
    const closeBtn = document.getElementById('config-modal-close');
    const overlay = document.getElementById('config-modal-overlay');
    const saveConfigBtn = document.getElementById('btn-save-config');
    const testBtn = document.getElementById('btn-test-connection');

    if (closeBtn) {
      closeBtn.addEventListener('click', hideConfigModal);
    }

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideConfigModal();
      });
    }

    if (saveConfigBtn) {
      saveConfigBtn.addEventListener('click', handleSaveConfig);
    }

    if (testBtn) {
      testBtn.addEventListener('click', handleTestConnection);
    }

    const endpointInput = document.getElementById('config-endpoint');
    const tokenInput = document.getElementById('config-token');
    const publicUrlInput = document.getElementById('config-public-url');

    if (endpointInput && Config.getEndpoint()) {
      endpointInput.value = Config.getEndpoint();
    }
    if (tokenInput && Config.getToken()) {
      tokenInput.value = Config.getToken();
    }
    if (publicUrlInput && Config.getPublicUrl()) {
      publicUrlInput.value = Config.getPublicUrl();
    }
  }

  function showConfigModal() {
    const overlay = document.getElementById('config-modal-overlay');
    if (overlay) overlay.classList.add('active');
  }

  function hideConfigModal() {
    const overlay = document.getElementById('config-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  async function handleSaveConfig() {
    const endpointInput = document.getElementById('config-endpoint');
    const tokenInput = document.getElementById('config-token');
    const publicUrlInput = document.getElementById('config-public-url');

    try {
      Config.setEndpoint(endpointInput.value);
      Config.setToken(tokenInput.value);
      if (publicUrlInput) {
        Config.setPublicUrl(publicUrlInput.value);
      }
      showToast('Configuração salva', 'Configurações salvas com sucesso.', 'success');
      hideConfigModal();
      loadFichas();
      loadFeedbacks(false);
    } catch (error) {
      showToast('Erro na configuração', error.message, 'error');
    }
  }

  async function handleTestConnection() {
    const testBtn = document.getElementById('btn-test-connection');
    if (testBtn) testBtn.classList.add('loading');

    const endpointInput = document.getElementById('config-endpoint');
    const tokenInput = document.getElementById('config-token');
    const publicUrlInput = document.getElementById('config-public-url');

    try {
      Config.setEndpoint(endpointInput.value);
      Config.setToken(tokenInput.value);
      if (publicUrlInput) {
        Config.setPublicUrl(publicUrlInput.value);
      }

      const ok = await API.testConnection();
      if (ok) {
        showToast('Conexão OK', 'Endpoint respondeu corretamente!', 'success');
      } else {
        showToast('Falha na conexão', 'O endpoint não respondeu corretamente.', 'error');
      }
    } catch (error) {
      showToast('Erro', error.message, 'error');
    } finally {
      if (testBtn) testBtn.classList.remove('loading');
    }
  }

  // ═══════════════ TOAST NOTIFICATIONS ═══════════════

  /**
   * Exibe uma notificação toast
   * @param {string} title
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration
   */
  function showToast(title, message = '', type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconMap = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <div class="toast__icon">${iconMap[type]}</div>
      <div class="toast__content">
        <div class="toast__title">${Security.sanitizeHTML(title)}</div>
        ${message ? `<div class="toast__message">${Security.sanitizeHTML(message)}</div>` : ''}
      </div>
      <button class="toast__close" title="Fechar">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    toast.querySelector('.toast__close').addEventListener('click', () => removeToast(toast));
    container.appendChild(toast);
    setTimeout(() => removeToast(toast), duration);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }

  // ═══════════════ PUBLIC API ═══════════════

  function newFicha() {
    switchTab('fichas');
    FichaForm.clearForm();
    switchView('form');
  }

  return {
    VERSION: APP_VERSION,
    init,
    switchTab,
    switchView,
    newFicha,
    showToast,
    loadFichas,
    loadFeedbacks
  };
})();

// ── Inicializar quando o DOM estiver pronto ──
document.addEventListener('DOMContentLoaded', App.init);
