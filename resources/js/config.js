/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — Configuration Module
   Gerenciamento seguro de endpoint e token
   ═══════════════════════════════════════════════════════════════ */

const Config = (() => {
  'use strict';

  // Chaves para sessionStorage (mais seguro que localStorage para tokens)
  const STORAGE_KEYS = {
    ENDPOINT: 'llamenina_endpoint_url',
    TOKEN: 'llamenina_api_token_session',
    PUBLIC_URL: 'llamenina_public_url',
    DRAFT: 'llamenina_ficha_draft'
  };

  // Configurações padrão embutidas para distribuição (.exe)
  const DEFAULT_CONFIG = {
    ENDPOINT: 'https://script.google.com/macros/s/AKfycbxzWXmKvVZ7ha-0bfjNLGdLu6XC96m9PpXGEO_U__e-7NhdupZ948qrWNog7H2Z2TdH/exec',
    TOKEN: 'Llamenina2026SafeTokenFichas!',
    PUBLIC_URL: 'https://llamenina-st.github.io/llamenina-fichas/resources/fotos.html'
  };

  // Valores em memória (nunca persistidos em localStorage)
  let _apiToken = '';
  let _endpointUrl = '';
  let _publicUrl = '';

  /**
   * Inicializa configurações a partir do sessionStorage
   */
  function init() {
    try {
      _endpointUrl = localStorage.getItem(STORAGE_KEYS.ENDPOINT) || DEFAULT_CONFIG.ENDPOINT || '';
      _apiToken = localStorage.getItem(STORAGE_KEYS.TOKEN) || DEFAULT_CONFIG.TOKEN || '';
      _publicUrl = localStorage.getItem(STORAGE_KEYS.PUBLIC_URL) || DEFAULT_CONFIG.PUBLIC_URL || '';
      if (_publicUrl.includes('127.0.0.1') || _publicUrl.includes('localhost') || _publicUrl.startsWith('file:')) {
        _publicUrl = DEFAULT_CONFIG.PUBLIC_URL;
      }
    } catch (e) {
      console.warn('[Config] Não foi possível acessar localStorage:', e.message);
      _endpointUrl = DEFAULT_CONFIG.ENDPOINT || '';
      _apiToken = DEFAULT_CONFIG.TOKEN || '';
      _publicUrl = DEFAULT_CONFIG.PUBLIC_URL || '';
    }
  }

  /**
   * Define o endpoint URL do Google Apps Script
   * @param {string} url
   */
  function setEndpoint(url) {
    if (!url || !Security.validateURL(url)) {
      throw new Error('URL do endpoint inválida. Use uma URL HTTPS válida.');
    }
    _endpointUrl = url.trim();
    try {
      localStorage.setItem(STORAGE_KEYS.ENDPOINT, _endpointUrl);
    } catch (e) {
      console.warn('[Config] Falha ao salvar endpoint:', e.message);
    }
  }

  /**
   * Retorna o endpoint URL configurado
   * @returns {string}
   */
  function getEndpoint() {
    return _endpointUrl;
  }

  /**
   * Define o token de API
   * @param {string} token
   */
  function setToken(token) {
    if (!token || typeof token !== 'string' || token.trim().length < 8) {
      throw new Error('Token inválido. Deve ter pelo menos 8 caracteres.');
    }
    _apiToken = token.trim();
    try {
      localStorage.setItem(STORAGE_KEYS.TOKEN, _apiToken);
    } catch (e) {
      console.warn('[Config] Falha ao salvar token:', e.message);
    }
  }

  /**
   * Retorna o token de API
   * @returns {string}
   */
  function getToken() {
    return _apiToken;
  }

  /**
   * Define a URL pública de consulta para os QR Codes
   * @param {string} url
   */
  function setPublicUrl(url) {
    let cleanUrl = (url || '').trim();
    if (cleanUrl.includes('127.0.0.1') || cleanUrl.includes('localhost') || cleanUrl.startsWith('file:')) {
      cleanUrl = DEFAULT_CONFIG.PUBLIC_URL;
    }
    _publicUrl = cleanUrl;
    try {
      localStorage.setItem(STORAGE_KEYS.PUBLIC_URL, _publicUrl);
    } catch (e) {
      console.warn('[Config] Falha ao salvar URL pública:', e.message);
    }
  }

  /**
   * Retorna a URL pública de consulta configurada
   * @returns {string}
   */
  function getPublicUrl() {
    if (_publicUrl && _publicUrl.trim() !== '' && !_publicUrl.includes('127.0.0.1') && !_publicUrl.includes('localhost') && !_publicUrl.startsWith('file:')) {
      return _publicUrl;
    }
    return DEFAULT_CONFIG.PUBLIC_URL;
  }

  /**
   * Retorna a URL pública base de feedback
   * @returns {string}
   */
  function getPublicFeedbackUrl() {
    let baseUrl = getPublicUrl();
    if (baseUrl.endsWith('fotos.html')) {
      return baseUrl.replace(/fotos\.html$/, 'feedback.html');
    }
    if (baseUrl.endsWith('index.html')) {
      return baseUrl.replace(/index\.html$/, 'feedback.html');
    }
    return baseUrl.replace(/\/$/, '') + '/feedback.html';
  }

  /**
   * Verifica se a configuração está completa
   * @returns {boolean}
   */
  function isConfigured() {
    return _endpointUrl.length > 0 && _apiToken.length > 0;
  }

  /**
   * Limpa todas as configurações
   */
  function clear() {
    _apiToken = '';
    _endpointUrl = '';
    _publicUrl = '';
    try {
      localStorage.removeItem(STORAGE_KEYS.ENDPOINT);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.PUBLIC_URL);
    } catch (e) {
      console.warn('[Config] Falha ao limpar configurações:', e.message);
    }
  }

  /**
   * Salva rascunho da ficha no sessionStorage
   * @param {Object} data
   */
  function saveDraft(data) {
    try {
      const json = JSON.stringify(data);
      sessionStorage.setItem(STORAGE_KEYS.DRAFT, json);
    } catch (e) {
      console.warn('[Config] Falha ao salvar rascunho:', e.message);
    }
  }

  /**
   * Carrega rascunho salvo
   * @returns {Object|null}
   */
  function loadDraft() {
    try {
      const json = sessionStorage.getItem(STORAGE_KEYS.DRAFT);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      console.warn('[Config] Falha ao carregar rascunho:', e.message);
      return null;
    }
  }

  /**
   * Remove rascunho salvo
   */
  function clearDraft() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.DRAFT);
    } catch (e) {
      console.warn('[Config] Falha ao limpar rascunho:', e.message);
    }
  }

  return {
    init,
    setEndpoint,
    getEndpoint,
    setToken,
    getToken,
    setPublicUrl,
    getPublicUrl,
    getPublicFeedbackUrl,
    isConfigured,
    clear,
    saveDraft,
    loadDraft,
    clearDraft
  };
})();
