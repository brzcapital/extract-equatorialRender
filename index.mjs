// ===============================
// 🔹 Importações básicas
// ===============================
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

// ===============================
// 🔹 Inicialização do servidor
// ===============================
const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ===============================
// 🔹 Funções auxiliares
// ===============================
function toISO(s) {
  const m = s?.match?.(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function toNum(s) {
  if (!s) return null;
  const n = Number(
    s.replace(/\./g, "").replace(",", ".").replace(/[^\d\.\-]/g, "")
  );
  return Number.isFinite(n) ? n : null;
}

function onlyDigits(s) {
  return s ? (s.match(/\d+/g) || []).join("") : null;
}

function findSection(text, titleRegex, nextRegex) {
  const start = text.search(titleRegex);
  if (start === -1) return null;
  const slice = text.slice(start);
  const next = nextRegex ? slice.search(nextRegex) : -1;
  return next === -1 ? slice : slice.slice(0, next);
}

// ===============================
// 🔹 Rota principal de teste
// ===============================
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo! Use POST /extract-structured com { pdf_url }");
});

// ===============================
// 🔹 Rota principal de extração
// ===============================
app.post("/extract-structured", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) {
      return res.status(400).json({ error: "Faltando parâmetro: pdf_url" });
    }

    // 1️⃣ Baixar PDF
    const response = await fetch(pdf_url);
    if (!response.ok) {
      return res.status(400).json({ error: "Erro ao baixar PDF" });
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // 2️⃣ Ler conteúdo textual
    const data = await pdfParse(buffer);
    const text = (data.text || "").replace(/\r/g, "");

    // 3️⃣ Extrações principais
    const datas = text.match(
      /(\d{2}\/\d{2}\/\d{4}).*(\d{2}\/\d{2}\/\d{4}).*(\d{2}\/\d{2}\/\d{4})/s
    );
    const data_proxima_leitura = datas ? toISO(datas[3]) : null;

    const apresentacaoMatch = text.match(
      /Apresenta(ç|c)ão[^\d]*(\d{2}\/\d{2}\/\d{4})/i
    );
    const apresentacao = apresentacaoMatch ? toISO(apresentacaoMatch[2]) : null;

    const cicloMatch = text.match(/GERA(Ç|C)ÃO\s+DO\s+CICLO\s*\(([^)]+)\)/i);
    const ciclo_geracao = cicloMatch ? cicloMatch[2].trim() : null;

    const infoSec = findSection(
      text,
      /INFORMA(Ç|C)ÕES\s+PARA\s+O\s+CLIENTE/i,
      /INJE(Ç|C)ÃO|^$/im
    );
    const informacoes_para_o_cliente = infoSec
      ? infoSec
          .replace(
            /.*INFORMA(Ç|C)ÕES\s+PARA\s+O\s+CLIENTE[^\n]*\n/i,
            ""
          )
          .trim()
      : null;

    const ucBlock = findSection(
      text,
      /INFORMA(Ç|C)ÕES\s+DO\s+SCEE/i,
      /INJE(Ç|C)ÃO|^$/im
    );
    const uc_geradora = onlyDigits(
      (ucBlock?.match(/\bUC[^\d]*(\d{6,})/) || [])[1]
    );
    const uc_geradora_producao = toNum(
      (ucBlock?.match(/:\s*([\d\.\,]+)\s*kWh/i) || [])[1]
    );
    const excedente_recebido = toNum(
      (ucBlock?.match(/EXCEDENTE[^\d]+([\d\.\,]+)/i) || [])[1]
    );

    // Média e outros campos derivados
    const mediaMatch = text.match(/M[ÉE]DIA[^\d]+([\d\.\,]+)/i);
    const media = toNum(mediaMatch?.[1]);

    // 4️⃣ Retorno padronizado
    const resultado = {
      unidade_consumidora: onlyDigits(
        (text.match(/UNIDADE\s+CONSUMIDORA[^\d]*(\d{5,})/i) || [])[1]
      ),
      total_a_pagar: toNum(
        (text.match(/TOTAL\s+A\s+PAGAR[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      data_vencimento: toISO(
        (text.match(/VENCIMENTO[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]
      ),
      data_leitura_anterior: toISO(
        (text.match(/LEITURA\s+ANTERIOR[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]
      ),
      data_leitura_atual: toISO(
        (text.match(/LEITURA\s+ATUAL[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]
      ),
      data_proxima_leitura,
      data_emissao: toISO(
        (text.match(/EMISS[ÃA]O[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]
      ),
      apresentacao,
      mes_ano_referencia:
        (text.match(/REFERENTE\s+A[^\d]*(\w{3}\/\d{4})/i) || [])[1] || null,
      leitura_anterior: toNum(
        (text.match(/LEITURA\s+ANTERIOR[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      leitura_atual: toNum(
        (text.match(/LEITURA\s+ATUAL[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      beneficio_tarifario_bruto: toNum(
        (text.match(/BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+BRUTO[^\d]+([\d\.\,]+)/i) ||
          [])[1]
      ),
      beneficio_tarifario_liquido:
        -Math.abs(
          toNum(
            (text.match(
              /BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+L[ÍI]QUIDO[^\d]+([\d\.\,]+)/i
            ) || [])[1]
          ) || 0
        ),
      icms: toNum((text.match(/ICMS[^\d]+([\d\.\,]+)/i) || [])[1]),
      pis_pasep: toNum((text.match(/PIS[^\d]+([\d\.\,]+)/i) || [])[1]),
      cofins: toNum((text.match(/COFINS[^\d]+([\d\.\,]+)/i) || [])[1]),
      fatura_debito_automatico: text.includes("DÉBITO AUTOMÁTICO")
        ? "yes"
        : "no",
      credito_recebido: toNum(
        (text.match(/CR[ÉE]DITO\s+RECEBIDO[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      saldo_kwh: toNum(
        (text.match(/SALDO[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      excedente_recebido,
      ciclo_geracao,
      informacoes_para_o_cliente,
      uc_geradora,
      uc_geradora_producao,
      cadastro_rateio_geracao_uc: null,
      cadastro_rateio_geracao_percentual: null,
      injecoes_scee: [],
      consumo_scee_quant: toNum(
        (text.match(/CONSUMO\s+SCEE[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      consumo_scee_preco_unit_com_tributos: toNum(
        (text.match(
          /CONSUMO\s+SCEE[^\n]+([\d\,\.]+)\s*$/im
        ) || [])[1]
      ),
      consumo_scee_tarifa_unitaria: toNum(
        (text.match(/SCEE[^\d]+([\d\,\.]+)/i) || [])[1]
      ),
      media,
      parc_injet_s_desc_percentual: toNum(
        (text.match(/PERC[^\d]+([\d\.\,]+)/i) || [])[1]
      ),
      observacoes: ""
    };

    res.json(resultado);
  } catch (err) {
    console.error("❌ Erro no processamento:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔹 Inicializar servidor
// ===============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

