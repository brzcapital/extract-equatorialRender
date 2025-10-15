// ======== DEPENDÊNCIAS PRINCIPAIS ========
import express from "express";
import fetch from "node-fetch";

// Importação segura do pdf-parse (evita bug no Render)
import pkg from "pdf-parse/lib/pdf-parse.js";
const pdfParse = pkg.default || pkg;

// ======== CONFIGURAÇÃO DO SERVIDOR ========
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ======== ENDPOINT PRINCIPAL ========
// Recebe uma URL de PDF e retorna o texto da 1ª página
app.post("/extract", async (req, res) => {
  try {
    const { pdf_url } = req.body;

    if (!pdf_url) {
      return res.status(400).json({ error: "Missing parameter: pdf_url" });
    }

    console.log(`🔹 Baixando PDF de: ${pdf_url}`);

    // Faz o download do PDF
    const response = await fetch(pdf_url);
    if (!response.ok) {
      return res.status(400).json({ error: `Erro ao baixar PDF: ${response.statusText}` });
    }

    const pdfBuffer = await response.arrayBuffer();

    // Extrai texto do PDF
    const data = await pdfParse(Buffer.from(pdfBuffer));

    // Extrai apenas a primeira página
    const primeiraPagina = data.text.split(/\f/)[0]; // \f = quebra de página

    console.log("✅ Extração concluída com sucesso.");

    // Retorna texto limpo da primeira página
    return res.json({
      status: "ok",
      pdf_url,
      primeira_pagina_texto: primeiraPagina.trim().slice(0, 15000) // limite de segurança
    });
  } catch (error) {
    console.error("❌ Erro ao processar PDF:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ======== ENDPOINT DE TESTE ========
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo! Use POST /extract com { pdf_url }");
});

// ===================== EXTRACT ESTRUTURADO (1ª página) =====================
// Funções auxiliares e regras determinísticas (mesmas bases do que combinamos)
const toISO = (s) => {
  const m = s?.match?.(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (!m) return null;
  const [ , dd, mm, yyyy ] = m;
  return `${yyyy}-${mm}-${dd}`;
};
const toNum = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d\.\-]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const onlyDigits = (s) => (s ? (s.match(/\d+/g)||[]).join("") : null);

const findSection = (text, titleRegex, nextHeaderRegex) => {
  const start = text.search(titleRegex);
  if (start === -1) return null;
  const next = nextHeaderRegex ? text.slice(start+1).search(nextHeaderRegex) : -1;
  return next === -1 ? text.slice(start) : text.slice(start, start+1+next);
};

const getProximaLeitura = (text) => {
  const sec = findSection(text, /DATA\s+DAS\s+LEITURAS|LEITURAS/i, /CONSUMO|INFORMA|FATURA|^$/im);
  if (!sec) return null;
  const ds = [...sec.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
  return ds[2] ? toISO(ds[2]) : null; // 3ª data = Próxima
};
const getApresentacao = (text) => {
  const tail = text.split(/\r?\n/).slice(-25).join("\n");
  const m = tail.match(/Apresenta(ç|c)ão(?:\s+da\s+Fatura)?[^\d]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  return m ? toISO(m[2]) : null;
};
const getMedia = (text) => {
  const sec = findSection(text, /CONSUMO\s*KWh/i, /INJE(Ç|C)ÃO|INFORMA|^$/im);
  const lm = sec?.match(/M(É|E)DIA[^\d]*([\d\.\,]+)/i);
  return lm ? toNum(lm[2]) : null;
};
const getCicloGeracao = (text) => {
  const m = text.match(/INFORMA(Ç|C)ÕES\s+DO\s+SCEE:\s*GERA(Ç|C)ÃO\s+DO\s+CICLO\s*\(([^)]+)\)/i);
  return m ? m[3].trim() : null;
};
const getUcGeradoraEProducaoEExcedente = (text) => {
  const sec = findSection(text, /INFORMA(Ç|C)ÕES\s+DO\s+SCEE/i, /INJE(Ç|C)ÃO|^$/im);
  if (!sec) return { uc: null, prod: null, exc: null };
  const uc = onlyDigits((sec.match(/\bUC[^\d]*(\d{6,})/)||[])[1]) ||
             onlyDigits((sec.match(/(\d{8,12})[^\d]*:/)||[])[1]);
  const prod = toNum((sec.match(/:\s*([\d\.\,]+)\s*kWh/i)||[])[1]);
  // EXCEDENTE logo após a UC (quando existe explícito)
  const mexc = sec.match(/\bEXCEDENTE[^\d]+([\d\.\,]+)/i);
  const exc = mexc ? toNum(mexc[1]) : null;
  return { uc, prod, exc };
};
const getInfoCliente = (text) => {
  const sec = findSection(text, /INFORMA(Ç|C)ÕES\s+PARA\s+O\s+CLIENTE/i, /INJE(Ç|C)ÃO|^$/im);
  return sec?.replace(/.*INFORMA(Ç|C)ÕES\s+PARA\s+O\s+CLIENTE[^\n]*\n/i, "").trim() || null;
};
const getInjecoes = (text) => {
  const sec = findSection(text, /INJE(Ç|C)ÃO\s+SCEE/i, /INFORMA|CONSUMO|^$/im);
  if (!sec) return [];
  const lines = sec.split(/\r?\n/).filter(l => /\d{5,}/.test(l));
  const items = [];
  for (const l of lines) {
    const uc = onlyDigits((l.match(/(\d{5,15})/)||[])[1]);
    const nums = (l.match(/[\d\.\,]+/g)||[]).map(toNum).filter(v => v!=null);
    if (!uc || nums.length < 2) continue;
    const quant = nums.find(n => n > 2) ?? null;
    const units = nums.filter(n => n > 0 && n <= 2);
    const [pun, tus] = units.slice(-2);
    items.push({
      uc, quant_kwh: quant,
      preco_unit_com_tributos: pun, tarifa_unitaria: tus
    });
  }
  return items;
};

app.post("/extract-structured", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Missing pdf_url" });

    const r = await fetch(pdf_url);
    if (!r.ok) return res.status(400).json({ error: `Erro ao baixar PDF: ${r.statusText}` });
    const buf = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buf);
    const text = (data.text || "").split(/\f/)[0];

    // Coletas determinísticas
    const prox = getProximaLeitura(text);
    const apr = getApresentacao(text);
    const med = getMedia(text);
    const ciclo = getCicloGeracao(text);
    const info = getInfoCliente(text);
    const { uc, prod, exc } = getUcGeradoraEProducaoEExcedente(text);
    const inj = getInjecoes(text);

    // Monta JSON com TODOS os campos esperados (null se não achar)
    const result = {
      unidade_consumidora: null,
      total_a_pagar: null,
      data_vencimento: null,
      data_leitura_anterior: null,
      data_leitura_atual: null,
      data_proxima_leitura: prox,
      data_emissao: null,
      apresentacao: apr,
      mes_ano_referencia: null,
      leitura_anterior: null,
      leitura_atual: null,
      beneficio_tarifario_bruto: null,
      beneficio_tarifario_liquido: null, // negocio: sempre negativo — aplique no Bubble se preferir
      icms: null,
      pis_pasep: null,
      cofins: null,
      fatura_debito_automatico: null, // yes/no se quiser implementar
      credito_recebido: null,
      saldo_kwh: null,
      excedente_recebido: exc,
      ciclo_geracao: ciclo,
      informacoes_para_o_cliente: info,
      uc_geradora: uc,
      uc_geradora_producao: prod,
      cadastro_rateio_geracao_uc: null,
      cadastro_rateio_geracao_percentual: null,
      injecoes_scee: inj,
      consumo_scee_quant: null,
      consumo_scee_preco_unit_com_tributos: null,
      consumo_scee_tarifa_unitaria: null,
      media: med,
      parc_injet_s_desc_percentual: null,
      observacoes: ""
    };

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});



// ======== INICIA O SERVIDOR ========
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

