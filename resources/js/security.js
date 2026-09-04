/* ═══════════════════════════════════════════════════════════════
   LLAMENINA — Fichas Técnicas — Security Module
   Sanitização, validação, rate limiting
   ═══════════════════════════════════════════════════════════════ */

const Security = (() => {
  'use strict';

  // ── HTML Entity Map ──
  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;'
  };

  const ENTITY_REGEX = /[&<>"'`/]/g;

  /**
   * Escapa caracteres HTML perigosos para prevenir XSS
   * @param {string} str - String a ser sanitizada
   * @returns {string} String sanitizada
   */
  function sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(ENTITY_REGEX, (char) => HTML_ENTITIES[char] || char);
  }

  /**
   * Remove tags HTML de uma string (para dados que serão enviados ao backend)
   * @param {string} str - String com possível HTML
   * @returns {string} String limpa
   */
  function stripHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Sanitiza recursivamente todos os campos string de um objeto
   * @param {Object} obj - Objeto a ser sanitizado
   * @returns {Object} Objeto sanitizado (cópia profunda)
   */
  function sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return stripHTML(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitiza a chave também para prevenir prototype pollution
        const safeKey = stripHTML(String(key));
        if (safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') {
          continue; // Bloqueia prototype pollution
        }
        sanitized[safeKey] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }

  /**
   * Valida uma URL
   * @param {string} url - URL a ser validada
   * @returns {boolean} Se a URL é válida e segura
   */
  function validateURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      // Só permite HTTPS, HTTP e FILE (para uso local/desenvolvimento)
      return ['https:', 'http:', 'file:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Valida o schema de uma ficha técnica
   * @param {Object} data - Dados da ficha
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateFichaSchema(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Dados inválidos'] };
    }

    // Campos obrigatórios
    const required = ['modelo', 'referencia'];
    for (const field of required) {
      if (!data[field] || String(data[field]).trim() === '') {
        errors.push(`Campo obrigatório: ${field}`);
      }
    }

    // Validação de comprimento máximo
    const maxLengths = {
      modelo: 100,
      referencia: 50,
      op: 50,
      modelista: 100,
      pilotista: 100,
      tecido: 200,
      coresTecido: 300,
      composicao: 200,
      corLinha: 200,
      grade: 100,
      quantCorte: 100,
      enfesto: 100,
      corte: 200,
      bordadoSilk: 200,
      confeccao: 200,
      lavanderia: 200,
      lacreLavanderia: 100,
      acabamento: 200,
      faseFinal: 200,
      obsCostura: 1000,
      responsavelAprovacao: 100
    };

    for (const [field, maxLen] of Object.entries(maxLengths)) {
      if (data[field] && String(data[field]).length > maxLen) {
        errors.push(`${field}: máximo ${maxLen} caracteres`);
      }
    }

    // Validação de URLs
    const urlFields = ['qrCorteUrl'];
    for (const field of urlFields) {
      if (data[field] && data[field].trim() !== '' && !validateURL(data[field])) {
        errors.push(`${field}: URL inválida`);
      }
    }

    // Validação das tabelas de medidas
    if (data.medidasPMG && !Array.isArray(data.medidasPMG)) {
      errors.push('medidasPMG deve ser um array');
    }

    if (data.medidasNumeracao && !Array.isArray(data.medidasNumeracao)) {
      errors.push('medidasNumeracao deve ser um array');
    }

    // Validação das combinações de cores
    if (data.combinacoesCores && !Array.isArray(data.combinacoesCores)) {
      errors.push('combinacoesCores deve ser um array');
    }

    // Status deve ser um dos valores permitidos
    if (data.statusAprovacao && !['aprovada', 'reprovada', 'pendente', ''].includes(data.statusAprovacao)) {
      errors.push('statusAprovacao: valor inválido');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Rate limiter simples para o frontend
   * Previne flood de requisições ao endpoint
   */
  class RateLimiter {
    constructor(maxRequests = 10, windowMs = 60000) {
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
      this.requests = [];
    }

    /**
     * Verifica se a requisição pode ser feita
     * @returns {boolean}
     */
    canMakeRequest() {
      const now = Date.now();
      // Remove requisições fora da janela de tempo
      this.requests = this.requests.filter(time => now - time < this.windowMs);

      if (this.requests.length >= this.maxRequests) {
        return false;
      }

      this.requests.push(now);
      return true;
    }

    /**
     * Tempo restante até poder fazer nova requisição (ms)
     * @returns {number}
     */
    getRetryAfter() {
      if (this.requests.length === 0) return 0;
      const oldest = this.requests[0];
      return Math.max(0, this.windowMs - (Date.now() - oldest));
    }

    /** Reset do limiter */
    reset() {
      this.requests = [];
    }
  }

  /**
   * Gera um ID único (UUID v4 simples)
   * @returns {string}
   */
  function generateId() {
    if (typeof crypto !== 'undefined') {
      if (crypto.randomUUID) {
        return crypto.randomUUID();
      }
      try {
        const arr = new Uint8Array(1);
        crypto.getRandomValues(arr);
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c === 'x' ? 0 : 3);
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      } catch (e) {
        // fall through to Math.random
      }
    }
    // Math.random Fallback (totalmente seguro, roda em qualquer lugar)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Debounce para evitar chamadas excessivas
   * @param {Function} fn - Função a ser debounced
   * @param {number} delay - Delay em ms
   * @returns {Function}
   */
  function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Valida tamanho máximo de payload (em bytes)
   * @param {Object} data - Dados a verificar
   * @param {number} maxBytes - Tamanho máximo (default 50KB)
   * @returns {boolean}
   */
  function validatePayloadSize(data, maxBytes = 153600) {
    const jsonStr = JSON.stringify(data);
    const size = new Blob([jsonStr]).size;
    return size <= maxBytes;
  }

  // ── API Pública ──
  return {
    sanitizeHTML,
    stripHTML,
    sanitizeObject,
    validateURL,
    validateFichaSchema,
    RateLimiter,
    generateId,
    debounce,
    validatePayloadSize
  };
})();
