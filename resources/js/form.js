/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — Form Module
   Gerenciamento do formulário de fichas técnicas
   ═══════════════════════════════════════════════════════════════ */

const FichaForm = (() => {
  'use strict';

  let currentFichaId = null;
  let autoSaveTimer = null;
  let currentFotos = [];

  // Etapas padrão do fluxo de produção (6 etapas padrão de confecção)
  const DEFAULT_FLOW_STEPS = [
    { etapa: 'Corte', valor: '' },
    { etapa: 'Bordado / Silk', valor: '' },
    { etapa: 'Confecção', valor: '' },
    { etapa: 'Lavanderia', valor: '' },
    { etapa: 'Acabamento', valor: '' },
    { etapa: 'Fase Final', valor: '' }
  ];

  let currentFlowSteps = JSON.parse(JSON.stringify(DEFAULT_FLOW_STEPS));

  // ── IDs dos campos do formulário (Identificação, Observações, Aprovação) ──
  const FIELDS = {
    // Cabeçalho / Identificação
    modelo: 'field-modelo',
    pilotista: 'field-pilotista',
    referencia: 'field-referencia',
    modelista: 'field-modelista',
    op: 'field-op',
    corLinha: 'field-cor-linha',
    tecido: 'field-tecido',
    composicao: 'field-composicao',
    coresTecido: 'field-tecido-cores',
    grade: 'field-grade',
    quantCorte: 'field-quant-corte',
    enfesto: 'field-enfesto',
    // Observações
    obsCostura: 'field-obs-costura',
    // Aprovação
    responsavelAprovacao: 'field-responsavel',
    dataAprovacao: 'field-data-aprovacao'
  };

  /**
   * Retorna a URL pública de fotos para o QR Code de uma ficha técnica.
   * NUNCA retorna 127.0.0.1, localhost ou file://
   * @param {string} fichaId
   * @returns {string}
   */
  function getFichaPublicQRUrl(fichaId) {
    if (!fichaId) return '';
    let baseUrl = Config.getPublicUrl() || 'https://llamenina-st.github.io/llamenina-fichas/resources/fotos.html';
    if (baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost') || baseUrl.startsWith('file:')) {
      baseUrl = 'https://llamenina-st.github.io/llamenina-fichas/resources/fotos.html';
    }
    baseUrl = baseUrl.replace(/index\.html$/, 'fotos.html');
    if (!baseUrl.endsWith('fotos.html')) {
      baseUrl = baseUrl.replace(/\/$/, '') + '/fotos.html';
    }
    return baseUrl + '?id=' + encodeURIComponent(fichaId);
  }

  /**
   * Retorna a URL pública de feedback para o QR Code de uma ficha técnica.
   * @param {string} fichaId
   * @returns {string}
   */
  function getFichaPublicFeedbackQRUrl(fichaId) {
    if (!fichaId) return '';
    let baseUrl = Config.getPublicFeedbackUrl() || 'https://llamenina-st.github.io/llamenina-fichas/resources/feedback.html';
    if (baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost') || baseUrl.startsWith('file:')) {
      baseUrl = 'https://llamenina-st.github.io/llamenina-fichas/resources/feedback.html';
    }
    return baseUrl + '?id=' + encodeURIComponent(fichaId);
  }

  /**
   * Inicializa o módulo de formulário
   */
  function init() {
    setupMeasureTableEvents();
    setupColorComboEvents();
    setupFlowStepEvents();
    setupAutoSave();
    setupFieldValidation();
    setupQRPreview();
    setupPhotoUploadEvents();
    renderFlowSteps();
    loadDraft();
  }

  /**
   * Coleta todos os dados do formulário em um objeto JSON
   * @returns {Object}
   */
  function collectData() {
    const data = {};

    // ID existente (para update) ou gerar um novo se for criação
    if (currentFichaId) {
      data.id = currentFichaId;
    } else {
      data.id = Security.generateId();
    }

    // Campos simples
    for (const [key, elementId] of Object.entries(FIELDS)) {
      const el = document.getElementById(elementId);
      if (el) {
        data[key] = el.value.trim();
      }
    }

    // 5. Fluxo de Produção maleável
    syncFlowInputs();
    data.fluxoProducao = JSON.parse(JSON.stringify(currentFlowSteps));

    // Preencher campos legados do fluxo para retrocompatibilidade com Google Sheets
    currentFlowSteps.forEach(step => {
      const e = (step.etapa || '').toLowerCase();
      if (e.includes('corte')) data.corte = step.valor || '';
      else if (e.includes('bordado') || e.includes('silk')) data.bordadoSilk = step.valor || '';
      else if (e.includes('confec')) data.confeccao = step.valor || '';
      else if (e.includes('lavanderia')) data.lavanderia = step.valor || '';
      else if (e.includes('acabamento')) data.acabamento = step.valor || '';
      else if (e.includes('fase final') || e.includes('final')) data.faseFinal = step.valor || '';
    });

    // Gerar URLs públicas dos QR Codes (Fotos e Feedback)
    if (data.id) {
      data.qrCorteUrl = getFichaPublicQRUrl(data.id);
      data.qrFeedbackUrl = getFichaPublicFeedbackQRUrl(data.id);
    }

    // Status de aprovação
    const statusRadio = document.querySelector('input[name="status-aprovacao"]:checked');
    data.statusAprovacao = statusRadio ? statusRadio.value : 'pendente';

    // Tabela de medidas P/M/G
    data.medidasPMG = collectMeasureTable('measure-table-pmg');

    // Tabela de medidas numeração
    data.medidasNumeracao = collectMeasureTable('measure-table-num');

    // Título das tabelas
    const titlePMG = document.getElementById('measure-title-pmg');
    const titleNum = document.getElementById('measure-title-num');
    data.medidasPMGTitulo = titlePMG ? titlePMG.value.trim() : '';
    data.medidasNumeracaoTitulo = titleNum ? titleNum.value.trim() : '';

    // Combinações de cores
    data.combinacoesCores = collectColorCombos();

    // Fotos (Salva como string JSON do array de fotos)
    data.foto = JSON.stringify(currentFotos);

    return data;
  }

  /**
   * Coleta dados de uma tabela de medidas
   * @param {string} tableId - ID da tabela
   * @returns {Array}
   */
  function collectMeasureTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return [];

    const rows = table.querySelectorAll('tbody tr');
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => th.textContent.trim())
      .filter(h => h && h !== 'Descrição' && h !== '');

    const data = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;

      const descInput = cells[0]?.querySelector('input');
      const desc = descInput ? descInput.value.trim() : '';

      if (!desc) return; // Pular linhas sem descrição

      const values = {};
      for (let i = 1; i < cells.length; i++) {
        const input = cells[i]?.querySelector('input');
        if (input && headers[i - 1]) {
          values[headers[i - 1]] = input.value.trim();
        }
      }

      data.push({ descricao: desc, valores: values });
    });

    return data;
  }

  /**
   * Coleta combinações de cores do bordado
   * @returns {Array}
   */
  function collectColorCombos() {
    const container = document.getElementById('color-combos-container');
    if (!container) return [];

    const rows = container.querySelectorAll('.color-combo-row');
    const combos = [];

    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length >= 2) {
        const peca = inputs[0].value.trim();
        const bordado = inputs[1].value.trim();
        if (peca || bordado) {
          combos.push({ peca, bordado });
        }
      }
    });

    return combos;
  }

  /**
   * Preenche o formulário com dados de uma ficha existente
   * @param {Object} data - Dados da ficha
   */
  function fillForm(data) {
    if (!data) return;

    currentFichaId = data.id || null;

    // Campos simples
    for (const [key, elementId] of Object.entries(FIELDS)) {
      const el = document.getElementById(elementId);
      if (el && data[key] !== undefined) {
        el.value = Security.sanitizeHTML(String(data[key]));
      }
    }

    // 5. Fluxo de Produção maleável
    if (Array.isArray(data.fluxoProducao) && data.fluxoProducao.length > 0) {
      currentFlowSteps = JSON.parse(JSON.stringify(data.fluxoProducao));
    } else {
      // Fallback para campos individuais antigos
      currentFlowSteps = [
        { etapa: 'Corte', valor: data.corte || '' },
        { etapa: 'Bordado / Silk', valor: data.bordadoSilk || '' },
        { etapa: 'Confecção', valor: data.confeccao || '' },
        { etapa: 'Lavanderia', valor: data.lavanderia || '' },
        { etapa: 'Acabamento', valor: data.acabamento || '' },
        { etapa: 'Fase Final', valor: data.faseFinal || '' }
      ];
    }
    renderFlowSteps();

    // Status de aprovação
    if (data.statusAprovacao) {
      const radio = document.querySelector(`input[name="status-aprovacao"][value="${Security.sanitizeHTML(data.statusAprovacao)}"]`);
      if (radio) radio.checked = true;
    }

    // Tabela P/M/G
    if (data.medidasPMGTitulo) {
      const titleEl = document.getElementById('measure-title-pmg');
      if (titleEl) titleEl.value = Security.sanitizeHTML(data.medidasPMGTitulo);
    }
    if (data.medidasPMG && Array.isArray(data.medidasPMG)) {
      fillMeasureTable('measure-table-pmg', data.medidasPMG);
    }

    // Tabela Numeração
    if (data.medidasNumeracaoTitulo) {
      const titleEl = document.getElementById('measure-title-num');
      if (titleEl) titleEl.value = Security.sanitizeHTML(data.medidasNumeracaoTitulo);
    }
    if (data.medidasNumeracao && Array.isArray(data.medidasNumeracao)) {
      fillMeasureTable('measure-table-num', data.medidasNumeracao);
    }

    // Combinações de cores
    if (data.combinacoesCores && Array.isArray(data.combinacoesCores)) {
      fillColorCombos(data.combinacoesCores);
    }

    // Carregar fotos
    if (data.foto) {
      try {
        const parsed = JSON.parse(data.foto);
        if (Array.isArray(parsed)) {
          setPhotos(parsed);
        } else {
          setPhotos([data.foto]);
        }
      } catch (e) {
        setPhotos([data.foto]); // Fallback se for base64 único antigo (não-JSON)
      }
    } else {
      clearPhotos();
    }

    // Atualizar previews de QR
    updateAllQRPreviews();
  }

  /**
   * Preenche uma tabela de medidas com dados
   * @param {string} tableId
   * @param {Array} data
   */
  function fillMeasureTable(tableId, data) {
    const table = document.getElementById(tableId);
    if (!table || !data.length) return;

    const tbody = table.querySelector('tbody');
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => th.textContent.trim())
      .filter(h => h && h !== 'Descrição' && h !== '');

    // Limpar e recriar linhas
    tbody.innerHTML = '';
    data.forEach(item => {
      const row = createMeasureRow(headers, item.descricao, item.valores);
      tbody.appendChild(row);
    });

    // Adicionar linha vazia extra
    tbody.appendChild(createMeasureRow(headers));
  }

  /**
   * Cria uma linha de tabela de medidas
   * @param {string[]} headers
   * @param {string} [desc='']
   * @param {Object} [values={}]
   * @returns {HTMLTableRowElement}
   */
  function createMeasureRow(headers, desc = '', values = {}) {
    const row = document.createElement('tr');

    // Célula de descrição
    const descCell = document.createElement('td');
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'form-input';
    descInput.placeholder = 'Ex.: Comprimento';
    descInput.value = Security.sanitizeHTML(desc);
    descCell.appendChild(descInput);
    row.appendChild(descCell);

    // Células de valores
    headers.forEach(header => {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input';
      input.placeholder = '—';
      input.value = values[header] ? Security.sanitizeHTML(String(values[header])) : '';
      cell.appendChild(input);
      row.appendChild(cell);
    });

    return row;
  }

  /**
   * Preenche as combinações de cores
   * @param {Array} combos
   */
  function fillColorCombos(combos) {
    const container = document.getElementById('color-combos-container');
    if (!container) return;

    container.innerHTML = '';
    combos.forEach(combo => {
      addColorCombo(combo.peca, combo.bordado);
    });
    // Adicionar uma linha vazia extra
    addColorCombo();
  }

  /**
   * Adiciona uma nova linha de combinação de cores
   * @param {string} [peca='']
   * @param {string} [bordado='']
   */
  function addColorCombo(peca = '', bordado = '') {
    const container = document.getElementById('color-combos-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'color-combo-row';
    row.innerHTML = `
      <input type="text" class="form-input" placeholder="Cor da Peça" value="${Security.sanitizeHTML(peca)}">
      <span class="color-combo-row__separator">→</span>
      <input type="text" class="form-input" placeholder="Cor do Bordado" value="${Security.sanitizeHTML(bordado)}">
      <button type="button" class="btn btn--ghost btn--icon color-combo-remove" data-tooltip="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    // Event listener para remover
    row.querySelector('.color-combo-remove').addEventListener('click', () => {
      row.classList.add('removing');
      setTimeout(() => row.remove(), 250);
    });

    container.appendChild(row);
  }

  // ═══════════════ 5. GERENCIAMENTO DO FLUXO DE PRODUÇÃO ═══════════════

  /**
   * Renderiza a lista interativa e reordenável do Fluxo de Produção
   */
  function renderFlowSteps() {
    const container = document.getElementById('flow-steps-container');
    if (!container) return;

    container.innerHTML = '';

    currentFlowSteps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'flow-step-row';
      row.innerHTML = `
        <div class="flow-step-order">${index + 1}</div>
        <div class="flow-step-controls">
          <button type="button" class="flow-step-btn btn-step-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Mover para cima">▲</button>
          <button type="button" class="flow-step-btn btn-step-down" data-index="${index}" ${index === currentFlowSteps.length - 1 ? 'disabled' : ''} title="Mover para baixo">▼</button>
        </div>
        <input type="text" list="flow-step-presets" class="form-input flow-step-name-input" placeholder="Nome da Etapa" value="${Security.sanitizeHTML(step.etapa)}">
        <input type="text" class="form-input flow-step-value-input" placeholder="Fornecedor / Local / Observações" value="${Security.sanitizeHTML(step.valor)}">
        <button type="button" class="btn btn--ghost btn--icon flow-step-remove" data-index="${index}" title="Remover Etapa">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      // Eventos de digitação nos inputs
      const nameInput = row.querySelector('.flow-step-name-input');
      const valInput = row.querySelector('.flow-step-value-input');

      nameInput.addEventListener('input', () => {
        currentFlowSteps[index].etapa = nameInput.value;
      });
      valInput.addEventListener('input', () => {
        currentFlowSteps[index].valor = valInput.value;
      });

      // Botão Subir (▲)
      row.querySelector('.btn-step-up').addEventListener('click', () => {
        syncFlowInputs();
        if (index > 0) {
          const temp = currentFlowSteps[index];
          currentFlowSteps[index] = currentFlowSteps[index - 1];
          currentFlowSteps[index - 1] = temp;
          renderFlowSteps();
          triggerAutoSave();
        }
      });

      // Botão Descer (▼)
      row.querySelector('.btn-step-down').addEventListener('click', () => {
        syncFlowInputs();
        if (index < currentFlowSteps.length - 1) {
          const temp = currentFlowSteps[index];
          currentFlowSteps[index] = currentFlowSteps[index + 1];
          currentFlowSteps[index + 1] = temp;
          renderFlowSteps();
          triggerAutoSave();
        }
      });

      // Botão Remover (✕)
      row.querySelector('.flow-step-remove').addEventListener('click', () => {
        syncFlowInputs();
        currentFlowSteps.splice(index, 1);
        renderFlowSteps();
        triggerAutoSave();
      });

      container.appendChild(row);
    });
  }

  /**
   * Sincroniza os valores atuais dos inputs na memória
   */
  function syncFlowInputs() {
    const container = document.getElementById('flow-steps-container');
    if (!container) return;
    const rows = container.querySelectorAll('.flow-step-row');
    rows.forEach((row, i) => {
      if (currentFlowSteps[i]) {
        const nameInput = row.querySelector('.flow-step-name-input');
        const valInput = row.querySelector('.flow-step-value-input');
        if (nameInput) currentFlowSteps[i].etapa = nameInput.value.trim();
        if (valInput) currentFlowSteps[i].valor = valInput.value.trim();
      }
    });
  }

  /**
   * Adiciona uma nova etapa ao fluxo de produção
   */
  function addFlowStep(etapa = '', valor = '') {
    syncFlowInputs();
    currentFlowSteps.push({ etapa, valor });
    renderFlowSteps();
    triggerAutoSave();
  }

  /**
   * Configura eventos do Fluxo de Produção
   */
  function setupFlowStepEvents() {
    const addBtn = document.getElementById('btn-add-flow-step');
    if (addBtn) {
      addBtn.addEventListener('click', () => addFlowStep());
    }
  }

  /**
   * Configura eventos das tabelas de medidas
   */
  function setupMeasureTableEvents() {
    // Botões "Adicionar Linha"
    document.querySelectorAll('[data-add-measure-row]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tableId = btn.dataset.addMeasureRow;
        const table = document.getElementById(tableId);
        if (!table) return;

        const headers = Array.from(table.querySelectorAll('thead th'))
          .map(th => th.textContent.trim())
          .filter(h => h && h !== 'Descrição' && h !== '');

        const tbody = table.querySelector('tbody');
        tbody.appendChild(createMeasureRow(headers));
      });
    });
  }

  /**
   * Configura eventos para combinações de cores
   */
  function setupColorComboEvents() {
    const addBtn = document.getElementById('add-color-combo');
    if (addBtn) {
      addBtn.addEventListener('click', () => addColorCombo());
    }
  }

  /**
   * Configura auto-save de rascunho (debounced)
   */
  function setupAutoSave() {
    const formContainer = document.getElementById('view-form');
    if (!formContainer) return;

    const debouncedSave = Security.debounce(() => {
      const data = collectData();
      Config.saveDraft(data);
    }, 5000); // Salva rascunho a cada 5s de inatividade

    formContainer.addEventListener('input', debouncedSave);
  }

  /**
   * Configura validação em tempo real dos campos
   */
  function setupFieldValidation() {
    // Campos obrigatórios
    const requiredFields = ['field-modelo', 'field-referencia'];

    requiredFields.forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (!el) return;

      el.addEventListener('blur', () => {
        const errorEl = el.parentElement.querySelector('.form-error');
        if (el.value.trim() === '') {
          el.classList.add('error');
          if (errorEl) errorEl.classList.add('visible');
        } else {
          el.classList.remove('error');
          if (errorEl) errorEl.classList.remove('visible');
        }
      });

      el.addEventListener('input', () => {
        if (el.value.trim() !== '') {
          el.classList.remove('error');
          const errorEl = el.parentElement.querySelector('.form-error');
          if (errorEl) errorEl.classList.remove('visible');
        }
      });
    });
  }

  /**
   * Configura eventos dos QR Codes automáticos
   */
  function setupQRPreview() {
    const copyBtn = document.getElementById('btn-copy-qr-url');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('qr-auto-url');
        if (urlInput && urlInput.value) {
          navigator.clipboard.writeText(urlInput.value)
            .then(() => App.showToast('Link copiado', 'URL das fotos copiada', 'success'))
            .catch(() => App.showToast('Erro ao copiar', 'Falha ao copiar link', 'error'));
        }
      });
    }

    const copyFeedbackBtn = document.getElementById('btn-copy-qr-feedback-url');
    if (copyFeedbackBtn) {
      copyFeedbackBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('qr-feedback-url');
        if (urlInput && urlInput.value) {
          navigator.clipboard.writeText(urlInput.value)
            .then(() => App.showToast('Link copiado', 'URL de feedback copiada', 'success'))
            .catch(() => App.showToast('Erro ao copiar', 'Falha ao copiar link', 'error'));
        }
      });
    }
  }

  /**
   * Atualiza os QR codes automáticos da peça (Fotos e Feedback)
   */
  function updateAllQRPreviews() {
    const pendingDiv = document.getElementById('qr-auto-pending');
    const generatedDiv = document.getElementById('qr-auto-generated');
    const previewDiv = document.getElementById('qr-auto-preview');
    const urlInput = document.getElementById('qr-auto-url');
    const previewFeedbackDiv = document.getElementById('qr-feedback-preview');
    const urlFeedbackInput = document.getElementById('qr-feedback-url');

    if (!pendingDiv || !generatedDiv) return;

    if (previewDiv) previewDiv.innerHTML = '';
    if (previewFeedbackDiv) previewFeedbackDiv.innerHTML = '';

    if (currentFichaId) {
      // 1. URL Fotos
      const uniqueFotosUrl = getFichaPublicQRUrl(currentFichaId);
      if (urlInput) urlInput.value = uniqueFotosUrl;

      // 2. URL Feedback
      const uniqueFeedbackUrl = getFichaPublicFeedbackQRUrl(currentFichaId);
      if (urlFeedbackInput) urlFeedbackInput.value = uniqueFeedbackUrl;

      if (typeof QRCode === 'undefined') {
        if (previewDiv) previewDiv.innerHTML = '<span class="qr-preview--empty" style="color: var(--color-error); font-size: var(--font-size-xs);">QRCode indisponível</span>';
        if (previewFeedbackDiv) previewFeedbackDiv.innerHTML = '<span class="qr-preview--empty" style="color: var(--color-error); font-size: var(--font-size-xs);">QRCode indisponível</span>';
        pendingDiv.style.display = 'none';
        generatedDiv.style.display = 'grid';
        return;
      }

      try {
        if (previewDiv) {
          new QRCode(previewDiv, {
            text: uniqueFotosUrl,
            width: 100,
            height: 100,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }

        if (previewFeedbackDiv) {
          new QRCode(previewFeedbackDiv, {
            text: uniqueFeedbackUrl,
            width: 100,
            height: 100,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }

        pendingDiv.style.display = 'none';
        generatedDiv.style.display = 'grid';
      } catch (e) {
        console.error('Erro ao gerar QR Codes:', e);
        if (previewDiv) previewDiv.innerHTML = '<span class="qr-preview--empty">Erro</span>';
      }
    } else {
      if (urlInput) urlInput.value = '';
      if (urlFeedbackInput) urlFeedbackInput.value = '';
      pendingDiv.style.display = 'flex';
      generatedDiv.style.display = 'none';
    }
  }

  /**
   * Tenta carregar rascunho salvo
   */
  function loadDraft() {
    const draft = Config.loadDraft();
    if (draft) {
      fillForm(draft);
    }
  }

  /**
   * Limpa o formulário completamente
   */
  function clearForm() {
    currentFichaId = null;

    // Limpar campos de texto
    for (const elementId of Object.values(FIELDS)) {
      const el = document.getElementById(elementId);
      if (el) {
        el.value = '';
        el.classList.remove('error');
      }
    }

    // Resetar etapas do fluxo de produção para as 7 etapas padrão
    currentFlowSteps = JSON.parse(JSON.stringify(DEFAULT_FLOW_STEPS));
    renderFlowSteps();

    // Limpar status
    const radios = document.querySelectorAll('input[name="status-aprovacao"]');
    radios.forEach(r => r.checked = false);
    const pendente = document.querySelector('input[name="status-aprovacao"][value="pendente"]');
    if (pendente) pendente.checked = true;

    // Limpar tabelas (restaurar 3 linhas vazias)
    ['measure-table-pmg', 'measure-table-num'].forEach(tableId => {
      const table = document.getElementById(tableId);
      if (!table) return;
      const headers = Array.from(table.querySelectorAll('thead th'))
        .map(th => th.textContent.trim())
        .filter(h => h && h !== 'Descrição' && h !== '');
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        tbody.appendChild(createMeasureRow(headers));
      }
    });

    // Limpar títulos de tabelas
    const titles = ['measure-title-pmg', 'measure-title-num'];
    titles.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Limpar combinações de cores
    const combosContainer = document.getElementById('color-combos-container');
    if (combosContainer) {
      combosContainer.innerHTML = '';
      addColorCombo();
    }

    // Limpar previews QR
    const pendingDiv = document.getElementById('qr-auto-pending');
    const generatedDiv = document.getElementById('qr-auto-generated');
    const urlInput = document.getElementById('qr-auto-url');
    const urlFeedbackInput = document.getElementById('qr-feedback-url');
    if (pendingDiv && generatedDiv) {
      if (urlInput) urlInput.value = '';
      if (urlFeedbackInput) urlFeedbackInput.value = '';
      pendingDiv.style.display = 'flex';
      generatedDiv.style.display = 'none';
    }

    // Limpar erros visuais
    document.querySelectorAll('.form-error.visible').forEach(el => el.classList.remove('visible'));

    // Limpar fotos
    clearPhotos();

    // Limpar rascunho
    Config.clearDraft();
  }

  /**
   * Valida o formulário completo
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validate() {
    const data = collectData();
    const result = Security.validateFichaSchema(data);

    // Marcar campos com erro visual
    if (!result.valid) {
      result.errors.forEach(error => {
        const fieldName = error.replace('Campo obrigatório: ', '');
        const elementId = FIELDS[fieldName];
        if (elementId) {
          const el = document.getElementById(elementId);
          if (el) {
            el.classList.add('error');
            const errorEl = el.parentElement.querySelector('.form-error');
            if (errorEl) errorEl.classList.add('visible');
          }
        }
      });
    }

    return result;
  }

  /**
   * Configura os eventos de upload e arrastar-e-soltar de foto
   */
  function setupPhotoUploadEvents() {
    const zone = document.getElementById('photo-upload-zone');
    const fileInput = document.getElementById('field-photo-file');

    if (!zone || !fileInput) return;

    // Clicar na zona abre o seletor de arquivos
    zone.addEventListener('click', (e) => {
      if (e.target.closest('.photo-preview-item__remove')) {
        return;
      }
      fileInput.click();
    });

    // Alteração no input file
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      handleMultiplePhotosUpload(files);
    });

    // Eventos de arrastar e soltar
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      handleMultiplePhotosUpload(files);
    });
  }

  /**
   * Processa, redimensiona e comprime as fotos selecionadas
   */
  function handleMultiplePhotosUpload(files) {
    if (!files || files.length === 0) return;

    const MAX_PHOTOS = 6;

    if (currentFotos.length + files.length > MAX_PHOTOS) {
      alert(`Limite atingido: você pode carregar no máximo ${MAX_PHOTOS} fotos por ficha técnica.`);
      return;
    }

    let loadedCount = 0;
    const filesToProcess = files.slice(0, MAX_PHOTOS - currentFotos.length);

    filesToProcess.forEach(file => {
      if (file.type && !file.type.startsWith('image/')) {
        alert(`Arquivo "${file.name}" inválido. Selecione apenas imagens.`);
        loadedCount++;
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        // Enviar foto na qualidade original (armazenamento via Google Drive)
        currentFotos.push(e.target.result);
        loadedCount++;

        if (loadedCount === filesToProcess.length) {
          renderPhotosPreviews();
          triggerAutoSave();
        }
      };
      reader.onerror = function() {
        alert(`Falha ao processar o arquivo "${file.name}". Certifique-se de que é uma imagem válida.`);
        loadedCount++;
        if (loadedCount === filesToProcess.length) {
          renderPhotosPreviews();
          triggerAutoSave();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Renderiza os previews das fotos no grid
   */
  function renderPhotosPreviews() {
    const grid = document.getElementById('photos-preview-grid');
    const placeholder = document.getElementById('photo-upload-placeholder');
    const fileInput = document.getElementById('field-photo-file');

    if (!grid) return;

    if (fileInput) fileInput.value = '';

    if (currentFotos.length === 0) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      return;
    }

    if (placeholder) {
      if (currentFotos.length >= 6) {
        placeholder.style.display = 'none';
      } else {
        placeholder.style.display = 'flex';
      }
    }

    grid.style.display = 'grid';
    grid.innerHTML = currentFotos.map((base64, index) => `
      <div class="photo-preview-item">
        <img src="${base64}" alt="Foto ${index + 1}">
        <button type="button" class="photo-preview-item__remove" data-index="${index}" title="Remover Foto">
          ✕
        </button>
      </div>
    `).join('');

    // Adicionar eventos para remover fotos
    const removeButtons = grid.querySelectorAll('.photo-preview-item__remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index'));
        if (confirm('Deseja remover esta foto?')) {
          currentFotos.splice(index, 1);
          renderPhotosPreviews();
          triggerAutoSave();
        }
      });
    });
  }

  /**
   * Define o estado das fotos carregadas
   */
  function setPhotos(fotosArray) {
    currentFotos = Array.isArray(fotosArray) ? [...fotosArray] : [];
    renderPhotosPreviews();
  }

  /**
   * Limpa todas as fotos atuais
   */
  function clearPhotos() {
    currentFotos = [];
    renderPhotosPreviews();
  }

  function triggerAutoSave() {
    try {
      const data = collectData();
      Config.saveDraft(data);
    } catch (e) {
      console.warn('[Form] Falha ao disparar auto-save:', e);
    }
  }

  function getCurrentId() {
    return currentFichaId;
  }

  /**
   * Define o ID da ficha atual no formulário
   * Usado para fixar o ID após a primeira tentativa de salvamento,
   * garantindo que saves subsequentes usem 'update' em vez de 'create'
   * @param {string} id
   */
  function setCurrentId(id) {
    currentFichaId = id || null;
  }

  return {
    init,
    collectData,
    fillForm,
    clearForm,
    validate,
    getCurrentId,
    setCurrentId,
    addColorCombo,
    addFlowStep,
    renderFlowSteps,
    updateAllQRPreviews
  };
})();
