/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — Google Apps Script (Code.gs)
   Backend para Google Sheets com autenticação, auditoria,
   gestão de fotos no Drive e central de feedbacks de parceiros.
   
   INSTRUÇÕES:
   1. Crie uma planilha no Google Sheets
   2. Vá em Extensões > Apps Script
   3. Cole todo este código no editor
   4. Configure o token em: Configurações do Projeto > Propriedades do Script
      - Adicione: API_TOKEN = <seu_token_secreto>
   5. Publique como Web App:
      - Executar como: Eu
      - Quem tem acesso: Qualquer pessoa
   6. Copie a URL gerada e insira no campo "Endpoint" do sistema
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════ CONFIGURAÇÕES ═══════════════

const CONFIG = {
  SHEET_FICHAS: 'Fichas',
  SHEET_LOGS: 'Logs',
  SHEET_FEEDBACKS: 'Feedbacks',
  RATE_LIMIT_MAX: 40,         // Máx requisições por minuto
  RATE_LIMIT_WINDOW: 60000,   // 1 minuto em ms
  DRIVE_FOLDER_NAME: 'LLAMENINA_Fotos_Fichas',
  DRIVE_FOLDER_FEEDBACKS_NAME: 'LLAMENINA_Fotos_Feedbacks',
};

// ═══════════════ COLUNAS DA PLANILHA (FICHAS) ═══════════════

const COLUMNS = {
  ID: 1,
  TIMESTAMP_CRIACAO: 2,
  TIMESTAMP_ATUALIZACAO: 3,
  MODELO: 4,
  REFERENCIA: 5,
  OP: 6,
  MODELISTA: 7,
  PILOTISTA: 8,
  TECIDO: 9,
  COMPOSICAO: 10,
  COR_LINHA: 11,
  CORTE: 12,
  BORDADO_SILK: 13,
  CONFECCAO: 14,
  LAVANDERIA: 15,
  LACRE_LAVANDERIA: 16,
  ACABAMENTO: 17,
  FASE_FINAL: 18,
  FOTO: 19,
  MEDIDAS_PMG_TITULO: 20,
  MEDIDAS_PMG: 21,
  MEDIDAS_NUM_TITULO: 22,
  MEDIDAS_NUM: 23,
  OBS_COSTURA: 24,
  COMBINACOES_CORES: 25,
  QR_CORTE: 26,
  QR_ANEXOS: 27,
  QR_FEEDBACK: 28,
  STATUS: 29,
  RESPONSAVEL: 30,
  DATA_APROVACAO: 31,
  ATIVO: 32,
  CORES_TECIDO: 33,
  GRADE: 34,
  QUANT_CORTE: 35,
  ENFESTO: 36,
};

const TOTAL_COLUMNS = 36;

// ═══════════════ COLUNAS DA PLANILHA (FEEDBACKS) ═══════════════

const FEEDBACK_COLUMNS = {
  ID: 1,
  TIMESTAMP: 2,
  FICHA_ID: 3,
  MODELO: 4,
  REFERENCIA: 5,
  OP: 6,
  PARCEIRO: 7,
  SETOR: 8,
  TIPO: 9,
  GRAVIDADE: 10,
  DESCRICAO: 11,
  FOTOS: 12,
  STATUS: 13,
  OBS_INTERNA: 14,
  RESOLVIDO_EM: 15,
};

const TOTAL_FEEDBACK_COLUMNS = 15;

// ═══════════════ HANDLERS PRINCIPAIS ═══════════════

/**
 * Handler para requisições POST (Criar/Atualizar/Deletar Fichas e Feedbacks)
 */
function doPost(e) {
  try {
    // 1. Parsear body
    const body = e.postData ? e.postData.contents : '';
    
    if (!body) {
      return jsonResponse({ error: 'Body vazio', code: 'EMPTY_BODY' });
    }
    
    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      return jsonResponse({ error: 'JSON inválido', code: 'INVALID_JSON' });
    }
    
    // 2. Autenticação
    const token = data._token || '';
    if (!validateToken(token)) {
      logAudit('AUTH_FAIL', '', 'Token inválido (POST)');
      return jsonResponse({ error: 'Token de autenticação inválido', code: 'AUTH_FAILED' });
    }
    
    // 3. Rate limiting
    if (!rateLimitCheck()) {
      return jsonResponse({ error: 'Limite de requisições excedido', code: 'RATE_LIMITED' });
    }
    
    // 4. Remover campos internos
    delete data._token;
    delete data._timestamp;
    
    // 5. Processar ação
    const action = sanitize(data.action);
    
    switch (action) {
      // ── Fichas ──
      case 'create':
        return handleCreate(data.ficha);
      case 'update':
        return handleUpdate(data.ficha);
      case 'delete':
        return handleDelete(data.id);
      case 'get':
        return handleGet(data.id);

      // ── Feedbacks ──
      case 'submitFeedback':
        return handleSubmitFeedback(data.feedback);
      case 'updateFeedbackStatus':
        return handleUpdateFeedbackStatus(data.id, data.status, data.obsInterna);
      case 'deleteFeedback':
        return handleDeleteFeedback(data.id);

      default:
        return jsonResponse({ error: 'Ação inválida: ' + action, code: 'INVALID_ACTION' });
    }
    
  } catch (err) {
    logAudit('ERROR', '', err.message);
    return jsonResponse({ error: 'Erro interno: ' + err.message, code: 'SERVER_ERROR' });
  }
}

/**
 * Handler para requisições GET (Listar/Buscar/Ping/Feedbacks)
 */
function doGet(e) {
  try {
    const params = e.parameter || {};
    
    // Autenticação
    const token = params.token || '';
    if (!validateToken(token)) {
      logAudit('AUTH_FAIL', '', 'Token inválido (GET)');
      return jsonResponse({ error: 'Token de autenticação inválido', code: 'AUTH_FAILED' });
    }
    
    // Rate limiting
    if (!rateLimitCheck()) {
      return jsonResponse({ error: 'Limite de requisições excedido', code: 'RATE_LIMITED' });
    }
    
    const action = sanitize(params.action || 'list');
    
    switch (action) {
      case 'ping':
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
      case 'list':
        return handleList();
      case 'search':
        return handleSearch(sanitize(params.q || ''));
      case 'get':
        return handleGet(sanitize(params.id || ''));
      case 'getFichaBasic':
        return handleGetFichaBasic(sanitize(params.id || ''));

      // ── Feedbacks ──
      case 'listFeedbacks':
        return handleListFeedbacks();
      case 'getFeedbacksByFicha':
        return handleGetFeedbacksByFicha(sanitize(params.fichaId || ''));

      default:
        return jsonResponse({ error: 'Ação inválida: ' + action, code: 'INVALID_ACTION' });
    }
    
  } catch (err) {
    logAudit('ERROR', '', err.message);
    return jsonResponse({ error: 'Erro interno do servidor: ' + err.message, code: 'SERVER_ERROR' });
  }
}

// ═══════════════ OPERAÇÕES CRUD — FICHAS ═══════════════

/**
 * Cria uma nova ficha
 */
function handleCreate(ficha) {
  if (!ficha || typeof ficha !== 'object') {
    return jsonResponse({ error: 'Dados da ficha inválidos', code: 'INVALID_DATA' });
  }
  
  // Validar campos obrigatórios
  if (!ficha.modelo || !ficha.referencia) {
    return jsonResponse({ error: 'Campos obrigatórios: modelo, referencia', code: 'VALIDATION_ERROR' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const id = ficha.id || Utilities.getUuid();
  const now = new Date().toISOString();
  
  // PROTEÇÃO CONTRA DUPLICAÇÃO: Se o ID já existe, redirecionar para update (upsert)
  const existingRow = findRowById(sheet, id, COLUMNS.ID);
  if (existingRow !== -1) {
    ficha.id = id;
    logAudit('CREATE_UPSERT', id, 'ID já existente, redirecionando para update: ' + sanitize(ficha.modelo || ''));
    return handleUpdate(ficha);
  }
  
  // Salvar fotos no Google Drive (pasta LLAMENINA_Fotos_Fichas)
  ficha = processAndUploadPhotos_(ficha, id);
  
  const row = buildRow(id, now, now, ficha);
  sheet.appendRow(row);
  
  logAudit('CREATE', id, 'Ficha criada: ' + sanitize(ficha.modelo));
  
  return jsonResponse({
    success: true,
    id: id,
    message: 'Ficha criada com sucesso'
  });
}

/**
 * Atualiza uma ficha existente
 */
function handleUpdate(ficha) {
  if (!ficha || !ficha.id) {
    return jsonResponse({ error: 'ID da ficha obrigatório para atualizar', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const rowIndex = findRowById(sheet, ficha.id, COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Ficha não encontrada', code: 'NOT_FOUND' });
  }
  
  const now = new Date().toISOString();
  const originalCreation = sheet.getRange(rowIndex, COLUMNS.TIMESTAMP_CRIACAO).getValue();
  
  // Salvar fotos no Google Drive (pasta LLAMENINA_Fotos_Fichas)
  ficha = processAndUploadPhotos_(ficha, ficha.id);
  
  const row = buildRow(ficha.id, originalCreation || now, now, ficha);
  sheet.getRange(rowIndex, 1, 1, TOTAL_COLUMNS).setValues([row]);
  
  logAudit('UPDATE', ficha.id, 'Ficha atualizada: ' + sanitize(ficha.modelo || ''));
  
  return jsonResponse({
    success: true,
    id: ficha.id,
    message: 'Ficha atualizada com sucesso'
  });
}

/**
 * Soft delete de uma ficha
 */
function handleDelete(id) {
  if (!id) {
    return jsonResponse({ error: 'ID obrigatório', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const rowIndex = findRowById(sheet, sanitize(id), COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Ficha não encontrada', code: 'NOT_FOUND' });
  }
  
  // Soft delete: marcar como inativa
  sheet.getRange(rowIndex, COLUMNS.ATIVO).setValue('FALSE');
  sheet.getRange(rowIndex, COLUMNS.TIMESTAMP_ATUALIZACAO).setValue(new Date().toISOString());
  
  logAudit('DELETE', id, 'Ficha desativada');
  
  return jsonResponse({
    success: true,
    message: 'Ficha removida com sucesso'
  });
}

/**
 * Lista todas as fichas ativas
 */
function handleList() {
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    logAudit('READ', '', 'Lista vazia');
    return jsonResponse({ fichas: [], total: 0 });
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLUMNS).getValues();
  const fichas = data
    .filter(row => {
      if (!row[COLUMNS.ID - 1] || String(row[COLUMNS.ID - 1]).trim() === '') return false;
      return row[COLUMNS.ATIVO - 1] !== 'FALSE';
    })
    .map(rowToObject);
  
  logAudit('READ', '', 'Listou ' + fichas.length + ' fichas');
  
  return jsonResponse({ fichas: fichas, total: fichas.length });
}

/**
 * Busca fichas por texto
 */
function handleSearch(query) {
  if (!query) {
    return handleList();
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return jsonResponse({ fichas: [], total: 0 });
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLUMNS).getValues();
  const q = query.toLowerCase();
  
  const fichas = data
    .filter(row => {
      if (!row[COLUMNS.ID - 1] || String(row[COLUMNS.ID - 1]).trim() === '') return false;
      if (row[COLUMNS.ATIVO - 1] === 'FALSE') return false;
      const searchable = [
        row[COLUMNS.MODELO - 1],
        row[COLUMNS.REFERENCIA - 1],
        row[COLUMNS.OP - 1],
        row[COLUMNS.MODELISTA - 1],
        row[COLUMNS.PILOTISTA - 1],
        row[COLUMNS.TECIDO - 1],
        (row.length >= 33 ? row[COLUMNS.CORES_TECIDO - 1] : ''),
        (row.length >= 34 ? row[COLUMNS.GRADE - 1] : ''),
        (row.length >= 35 ? row[COLUMNS.QUANT_CORTE - 1] : ''),
        (row.length >= 36 ? row[COLUMNS.ENFESTO - 1] : '')
      ].join(' ').toLowerCase();
      return searchable.indexOf(q) !== -1;
    })
    .map(rowToObject);
  
  logAudit('SEARCH', '', 'Buscou "' + query + '": ' + fichas.length + ' resultados');
  
  return jsonResponse({ fichas: fichas, total: fichas.length });
}

/**
 * Busca uma ficha específica por ID
 */
function handleGet(id) {
  if (!id) {
    return jsonResponse({ error: 'ID obrigatório', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const rowIndex = findRowById(sheet, id, COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Ficha não encontrada', code: 'NOT_FOUND' });
  }
  
  const row = sheet.getRange(rowIndex, 1, 1, TOTAL_COLUMNS).getValues()[0];
  const ficha = rowToObject(row);
  
  logAudit('READ', id, 'Ficha consultada');
  
  return jsonResponse({ ficha: ficha });
}

/**
 * Retorna apenas os dados básicos públicos da ficha para o cabeçalho de feedback
 */
function handleGetFichaBasic(id) {
  if (!id) {
    return jsonResponse({ error: 'ID obrigatório', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FICHAS);
  const rowIndex = findRowById(sheet, id, COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Ficha não encontrada', code: 'NOT_FOUND' });
  }
  
  const row = sheet.getRange(rowIndex, 1, 1, TOTAL_COLUMNS).getValues()[0];
  
  return jsonResponse({
    ficha: {
      id: row[COLUMNS.ID - 1],
      modelo: row[COLUMNS.MODELO - 1],
      referencia: row[COLUMNS.REFERENCIA - 1],
      op: row[COLUMNS.OP - 1]
    }
  });
}

// ═══════════════ OPERAÇÕES CRUD — FEEDBACKS ═══════════════

/**
 * Registra um novo feedback enviado pelo parceiro
 */
function handleSubmitFeedback(feedback) {
  if (!feedback || typeof feedback !== 'object') {
    return jsonResponse({ error: 'Dados de feedback inválidos', code: 'INVALID_DATA' });
  }
  
  if (!feedback.descricao || !feedback.descricao.trim()) {
    return jsonResponse({ error: 'A descrição da observação é obrigatória', code: 'MISSING_DESCRIPTION' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FEEDBACKS);
  const feedbackId = feedback.id || ('FB_' + Utilities.getUuid().substring(0, 10));
  const now = new Date().toISOString();
  
  // Se veio foto no feedback, salva na pasta EXCLUSIVA DE FEEDBACKS no Google Drive
  feedback = processAndUploadFeedbackPhotos_(feedback, feedbackId);
  
  const row = buildFeedbackRow(feedbackId, now, feedback);
  sheet.appendRow(row);
  
  logAudit('FEEDBACK_SUBMIT', feedback.fichaId || '', 'Feedback recebido de ' + sanitize(feedback.parceiro || 'Parceiro'));
  
  return jsonResponse({
    success: true,
    id: feedbackId,
    message: 'Feedback registrado com sucesso'
  });
}

/**
 * Lista todos os feedbacks registrados (mais recentes primeiro)
 */
function handleListFeedbacks() {
  const sheet = getOrCreateSheet(CONFIG.SHEET_FEEDBACKS);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return jsonResponse({ feedbacks: [], total: 0 });
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, TOTAL_FEEDBACK_COLUMNS).getValues();
  const feedbacks = data
    .filter(row => row[FEEDBACK_COLUMNS.ID - 1] && String(row[FEEDBACK_COLUMNS.ID - 1]).trim() !== '')
    .map(feedbackRowToObject)
    .reverse(); // Mais recentes no topo
  
  return jsonResponse({ feedbacks: feedbacks, total: feedbacks.length });
}

/**
 * Lista feedbacks associados a uma ficha específica
 */
function handleGetFeedbacksByFicha(fichaId) {
  if (!fichaId) {
    return jsonResponse({ feedbacks: [], total: 0 });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FEEDBACKS);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return jsonResponse({ feedbacks: [], total: 0 });
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, TOTAL_FEEDBACK_COLUMNS).getValues();
  const feedbacks = data
    .filter(row => row[FEEDBACK_COLUMNS.FICHA_ID - 1] === fichaId)
    .map(feedbackRowToObject)
    .reverse();
  
  return jsonResponse({ feedbacks: feedbacks, total: feedbacks.length });
}

/**
 * Atualiza o status e anotações internas de um feedback
 */
function handleUpdateFeedbackStatus(feedbackId, newStatus, obsInterna) {
  if (!feedbackId) {
    return jsonResponse({ error: 'ID do feedback obrigatório', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FEEDBACKS);
  const rowIndex = findRowById(sheet, feedbackId, FEEDBACK_COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Feedback não encontrado', code: 'NOT_FOUND' });
  }
  
  const s = sanitize(newStatus || 'em_analise');
  sheet.getRange(rowIndex, FEEDBACK_COLUMNS.STATUS).setValue(s);
  
  if (obsInterna !== undefined) {
    sheet.getRange(rowIndex, FEEDBACK_COLUMNS.OBS_INTERNA).setValue(sanitize(obsInterna));
  }
  
  if (s === 'resolvido') {
    sheet.getRange(rowIndex, FEEDBACK_COLUMNS.RESOLVIDO_EM).setValue(new Date().toISOString());
  }
  
  logAudit('FEEDBACK_UPDATE', feedbackId, 'Status alterado para: ' + s);
  
  return jsonResponse({
    success: true,
    message: 'Status do feedback atualizado com sucesso'
  });
}

/**
 * Exclui um registro de feedback
 */
function handleDeleteFeedback(feedbackId) {
  if (!feedbackId) {
    return jsonResponse({ error: 'ID obrigatório', code: 'MISSING_ID' });
  }
  
  const sheet = getOrCreateSheet(CONFIG.SHEET_FEEDBACKS);
  const rowIndex = findRowById(sheet, feedbackId, FEEDBACK_COLUMNS.ID);
  
  if (rowIndex === -1) {
    return jsonResponse({ error: 'Feedback não encontrado', code: 'NOT_FOUND' });
  }
  
  sheet.deleteRow(rowIndex);
  logAudit('FEEDBACK_DELETE', feedbackId, 'Feedback excluído');
  
  return jsonResponse({
    success: true,
    message: 'Feedback excluído com sucesso'
  });
}

// ═══════════════ FUNÇÕES AUXILIARES — FICHAS ═══════════════

/**
 * Constrói array da linha para a aba Fichas
 */
function buildRow(id, createdAt, updatedAt, ficha) {
  const s = sanitize;
  return [
    id,
    createdAt,
    updatedAt,
    s(ficha.modelo || ''),
    s(ficha.referencia || ''),
    s(ficha.op || ''),
    s(ficha.modelista || ''),
    s(ficha.pilotista || ''),
    s(ficha.tecido || ''),
    s(ficha.composicao || ''),
    s(ficha.corLinha || ''),
    s(ficha.corte || ''),
    s(ficha.bordadoSilk || ''),
    s(ficha.confeccao || ''),
    s(ficha.lavanderia || ''),
    s(ficha.lacreLavanderia || ''),
    s(ficha.acabamento || ''),
    s(ficha.faseFinal || ''),
    ficha.foto || '',
    s(ficha.medidasPMGTitulo || ''),
    JSON.stringify(ficha.medidasPMG || []),
    s(ficha.medidasNumeracaoTitulo || ''),
    JSON.stringify(ficha.medidasNumeracao || []),
    s(ficha.obsCostura || ''),
    JSON.stringify(ficha.combinacoesCores || []),
    s(ficha.qrCorteUrl || ''),
    JSON.stringify(ficha.fluxoProducao || []),
    s(ficha.qrFeedbackUrl || ''),
    s(ficha.statusAprovacao || 'pendente'),
    s(ficha.responsavelAprovacao || ''),
    s(ficha.dataAprovacao || ''),
    'TRUE',
    s(ficha.coresTecido || ''),
    s(ficha.grade || ''),
    s(ficha.quantCorte || ''),
    s(ficha.enfesto || '')
  ];
}

/**
 * Converte uma linha da aba Fichas em objeto JSON
 */
function rowToObject(row) {
  return {
    id: row[COLUMNS.ID - 1],
    timestampCriacao: row[COLUMNS.TIMESTAMP_CRIACAO - 1],
    timestampAtualizacao: row[COLUMNS.TIMESTAMP_ATUALIZACAO - 1],
    modelo: row[COLUMNS.MODELO - 1],
    referencia: row[COLUMNS.REFERENCIA - 1],
    op: row[COLUMNS.OP - 1],
    modelista: row[COLUMNS.MODELISTA - 1],
    pilotista: row[COLUMNS.PILOTISTA - 1],
    tecido: row[COLUMNS.TECIDO - 1],
    composicao: row[COLUMNS.COMPOSICAO - 1],
    corLinha: row[COLUMNS.COR_LINHA - 1],
    corte: row[COLUMNS.CORTE - 1],
    bordadoSilk: row[COLUMNS.BORDADO_SILK - 1],
    confeccao: row[COLUMNS.CONFECCAO - 1],
    lavanderia: row[COLUMNS.LAVANDERIA - 1],
    lacreLavanderia: row[COLUMNS.LACRE_LAVANDERIA - 1],
    acabamento: row[COLUMNS.ACABAMENTO - 1],
    faseFinal: row[COLUMNS.FASE_FINAL - 1],
    foto: row[COLUMNS.FOTO - 1],
    medidasPMGTitulo: row[COLUMNS.MEDIDAS_PMG_TITULO - 1],
    medidasPMG: safeJsonParse(row[COLUMNS.MEDIDAS_PMG - 1]),
    medidasNumeracaoTitulo: row[COLUMNS.MEDIDAS_NUM_TITULO - 1],
    medidasNumeracao: safeJsonParse(row[COLUMNS.MEDIDAS_NUM - 1]),
    obsCostura: row[COLUMNS.OBS_COSTURA - 1],
    combinacoesCores: safeJsonParse(row[COLUMNS.COMBINACOES_CORES - 1]),
    qrCorteUrl: row[COLUMNS.QR_CORTE - 1],
    fluxoProducao: safeJsonParse(row[COLUMNS.QR_ANEXOS - 1]),
    qrAnexosUrl: row[COLUMNS.QR_ANEXOS - 1],
    qrFeedbackUrl: row[COLUMNS.QR_FEEDBACK - 1],
    statusAprovacao: row[COLUMNS.STATUS - 1],
    responsavelAprovacao: row[COLUMNS.RESPONSAVEL - 1],
    dataAprovacao: row[COLUMNS.DATA_APROVACAO - 1],
    coresTecido: (row.length >= 33 && row[COLUMNS.CORES_TECIDO - 1] !== undefined) ? row[COLUMNS.CORES_TECIDO - 1] : '',
    grade: (row.length >= 34 && row[COLUMNS.GRADE - 1] !== undefined) ? row[COLUMNS.GRADE - 1] : '',
    quantCorte: (row.length >= 35 && row[COLUMNS.QUANT_CORTE - 1] !== undefined) ? row[COLUMNS.QUANT_CORTE - 1] : '',
    enfesto: (row.length >= 36 && row[COLUMNS.ENFESTO - 1] !== undefined) ? row[COLUMNS.ENFESTO - 1] : '',
  };
}

// ═══════════════ FUNÇÕES AUXILIARES — FEEDBACKS ═══════════════

/**
 * Constrói array da linha para a aba Feedbacks
 */
function buildFeedbackRow(id, timestamp, fb) {
  const s = sanitize;
  return [
    id,
    timestamp,
    s(fb.fichaId || ''),
    s(fb.modelo || ''),
    s(fb.referencia || ''),
    s(fb.op || ''),
    s(fb.parceiro || 'Anônimo'),
    s(fb.setor || 'Geral'),
    s(fb.tipo || 'Observação'),
    s(fb.gravidade || 'Informativo'),
    s(fb.descricao || ''),
    fb.fotos || '',
    s(fb.status || 'novo'),
    s(fb.obsInterna || ''),
    s(fb.resolvidoEm || '')
  ];
}

/**
 * Converte uma linha da aba Feedbacks em objeto JSON
 */
function feedbackRowToObject(row) {
  return {
    id: row[FEEDBACK_COLUMNS.ID - 1],
    timestamp: row[FEEDBACK_COLUMNS.TIMESTAMP - 1],
    fichaId: row[FEEDBACK_COLUMNS.FICHA_ID - 1],
    modelo: row[FEEDBACK_COLUMNS.MODELO - 1],
    referencia: row[FEEDBACK_COLUMNS.REFERENCIA - 1],
    op: row[FEEDBACK_COLUMNS.OP - 1],
    parceiro: row[FEEDBACK_COLUMNS.PARCEIRO - 1],
    setor: row[FEEDBACK_COLUMNS.SETOR - 1],
    tipo: row[FEEDBACK_COLUMNS.TIPO - 1],
    gravidade: row[FEEDBACK_COLUMNS.GRAVIDADE - 1],
    descricao: row[FEEDBACK_COLUMNS.DESCRICAO - 1],
    fotos: safeJsonParse(row[FEEDBACK_COLUMNS.FOTOS - 1]),
    status: row[FEEDBACK_COLUMNS.STATUS - 1] || 'novo',
    obsInterna: row[FEEDBACK_COLUMNS.OBS_INTERNA - 1] || '',
    resolvidoEm: row[FEEDBACK_COLUMNS.RESOLVIDO_EM - 1] || ''
  };
}

/**
 * Parse JSON seguro
 */
function safeJsonParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || []);
  } catch (e) {
    return [];
  }
}

/**
 * Encontra o índice da linha pelo ID em uma coluna específica
 */
function findRowById(sheet, id, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  
  const ids = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

/**
 * Obtém ou cria uma aba da planilha
 */
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  
  if (!sheet) {
    sheet = ss.insertSheet(name);
    
    if (name === CONFIG.SHEET_FICHAS) {
      const headers = [
        'ID', 'Criado Em', 'Atualizado Em', 'Modelo', 'Referência', 'OP',
        'Modelista', 'Pilotista', 'Tecido', 'Composição', 'Cor Linha',
        'Corte', 'Bordado/Silk', 'Confecção', 'Lavanderia', 'Lacre Lavanderia',
        'Acabamento', 'Fase Final', 'Link Acesso', 'Título Medidas PMG',
        'Medidas PMG (JSON)', 'Título Medidas Num', 'Medidas Num (JSON)',
        'Obs Costura', 'Combinações Cores (JSON)', 'QR Corte URL',
        'QR Anexos URL', 'QR Feedback URL', 'Status', 'Responsável',
        'Data Aprovação', 'Ativo', 'Cores Tecido', 'Grade', 'Quant Corte', 'Enfesto'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    if (name === CONFIG.SHEET_FEEDBACKS) {
      const headers = [
        'ID', 'Data/Hora', 'ID Ficha', 'Modelo', 'Referência', 'OP',
        'Parceiro / Oficina', 'Setor / Etapa', 'Tipo Ocorrência',
        'Gravidade', 'Descrição', 'Fotos (JSON/URLs)', 'Status',
        'Obs Interna / Resolução', 'Resolvido Em'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    if (name === CONFIG.SHEET_LOGS) {
      const headers = ['Timestamp', 'Ação', 'ID Ficha', 'Detalhes'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  
  return sheet;
}

// ═══════════════ SEGURANÇA ═══════════════

/**
 * Valida o token de autenticação
 */
function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  
  const props = PropertiesService.getScriptProperties();
  const validToken = props.getProperty('API_TOKEN');
  
  if (!validToken) {
    Logger.log('AVISO: API_TOKEN não configurado nas Script Properties!');
    return false;
  }
  
  return token === validToken;
}

/**
 * Rate limiting por IP usando cache do script
 */
function rateLimitCheck() {
  const cache = CacheService.getScriptCache();
  const key = 'rate_limit_count';
  
  const current = parseInt(cache.get(key) || '0');
  
  if (current >= CONFIG.RATE_LIMIT_MAX) {
    return false;
  }
  
  cache.put(key, String(current + 1), 60); // Expira em 60 segundos
  return true;
}

/**
 * Sanitiza uma string removendo tags HTML
 */
function sanitize(value) {
  if (typeof value !== 'string') return String(value || '');
  return value.replace(/<[^>]*>/g, '').trim();
}

// ═══════════════ AUDITORIA ═══════════════

/**
 * Registra uma ação no log de auditoria
 */
function logAudit(action, fichaId, details) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEET_LOGS);
    sheet.appendRow([
      new Date().toISOString(),
      action,
      fichaId || '',
      details || ''
    ]);
  } catch (e) {
    Logger.log('Erro ao gravar log: ' + e.message);
  }
}

// ═══════════════ GOOGLE DRIVE — FOTOS SEPARADAS ═══════════════

/**
 * Processa fotos da FICHA TÉCNICA e salva na pasta exclusiva: LLAMENINA_Fotos_Fichas
 */
function processAndUploadPhotos_(ficha, fichaId) {
  if (!ficha.foto) return ficha;
  const uploaded = uploadBase64PhotosList_(ficha.foto, fichaId, CONFIG.DRIVE_FOLDER_NAME, 'foto');
  ficha.foto = JSON.stringify(uploaded);
  return ficha;
}

/**
 * Processa fotos de FEEDBACK e salva na pasta exclusiva: LLAMENINA_Fotos_Feedbacks
 */
function processAndUploadFeedbackPhotos_(feedback, feedbackId) {
  if (!feedback.fotos) return feedback;
  const uploaded = uploadBase64PhotosList_(feedback.fotos, feedbackId, CONFIG.DRIVE_FOLDER_FEEDBACKS_NAME, 'defeito');
  feedback.fotos = JSON.stringify(uploaded);
  return feedback;
}

/**
 * Faz upload de uma lista de fotos base64 para uma pasta específica do Google Drive
 */
function uploadBase64PhotosList_(photosRaw, idPrefix, folderName, fileTag) {
  let fotos = [];
  try {
    fotos = typeof photosRaw === 'string' ? JSON.parse(photosRaw) : photosRaw;
  } catch (e) {
    if (typeof photosRaw === 'string' && photosRaw.startsWith('data:')) {
      fotos = [photosRaw];
    } else {
      return [];
    }
  }

  if (!Array.isArray(fotos) || fotos.length === 0) return [];

  const folder = getOrCreateDriveFolder_(folderName);
  const uploadedUrls = [];

  fotos.forEach(function(fotoItem, index) {
    if (typeof fotoItem === 'string' && !fotoItem.startsWith('data:')) {
      uploadedUrls.push(fotoItem);
      return;
    }

    try {
      var matches = fotoItem.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!matches) {
        uploadedUrls.push(fotoItem);
        return;
      }

      var mimeType = matches[1];
      var base64Data = matches[2];
      var blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        mimeType,
        idPrefix + '_' + fileTag + '_' + (index + 1) + '.' + (mimeType === 'image/png' ? 'png' : 'jpg')
      );

      var fileName = blob.getName();
      var existingFiles = folder.getFilesByName(fileName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }

      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var fileId = file.getId();
      var directUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
      uploadedUrls.push(directUrl);
    } catch (err) {
      Logger.log('Erro ao salvar foto ' + (index + 1) + ' na pasta ' + folderName + ': ' + err.message);
      uploadedUrls.push(fotoItem);
    }
  });

  return uploadedUrls;
}

/**
 * Obtém ou cria uma pasta no Google Drive pelo nome
 */
function getOrCreateDriveFolder_(folderName) {
  var targetName = folderName || CONFIG.DRIVE_FOLDER_NAME;
  var folders = DriveApp.getFoldersByName(targetName);

  if (folders.hasNext()) {
    return folders.next();
  }

  var folder = DriveApp.createFolder(targetName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/**
 * EXECUTAR ESTA FUNÇÃO UMA VEZ NO EDITOR PARA AUTORIZAR AS PASTAS DO GOOGLE DRIVE:
 * 1. Selecione "autorizarPermissoesDrive" no menu suspenso acima.
 * 2. Clique em "Executar".
 * 3. Aceite as permissões na janela do Google.
 */
function autorizarPermissoesDrive() {
  const folderFichas = getOrCreateDriveFolder_(CONFIG.DRIVE_FOLDER_NAME);
  const folderFeedbacks = getOrCreateDriveFolder_(CONFIG.DRIVE_FOLDER_FEEDBACKS_NAME);
  Logger.log('Google Drive Autorizado! Pasta Fichas: ' + folderFichas.getName() + ' | Pasta Feedbacks: ' + folderFeedbacks.getName());
}

// ═══════════════ RESPOSTA ═══════════════

/**
 * Retorna resposta JSON formatada
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
