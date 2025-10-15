import express from "express";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json({ limit: "50mb" }));

const toISO = (s) => {
  const m = s?.match?.(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (!m) return null;
  const [ , dd, mm, yyyy ] = m;
  return `${yyyy}-${mm}-${dd}`;
};
const toNum = (s) => {
  if (!s) return null;
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
  const sec = findSection(text, /DATA\s+DAS\s+LEITURAS|LEITURAS/i, /CONSUMO|INFORM|^$/im);
  if (!sec) return null;
  const ds = [...sec.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
  return ds[2] ? toISO(ds[2]) : null;
};
const getApresentacao = (text) => {
  const tail = text.split(/\r?\n/).slice(-25).join("\n");
  const m = tail.match(/Apresenta(ç|c)ão[^\d]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  return m ? toISO(m[2]) : null;
};
const getMedia = (text) => {
  const sec = findSection(text, /CONSUMO\s*KWh/i, /INJE(Ç|C)ÃO|INFORMA|^$/im);
  const lm = sec?.match(/M(É|E)DIA[^\d]*([\d\.\,]+)/i);
  return lm ? toNum(lm[2]) : null;
};
const getCicloGeracao = (text) => {
  const m = text.match(/GERA(Ç|C)ÃO\s+DO\s+CICLO\s*\(([^)]+)\)/i);
  return m ? m[2].trim() : null;
};
const getUcGeradoraEProducaoEExcedente = (text) => {
  const sec = findSection(text, /INFORMA(Ç|C)ÕES\s+DO\s+SCEE/i, /INJE(Ç|C)ÃO|^$/im);
  if (!sec) return { uc: null, prod: null, exc: null };
  const uc = onlyDigits((sec.match(/\bUC[^\d]*(\d{6,})/)||[])[1]);
  const prod = toNum((sec.match(/:\s*([\d\.\,]+)\s*kWh/i)||[])[1]);
  const m = sec.match(/\bEXCEDENTE[^\d]+([\d\.\,]+)/i);
  const exc = m ? toNum(m[1]) : null;
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

app.post("/extract", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Missing pdf_url" });

    const response = await fetch(pdf_url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdfParse(buffer);
    const text = data.text.split(/\f/)[0];

    const result = {
      unidade_consumidora: null,
      total_a_pagar: null,
      data_vencimento: null,
      data_leitura_anterior: null,
      data_leitura_atual: null,
      data_proxima_leitura: getProximaLeitura(text),
      data_emissao: null,
      apresentacao: getApresentacao(text),
      mes_ano_referencia: null,
      leitura_anterior: null,
      leitura_atual: null,
      beneficio_tarifario_bruto: null,
      beneficio_tarifario_liquido: null,
      icms: null, pis_pasep: null, cofins: null,
      fatura_debito_automatico: null,
      credito_recebido: null,
      saldo_kwh: null,
      excedente_recebido: getUcGeradoraEProducaoEExcedente(text).exc,
      ciclo_geracao: getCicloGeracao(text),
      informacoes_para_o_cliente: getInfoCliente(text),
      uc_geradora: getUcGeradoraEProducaoEExcedente(text).uc,
      uc_geradora_producao: getUcGeradoraEProducaoEExcedente(text).prod,
      cadastro_rateio_geracao_uc: null,
      cadastro_rateio_geracao_percentual: null,
      injecoes_scee: getInjecoes(text),
      consumo_scee_quant: null,
      consumo_scee_preco_unit_com_tributos: null,
      consumo_scee_tarifa_unitaria: null,
      media: getMedia(text),
      parc_injet_s_desc_percentual: null,
      observacoes: ""
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
