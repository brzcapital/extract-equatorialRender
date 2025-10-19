/**
 * index.mjs – Extração estruturada de faturas Equatorial Goiás
 * Atualizado em: 19/10/2025
 * Autor: BRZ Capital (com refinamento assistido)

/**
 * index.mjs – Extração completa e estruturada das faturas Equatorial Goiás
 * Atualizado em: 19/10/2025
 * Compatível com banco "faturaequatorial" do Bubble (todas as chaves obrigatórias)
 */
/**
 * index.mjs – API de extração Equatorial Goiás (Render)
 * Atualizado: 19/10/2025 (America/Fortaleza)
 * - Sobe servidor HTTP (Express)
 * - Endpoint /extract (POST multipart/form-data, campo: file)
 * - Retorna todas as chaves sempre (null quando ausentes)
 */

/**
 * index.mjs – API de extração das faturas Equatorial Goiás
 * Atualizado: 19/10/2025
 * Estável e funcional para Node 20.x no Render
 */

import express from "express";
import multer from "multer";
import dayjs from "dayjs";

/**
 * Função principal de extração
 * @param {Buffer} pdfBuffer
 * @returns {Object} JSON com 60 chaves fixas (null para campos ausentes)
 */
async function extrairFatura(pdfBuffer) {
  // 🩹 Importa pdf-parse dinamicamente (evita bug ENOENT)
  const { default: pdfParse } = await import("pdf-parse");
  const parsed = await pdfParse(pdfBuffer);
  const text = parsed.text.replace(/\s+/g, " ").trim();

  const num = (s) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : null);
  const safe = (v) => (v !== undefined ? v : null);

  // ---------------------------
  // 🔹 EXTRAÇÃO DE DADOS CHAVE
  // ---------------------------

  // Datas de leitura (sequência tripla)
  const datasLeit = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map((m) => m[0]);
  const data_leitura_anterior = datasLeit[0] || null;
  const data_leitura_atual = datasLeit[1] || null;
  const data_proxima_leitura = datasLeit[2] || null;

  // Data de apresentação (após ANEEL ... 3407/24)
  let apresentacao = null;
  const mApres = text.match(/ANEEL[^\d]*(\d{2}\/\d{2}\/\d{4})\s+\d{4}\/\d{2}/i);
  if (mApres) apresentacao = mApres[1];

  // Leituras (ENERGIA ATIVA - KWH)
  let leitura_anterior = null;
  let leitura_atual = null;
  const mLeit = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+\d+\s+(\d+)/i);
  if (mLeit) {
    leitura_anterior = parseInt(mLeit[1]);
    leitura_atual = parseInt(mLeit[2]);
  }

  // Injeções SCEE
  const injecoes_scee = [];
  for (const m of text.matchAll(
    /INJEÇÃO\s+SCEE\s*-\s*UC\s+(\d+).*?kWh\s+([\d.,]+)\s+([\d.,]+)[^-\d,]+(-?\d+,\d+)/g
  )) {
    const uc = m[1].trim();
    const preco = num(m[2]);
    const quant = num(m[3]);
    const totalImpresso = Math.abs(num(m[4]));
    injecoes_scee.push({
      uc,
      preco_unit_com_tributos: safe(preco),
      quant_kwh: safe(quant),
      tarifa_unitaria: safe(totalImpresso),
    });

    // Validação interna (não altera retorno)
    const calculado = +((quant ?? 0) * (preco ?? 0)).toFixed(2);
    if (totalImpresso != null && Math.abs(calculado - totalImpresso) > 1) {
      console.warn(`⚠️ Divergência UC ${uc}: calculado=${calculado} vs impresso=${totalImpresso}`);
    }
  }

  // Consumo SCEE
  const mConsTar = text.match(/CONSUMO\s+SCEE\s+kWh\s+([\d.,]+)/i);
  const consumo_scee_tarifa_unitaria = mConsTar ? num(mConsTar[1]) : null;

  const mConsQtdLine = text.match(/CONSUMO\s+SCEE\s+kWh\s+[\d.,]+\s+([\d.,]+)/i);
  const consumo_scee_quant = mConsQtdLine ? num(mConsQtdLine[1]) : null;
  const consumo_scee_preco_unit_com_tributos = mConsTar ? num(mConsTar[1]) : null;

  // Média (histórico com “,00”)
  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map((m) => num(m[1] + ",00"
