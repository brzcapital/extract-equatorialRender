/**
 * index.mjs – Extração estruturada de faturas Equatorial Goiás
 * Atualizado em: 19/10/2025
 * Autor: BRZ Capital (com refinamento assistido)
 */

import fs from "fs";
import pdfParse from "pdf-parse";
import dayjs from "dayjs";

/**
 * Função principal de extração
 * @param {Buffer} pdfBuffer - conteúdo do PDF
 * @returns {Object} objeto JSON estruturado conforme modelo "faturaequatorial"
 */
export async function extrairFatura(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  const text = data.text.replace(/\s+/g, " ").trim();

  // ---------- BLOCOS DE EXTRAÇÃO ----------

  // 🗓️ Datas de leitura (anterior, atual, próxima)
  const datasLeit = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map(m => m[0]);
  const data_leitura_anterior = datasLeit[0] || null;
  const data_leitura_atual = datasLeit[1] || null;
  const data_proxima_leitura = datasLeit[2] || null;

  // 📅 Data de apresentação (após ANEEL 3407/24)
  let apresentacao = null;
  const matchApres = text.match(/ANEEL[^\d]*(\d{2}\/\d{2}\/\d{4})\s+\d{4}\/\d{2}/i);
  if (matchApres) apresentacao = matchApres[1];

  // 🔢 Leitura anterior e atual (ENERGIA ATIVA)
  let leitura_anterior = null;
  let leitura_atual = null;
  const matchLeituras = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+\d+\s+(\d+)/i);
  if (matchLeituras) {
    leitura_anterior = parseInt(matchLeituras[1]);
    leitura_atual = parseInt(matchLeituras[2]);
  }

  // ⚡ Injeções SCEE (valores conforme fatura)
  const injecoes = [];
  for (const m of text.matchAll(/INJEÇÃO\s+SCEE\s*-\s*UC\s+(\d+).*?kWh\s+([\d,]+)\s+([\d,]+)[^-\d,]+(-?\d+,\d+)/g)) {
    const [ , uc, preco, quant, valorTotal ] = m;
    const inj = {
      uc: uc.trim(),
      preco_unit_com_tributos: parseFloat(preco.replace(',', '.')),
      quant_kwh: parseFloat(quant.replace(',', '.')),
      tarifa_unitaria: Math.abs(parseFloat(valorTotal.replace(',', '.'))), // ignora sinal negativo
    };
    injecoes.push(inj);

    // 🔎 Validação (não altera o resultado)
    const calculado = parseFloat((inj.quant_kwh * inj.preco_unit_com_tributos).toFixed(2));
    if (Math.abs(calculado - inj.tarifa_unitaria) > 1) {
      console.warn(`⚠️ Divergência detectada em UC ${inj.uc}: calculado=${calculado} vs fatura=${inj.tarifa_unitaria}`);
    }
  }

  // 💡 Consumo SCEE tarifa unitária
  const matchTarifa = text.match(/CONSUMO\s+SCEE\s+kWh\s+([\d,]+)/i);
  const consumo_scee_tarifa_unitaria = matchTarifa
    ? parseFloat(matchTarifa[1].replace(',', '.'))
    : null;

  // 📊 Média de consumo (histórico)
  const consumos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map(m => parseFloat(m[1].replace(',', '.')));
  const media = consumos.length ? parseFloat((consumos.reduce((a, b) => a + b) / consumos.length).toFixed(2)) : null;

  // 🧾 Outras extrações simples (amostra)
  const matchUC = text.match(/\b(\d{8,11})\b(?=.*EQUATORIAL)/);
  const unidade_consumidora = matchUC ? matchUC[1] : null;

  const matchVenc = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b(?=.*R\$)/);
  const data_vencimento = matchVenc ? matchVenc[1] : null;

  const matchTotal = text.match(/R\$[*]*\s*([\d,.]+)/);
  const total_a_pagar = matchTotal ? parseFloat(matchTotal[1].replace(',', '.')) : null;

  const matchEmissao = text.match(/DATA\s+DE\s+EMISSÃO:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = matchEmissao ? matchEmissao[1] : null;

  // ---------- OBJETO FINAL ----------
  const resultado = {
    unidade_consumidora,
    total_a_pagar,
    data_vencimento,
    data_leitura_anterior,
    data_leitura_atual,
    data_proxima_leitura,
    data_emissao,
    apresentacao,
    leitura_anterior,
    leitura_atual,
    injecoes_scee: injecoes,
    consumo_scee_tarifa_unitaria,
    media,
  };

  return resultado;
}

// ---------- EXECUÇÃO LOCAL (teste manual) ----------
if (process.argv[2]) {
  const path = process.argv[2];
  const buffer = fs.readFileSync(path);
  extrairFatura(buffer).then(r => {
    console.log(JSON.stringify(r, null, 2));
  });
}

