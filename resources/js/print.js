/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — Print Module
   Geração de layout de impressão A5 e QR Codes
   ═══════════════════════════════════════════════════════════════ */

const PrintModule = (() => {
  'use strict';

  /**
   * Gera e exibe o layout de impressão A5
   * @param {Object} data - Dados da ficha coletados do formulário
   * @param {HTMLElement} [container] - Container de destino
   */
  function generatePrintLayout(data, container) {
    const target = container || document.getElementById('print-area');
    if (!target) return;

    const s = Security.sanitizeHTML; // Alias para brevidade

    // Processar etapas do Fluxo de Produção (maleável)
    let flowSteps = [];
    if (Array.isArray(data.fluxoProducao) && data.fluxoProducao.length > 0) {
      flowSteps = data.fluxoProducao;
    } else {
      // Fallback para campos tradicionais (6 etapas de produção)
      flowSteps = [
        { etapa: 'Corte', valor: data.corte || '' },
        { etapa: 'Bordado/Silk', valor: data.bordadoSilk || '' },
        { etapa: 'Confecção', valor: data.confeccao || '' },
        { etapa: 'Lavanderia', valor: data.lavanderia || '' },
        { etapa: 'Acabamento', valor: data.acabamento || '' },
        { etapa: 'Fase Final', valor: data.faseFinal || '' }
      ];
    }

    // Processar observações em parágrafos separados
    let obsParagraphs = [];
    if (data.obsCostura) {
      obsParagraphs = String(data.obsCostura)
        .split(/\r?\n+/)
        .map(p => p.trim())
        .filter(Boolean);
    }

    target.innerHTML = `
      <div class="print-sheet">
        <div class="print-body-content">

          <!-- ═══ HEADER ═══ -->
          <div class="print-header print-no-break">
            <div class="print-header__brand">
              <img src="img/logo.png" class="print-header__logo-img" alt="LLA FICHA">
              <div>
                <div class="print-header__title">LLA FICHA</div>
                <div class="print-header__subtitle">Ficha Interna de Vestuário</div>
              </div>
            </div>
            <div class="print-header__meta">
              <div class="print-header__ref">REF: <span class="print-header__ref-val">${s(data.referencia || '—')}</span></div>
              <div>OP: <span class="print-header__op-val">${s(data.op || '—')}</span></div>
              <div>${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          <!-- ═══ 4. IDENTIFICAÇÃO + 7. QR CODE LADO A LADO ═══ -->
          <div class="print-id-wrapper print-no-break">
            <div class="print-section print-id-section">
              <div class="print-section__title">Identificação da Peça</div>
              <div class="print-grid">
                <!-- Linha 1: Modelo / Pilotista -->
                <div class="print-field">
                  <span class="print-field__label">Modelo:</span>
                  <span class="print-field__value">${s(data.modelo || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Pilotista:</span>
                  <span class="print-field__value">${s(data.pilotista || '—')}</span>
                </div>

                <!-- Linha 2: REF / Modelista -->
                <div class="print-field">
                  <span class="print-field__label">Ref:</span>
                  <span class="print-field__value">${s(data.referencia || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Modelista:</span>
                  <span class="print-field__value">${s(data.modelista || '—')}</span>
                </div>

                <!-- Linha 3: OP / Cor Linha -->
                <div class="print-field">
                  <span class="print-field__label">OP:</span>
                  <span class="print-field__value">${s(data.op || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Cor Linha:</span>
                  <span class="print-field__value">${s(data.corLinha || '—')}</span>
                </div>

                <!-- Linha 4: Tecido / Composição -->
                <div class="print-field">
                  <span class="print-field__label">Tecido:</span>
                  <span class="print-field__value">${s(data.tecido || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Composição:</span>
                  <span class="print-field__value">${s(data.composicao || '—')}</span>
                </div>

                <!-- Linha 5: Cores do Tecido / Grade -->
                <div class="print-field">
                  <span class="print-field__label">Cores do Tecido:</span>
                  <span class="print-field__value">${s(data.coresTecido || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Grade:</span>
                  <span class="print-field__value">${s(data.grade || '—')}</span>
                </div>

                <!-- Linha 6: Quant. Corte / Enfesto -->
                <div class="print-field">
                  <span class="print-field__label">Quant. Corte:</span>
                  <span class="print-field__value">${s(data.quantCorte || '—')}</span>
                </div>
                <div class="print-field">
                  <span class="print-field__label">Enfesto:</span>
                  <span class="print-field__value">${s(data.enfesto || '—')}</span>
                </div>
              </div>
            </div>

            <!-- QR Codes ao lado da Identificação (Topo da folha: Fotos e Feedback) -->
            <div class="print-id-qrs">
              <!-- QR Fotos -->
              <div class="print-id-qr ${data.qrCorteUrl ? '' : 'print-id-qr--empty'}">
                <div class="print-id-qr__label">QR Fotos</div>
                <div class="print-qr-peca-el"></div>
                ${!data.qrCorteUrl ? '<div class="print-id-qr__sublabel">Sem fotos</div>' : ''}
              </div>

              <!-- QR Feedback -->
              <div class="print-id-qr ${data.qrFeedbackUrl ? '' : 'print-id-qr--empty'}">
                <div class="print-id-qr__label">QR Feedback</div>
                <div class="print-qr-feedback-el"></div>
                ${!data.qrFeedbackUrl ? '<div class="print-id-qr__sublabel">Defeito/Obs</div>' : ''}
              </div>
            </div>
          </div>

          <!-- ═══ 5. FLUXO DE PRODUÇÃO (ORDEM MALEÁVEL) ═══ -->
          <div class="print-section print-no-break">
            <div class="print-section__title">Fluxo de Produção</div>
            <div class="print-grid print-grid--flow">
              ${flowSteps.map((step, idx) => `
                <div class="print-field ${idx === flowSteps.length - 1 && flowSteps.length % 3 === 1 ? 'print-field--full' : ''}">
                  <span class="print-field__label">${idx + 1}. ${s(step.etapa)}:</span>
                  <span class="print-field__value">${s(step.valor || '—')}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- ═══ TABELA MEDIDAS P/M/G ═══ -->
          ${generateMeasureTableHTML('Medidas (P ao G)', data.medidasPMGTitulo, data.medidasPMG, ['P', 'M', 'G'])}

          <!-- ═══ TABELA MEDIDAS NUMERAÇÃO ═══ -->
          ${generateMeasureTableHTML('Medidas (Numeração)', data.medidasNumeracaoTitulo, data.medidasNumeracao, ['34', '36', '38', '40', '42', '44', '46'])}

          <!-- ═══ 6. OBSERVAÇÕES (EM PARÁGRAFOS) ═══ -->
          ${obsParagraphs.length > 0 ? `
          <div class="print-section print-no-break">
            <div class="print-section__title">Observações Importantes</div>
            <div class="print-obs">
              <span class="print-obs__label">Costura / Observações Gerais:</span>
              ${obsParagraphs.map(p => `<div class="print-obs__p">${s(p)}</div>`).join('')}
            </div>
          </div>
          ` : ''}

          <!-- ═══ COMBINAÇÕES DE CORES ═══ -->
          ${data.combinacoesCores && data.combinacoesCores.length > 0 ? `
          <div class="print-section print-no-break">
            <div class="print-section__title">Combinação de Cores</div>
            <div class="print-combos">
              ${data.combinacoesCores.map(c =>
                `<span class="print-combo">${s(c.peca || '—')} &nbsp;→&nbsp; ${s(c.bordado || '—')}</span>`
              ).join('')}
            </div>
          </div>
          ` : ''}

        </div><!-- /.print-body-content -->

        <!-- ═══ RODAPÉ FIXO: VALIDAÇÃO / APROVAÇÃO ═══ -->
        <div class="print-status print-no-break">
          <div class="print-status__approval">
            <span style="font-weight: 800; font-size: 6.8pt; text-transform: uppercase;">Aprovação:</span>
            <span class="print-status__check ${data.statusAprovacao === 'aprovada' ? 'checked' : ''}"></span>&nbsp;SIM
            &nbsp;&nbsp;
            <span class="print-status__check ${data.statusAprovacao === 'reprovada' ? 'checked' : ''}"></span>&nbsp;NÃO
            &nbsp;&nbsp;&nbsp;&nbsp;
            <span>Resp: <span class="print-status__val">${s(data.responsavelAprovacao || '____________________')}</span></span>
          </div>
          <div class="print-status__meta">
            Data: <span class="print-status__val">${s(data.dataAprovacao || new Date().toLocaleDateString('pt-BR'))}</span>
          </div>
        </div>

      </div><!-- /.print-sheet -->
    `;

    // Gerar QR code no container
    generatePrintQRCodes(data, target);
  }

  /**
   * Gera HTML de uma tabela de medidas para impressão
   */
  function generateMeasureTableHTML(sectionTitle, tableTitle, data, columns) {
    if (!data || data.length === 0) return '';

    const s = Security.sanitizeHTML;

    return `
      <div class="print-section print-no-break">
        <div class="print-section__title">${s(sectionTitle)}${tableTitle ? ' — ' + s(tableTitle) : ''}</div>
        <table class="print-table">
          <thead>
            <tr>
              <th>Descrição</th>
              ${columns.map(col => `<th>${s(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                <td>${s(row.descricao || '')}</td>
                ${columns.map(col => `<td>${s(row.valores?.[col] || '—')}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Gera os QR codes no container
   */
  function generatePrintQRCodes(data, parent) {
    if (typeof QRCode === 'undefined') {
      console.warn('[Print] Biblioteca QRCode não está disponível. Pulando geração de QR.');
      return;
    }

    const qrConfig = {
      width: 72,
      height: 72,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    };

    const qrMap = [
      { classSelector: '.print-qr-peca-el', url: data.qrCorteUrl },
      { classSelector: '.print-qr-feedback-el', url: data.qrFeedbackUrl }
    ];

    qrMap.forEach(({ classSelector, url }) => {
      const el = parent.querySelector(classSelector);
      if (el && url && Security.validateURL(url)) {
        try {
          el.innerHTML = '';
          new QRCode(el, { ...qrConfig, text: url });
        } catch (e) {
          console.warn(`[Print] Falha ao gerar QR code para ${classSelector}:`, e);
        }
      }
    });
  }

  /**
   * Executa a impressão
   * @param {Object} [data] - Dados da ficha (se não fornecido, coleta do formulário)
   */
  function print(data) {
    try {
      console.log('[Print] print() chamado', data);
      const fichaData = data || FichaForm.collectData();
      console.log('[Print] Dados da ficha coletados', fichaData);

      // Gerar layout
      generatePrintLayout(fichaData);
      console.log('[Print] Layout gerado no DOM');

      // Imprimir de forma síncrona para evitar bloqueio do navegador
      window.print();
      console.log('[Print] window.print() executado');
    } catch (err) {
      alert('Erro no módulo de impressão: ' + err.message);
      console.error('[Print] Erro ao imprimir:', err);
    }
  }

  return {
    generatePrintLayout,
    print
  };
})();
