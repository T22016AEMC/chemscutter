import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { runMultiPlatformAnalysis, processTofSimsAnalysis } from './src/server/chemistryEngine';
import { SimulationConfig } from './src/types';

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * 安全解析 AI 輸出的 JSON 字串（自動去除 Markdown 代碼區塊與引號）
 */
function extractJson(text: string): any {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.includes('{')) {
    try {
      cleaned = JSON.parse(cleaned);
    } catch {
      // 忽略
    }
  }
  return JSON.parse(cleaned);
}

/**
 * 具備重試與多模型備援的 Gemini 呼叫輔助函式
 * 優先使用具備強大視覺與化學圖論推理能力之 gemini-3.8-flash
 */
async function callGenAIWithFallback(contents: any) {
  const models = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: { responseMimeType: 'application/json' }
        });
        if (res.text) {
          return { text: res.text, model };
        }
      } catch (err: any) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
  throw lastError || new Error('所有 AI 辨識模型連線失敗');
}

/**
 * 呼叫 RDKit 核心引擎分析化學結構 (支援 TOF-SIMS / LC-MS/MS / GC-MS 多平台)
 */
async function runRDKitAnalysis(inputPayload: string, config?: Partial<SimulationConfig>): Promise<any> {
  return await runMultiPlatformAnalysis(inputPayload, config);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 允許接收較大的剪貼簿圖片與化學結構檔案
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // 健康檢查端點
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  /**
   * 主要分析端點：支援 SMILES 或 ChemDraw/ChemDoodle 複製的 Molfile (V2000/V3000)
   * 支援指定 technique ('TOF-SIMS' | 'LC-MS/MS' | 'GC-MS') 與 simulationConfig 儀器參數
   */
  app.post('/api/analyze', async (req, res) => {
    const rawInput = (req.body?.input || req.body?.smiles || req.body?.molblock || req.body?.structure || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: '請輸入化學結構式、SMILES 或貼上 ChemDraw 結構' });
    }

    const technique = req.body?.technique || req.body?.simulationConfig?.technique || 'TOF-SIMS';
    const simulationConfig: SimulationConfig = {
      ...(req.body?.simulationConfig || {}),
      technique
    };

    // 檢查是否為 ChemDraw CDXML 格式 (XML)
    if (rawInput.includes('<CDXML') || (rawInput.startsWith('<?xml') && rawInput.includes('CDXML'))) {
      try {
        const aiRes = await callGenAIWithFallback(
          `You are an expert chemist. Convert this ChemDraw CDXML structure into canonical SMILES. Return ONLY JSON: {"smiles": "<canonical_smiles>", "name": "<name>"}\n\nCDXML:\n${rawInput.slice(0, 8000)}`
        );
        const parsed = extractJson(aiRes.text || '{}');
        if (parsed.smiles) {
          const cleanSmiles = parsed.smiles.trim().replace(/^["'`]+|["'`]+$/g, '');
          const result = await runRDKitAnalysis(cleanSmiles, simulationConfig);
          result.parent.detected_format = 'ChemDraw CDXML (由 AI 自動轉譯)';
          if (parsed.name) result.parent.compound_name = parsed.name;
          return res.json(result);
        }
      } catch (e: any) {
        console.error('CDXML AI translation failed:', e);
      }
    }

    try {
      const result = await runRDKitAnalysis(rawInput, simulationConfig);
      res.json(result);
    } catch (err: any) {
      console.error('Analyze failed:', err.message);
      res.status(400).json({ error: err.message || '無效的化學結構或計算失敗' });
    }
  });

  /**
   * 圖片辨識端點 (Optical Chemical Structure Recognition)
   * 支援剪貼簿貼圖、截圖上傳 (PNG, JPG, WEBP, SVG)，並保留使用者所選擇的 MS 技術平台
   */
  app.post('/api/recognize-image', async (req, res) => {
    const imagePayload = req.body?.image;
    if (!imagePayload || typeof imagePayload !== 'string') {
      return res.status(400).json({ error: '未接收到有效的圖片資料' });
    }

    const technique = req.body?.technique || req.body?.simulationConfig?.technique || 'TOF-SIMS';
    const simulationConfig: SimulationConfig = {
      ...(req.body?.simulationConfig || {}),
      technique
    };

    let mimeType = 'image/png';
    let base64Data = imagePayload;

    if (imagePayload.startsWith('data:')) {
      const match = imagePayload.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    try {
      const parts = [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        {
          text: `You are an expert analytical and organic chemist specialized in Optical Chemical Structure Recognition (OCSR).
Carefully inspect the 2D chemical structure image (from ChemDraw, ChemDoodle, scientific paper, or screenshot).
Identify the exact molecular structure and return ONLY a valid JSON object matching:
{
  "smiles": "<canonical_smiles_string>",
  "name": "<common_or_iupac_name>",
  "formula": "<chemical_formula>"
}

CRITICAL RULES FOR SMILES:
1. STRICT ATOM-LEVEL SMILES: You MUST expand ALL chemical functional group abbreviations (e.g., Ph, Bn, Me, Et, Pr, iPr, tBu, Ac, OMe, OEt, OAc, COOH, CHO, NO2, SO3H, Ts, Boc, NH2). NEVER output abbreviations in the SMILES string. For example:
   - Expand 'Ph' to 'c1ccccc1'
   - Expand 'Me' to 'C'
   - Expand 'Et' to 'CC'
   - Expand 'Ac' to 'C(=O)C'
   - Expand 'OMe' to 'OC'
   - Expand 'COOH' to 'C(=O)O'
   - Expand 'NO2' to '[N+](=O)[O-]'
   - Expand 'SO3H' to 'S(=O)(=O)O'
2. MASS SPECTROMETRY & MULTI-PLATFORM MS SPECIFICATION (${technique}):
   Our chemical engine simulates fragmentation across TOF-SIMS, LC-MS/MS, and GC-MS.
   Ensure that acidic groups (-COOH, -OH, -SO3H), halogens (-F, -Cl, -Br), and carbonyls are faithfully and completely retained without omission.
3. BRIDGED & FUSED RINGS:
   - Every ring closure digit (1-9) MUST appear exactly in matching pairs.
   - Maintain strict balance between opening '(' and closing ')' parentheses.
4. Ensure canonical standard SMILES syntax parseable by RDKit Chem.MolFromSmiles.
5. Return raw JSON only.`
        }
      ];

      const aiResponse = await callGenAIWithFallback({ parts });
      let parsed: any = {};
      try {
        parsed = extractJson(aiResponse.text || '{}');
      } catch (parseErr) {
        console.error('Failed to parse AI JSON response:', aiResponse.text);
        throw new Error('AI 回應格式解析失敗，請重新嘗試辨識');
      }

      let candidateSmiles = (parsed.smiles || '').trim().replace(/^["'`]+|["'`]+$/g, '');
      const compoundName = parsed.name || '';
      const compoundFormula = parsed.formula || '';

      if (!candidateSmiles || candidateSmiles.toLowerCase() === 'null' || candidateSmiles.toLowerCase() === 'none') {
        if (compoundName) {
          candidateSmiles = compoundName;
        } else {
          return res.status(400).json({ error: '未能從圖片中辨識出清晰的化學分子結構式，請確認截圖清晰度或直接輸入 SMILES。' });
        }
      }

      // 使用 RDKit 驗證並計算指定 MS 技術碎裂（具備 AI 自我修復迴圈）
      let analysisResult: any = null;
      try {
        analysisResult = await runRDKitAnalysis(candidateSmiles, simulationConfig);
      } catch (rdkitErr: any) {
        console.warn(`[OCSR] Initial SMILES "${candidateSmiles}" failed RDKit: ${rdkitErr.message}. Attempting AI syntax self-repair...`);
        const repairPrompt = `You are an expert computational organic chemist.
The candidate SMILES "${candidateSmiles}" for compound "${compoundName || 'unknown'}" (formula: "${compoundFormula || ''}") failed RDKit Chem.MolFromSmiles validation with error: "${rdkitErr.message}".
Please correct the SMILES string so that it is 100% syntactically valid for RDKit:
1. Ensure proper valences and aromatic ring representations.
2. Fully expand all abbreviations (e.g. Ph -> c1ccccc1, Ac -> C(=O)C, OMe -> OC, COOH -> C(=O)O).
3. Return ONLY JSON: {"smiles": "<corrected_canonical_smiles>", "name": "<name>", "formula": "<formula>"}`;

        try {
          const repairResponse = await callGenAIWithFallback(repairPrompt);
          const repairedParsed = extractJson(repairResponse.text || '{}');
          if (repairedParsed.smiles) {
            candidateSmiles = (repairedParsed.smiles || '').trim().replace(/^["'`]+|["'`]+$/g, '');
            analysisResult = await runRDKitAnalysis(candidateSmiles, simulationConfig);
            if (repairedParsed.name && !parsed.name) parsed.name = repairedParsed.name;
          } else {
            throw rdkitErr;
          }
        } catch (repairErr: any) {
          console.error('[OCSR] Auto-repair also failed:', repairErr.message);
          throw new Error(`化學結構解析失敗: ${rdkitErr.message || 'SMILES 語法不符合規範'}`);
        }
      }

      analysisResult.parent.detected_format = `圖片光學辨識 (${aiResponse.model})`;
      if (parsed.name) analysisResult.parent.compound_name = parsed.name;

      res.json({
        success: true,
        smiles: analysisResult.parent.smiles || candidateSmiles,
        name: parsed.name || analysisResult.parent.compound_name || '',
        formula: parsed.formula || analysisResult.parent.formula,
        analysisResult
      });
    } catch (err: any) {
      console.error('Image recognition failed:', err);
      res.status(400).json({
        error: `圖片結構辨識失敗: ${err.message || '請確保圖片包含清晰的 2D 分子結構式'}`
      });
    }
  });

  /**
   * 格式偵測與轉譯端點
   */
  app.post('/api/parse-structure', async (req, res) => {
    const text = (req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: '請提供文字結構' });
    }

    // 1. 判斷格式
    let format = 'Unknown';
    if (text.includes('M  END') || text.includes('V2000') || text.includes('V3000')) {
      format = 'Molfile (ChemDraw/ChemDoodle)';
    } else if (text.includes('<CDXML') || (text.startsWith('<?xml') && text.includes('CDXML'))) {
      format = 'ChemDraw CDXML';
    } else if (text.startsWith('{') && text.includes('"m":')) {
      format = 'ChemDoodle JSON';
    } else {
      format = 'SMILES';
    }

    // 若為 CDXML 或 ChemDoodle，先以 AI 轉譯成 SMILES
    if (format === 'ChemDraw CDXML' || format === 'ChemDoodle JSON') {
      try {
        const aiRes = await callGenAIWithFallback(
          `Convert this chemical data (${format}) to canonical SMILES. Return ONLY JSON: {"smiles": "...", "name": "..."}\nData:\n${text.slice(0, 8000)}`
        );
        const parsed = extractJson(aiRes.text || '{}');
        if (parsed.smiles) {
          const cleanSmiles = parsed.smiles.trim().replace(/^["'`]+|["'`]+$/g, '');
          const result = await runRDKitAnalysis(cleanSmiles);
          return res.json({ format, smiles: cleanSmiles, name: parsed.name, result });
        }
      } catch (e: any) {
        return res.status(400).json({ error: `轉譯 ${format} 失敗: ${e.message}` });
      }
    }

    try {
      const result = await runRDKitAnalysis(text);
      res.json({ format, smiles: result.parent.smiles, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
