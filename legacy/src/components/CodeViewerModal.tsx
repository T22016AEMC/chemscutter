import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileCode } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const APP_PY_CODE = `import io
import base64
from flask import Flask, request, jsonify, render_template_string
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors, Draw

app = Flask(__name__)

def mol_to_base64_image(mol, img_size=(200, 200)):
    """將 RDKit Mol 物件繪製並轉換為 Base64 PNG 圖片字串"""
    if mol is None:
        return ""
    img = Draw.MolToImage(mol, size=img_size)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_str}"

def generate_fragments(mol):
    """模擬分子的單鍵斷裂，產生碎片結構清單"""
    fragments = []
    # 掃描分子中非環狀的單鍵進行切割
    for bond in mol.GetBonds():
        if not bond.IsInRing() and bond.GetBondType() == Chem.rdchem.BondType.SINGLE:
            bond_idx = bond.GetIdx()
            # 切斷指定鍵結
            fragmented_mol = Chem.FragmentOnBonds(mol, [bond_idx], addDummies=False)
            # 分割成單獨的碎片
            frags = Chem.GetMolFrags(fragmented_mol, asMols=True)
            for frag in frags:
                Chem.SanitizeMol(frag)
                smiles = Chem.MolToSmiles(frag)
                fragments.append((frag, smiles))
    return fragments

def normalize_molblock(text):
    """規範化 ChemDraw 或 ChemDoodle 複製時可能帶有多餘空行或標頭的 Molfile"""
    lines = [line.rstrip('\\r') for line in text.split('\\n')]
    while lines and not lines[0].strip():
        lines.pop(0)
    counts_idx = -1
    for i, line in enumerate(lines[:12]):
        if 'V2000' in line or 'V3000' in line:
            counts_idx = i
            break
    if counts_idx != -1:
        needed_headers = 3 - counts_idx
        if needed_headers > 0:
            lines = [''] * needed_headers + lines
        elif needed_headers < 0:
            lines = lines[-needed_headers:]
    return '\\n'.join(lines)

def parse_input_to_mol(raw_input):
    """自動偵測並解析 SMILES 或 ChemDraw/ChemDoodle 複製的 Molblock"""
    clean_input = raw_input.strip()
    if 'M  END' in clean_input or 'V2000' in clean_input or 'V3000' in clean_input:
        normalized = normalize_molblock(clean_input)
        mol = Chem.MolFromMolBlock(normalized, removeHs=False)
        if mol:
            return mol, 'Molfile (ChemDraw/ChemDoodle)'
        mol = Chem.MolFromMolBlock(clean_input, removeHs=False)
        if mol:
            return mol, 'Molfile (ChemDraw/ChemDoodle)'
    
    mol = Chem.MolFromSmiles(clean_input)
    if mol:
        return mol, 'SMILES'
    return None, None

def process_tof_sims_data(user_input):
    mol, detected_format = parse_input_to_mol(user_input)
    if not mol:
        return None, "無效的化學結構式（支援 SMILES 或 ChemDraw/ChemDoodle 複製的 Molfile）"
    
    # 規範化 SMILES
    parent_smiles = Chem.MolToSmiles(mol)
    parent_formula = rdMolDescriptors.CalcMolFormula(mol)
    parent_mass = Descriptors.ExactMolWt(mol)
    parent_img = mol_to_base64_image(mol)

    # 1. 初始化資料清單
    formula_signals_list = []  # 清單一：分子式與訊號清單
    structure_list = []        # 清單二：分子式對應結構式清單

    # 追蹤已處理的結構以避免重複
    seen_structures = set()

    # --- 處理母分子的准分子離子 (Adducts) ---
    adducts = [
        ('[M+H]+', 1.007276, '+H', 'Positive'),
        ('[M+Na]+', 22.989218, '+Na', 'Positive'),
        ('[M-H]-', -1.007276, '-H', 'Negative')
    ]

    # 加入母分子基本資訊至結構清單
    structure_list.append({
        "id": "Parent",
        "name": "母分子 (Parent Molecule)",
        "formula": parent_formula,
        "exact_mass": round(parent_mass, 4),
        "image": parent_img
    })

    for adduct_name, mass_shift, formula_shift, mode in adducts:
        mz = parent_mass + mass_shift
        ion_formula = f"{parent_formula}{formula_shift}"
        formula_signals_list.append({
            "type": "准分子離子 (Adduct)",
            "mode": mode,
            "adduct": adduct_name,
            "formula": ion_formula,
            "mz": round(mz, 4),
            "relative_intensity": 100.0 if '+H' in formula_shift else 65.0
        })

    # --- 處理碎片離子 (Fragments) ---
    raw_fragments = generate_fragments(mol)
    frag_counter = 1

    for frag_mol, frag_smiles in raw_fragments:
        if frag_smiles in seen_structures or not frag_smiles:
            continue
        seen_structures.add(frag_smiles)

        frag_formula = rdMolDescriptors.CalcMolFormula(frag_mol)
        frag_mass = Descriptors.ExactMolWt(frag_mol)
        frag_img = mol_to_base64_image(frag_mol)
        frag_id = f"Frag_{frag_counter}"

        # 模擬 TOF-SIMS 裂解強度衰減
        mass_ratio = frag_mass / parent_mass if parent_mass > 0 else 0.5
        sim_frag_intensity = round(max(20.0, min(85.0, 35.0 + mass_ratio * 45.0)), 1)

        # 寫入清單二：結構式清單
        structure_list.append({
            "id": frag_id,
            "name": f"碎片 {frag_counter}",
            "formula": frag_formula,
            "exact_mass": round(frag_mass, 4),
            "image": frag_img,
            "relative_intensity": sim_frag_intensity
        })

        # 寫入清單一：訊號清單 (以正離子 [M+H]+ 與 游離基陽離子 [M]+. 預測)
        formula_signals_list.append({
            "type": f"碎片 ({frag_id})",
            "mode": "Positive",
            "adduct": "[Frag+H]+",
            "formula": f"{frag_formula}+H",
            "mz": round(frag_mass + 1.007276, 4),
            "relative_intensity": sim_frag_intensity
        })
        formula_signals_list.append({
            "type": f"碎片 ({frag_id})",
            "mode": "Positive",
            "adduct": "[Frag]+.",
            "formula": frag_formula,
            "mz": round(frag_mass, 4),
            "relative_intensity": round(max(15.0, sim_frag_intensity * 0.65), 1)
        })

        frag_counter += 1

    return {
        "signals": formula_signals_list,
        "structures": structure_list
    }, None

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    smiles = data.get('smiles', '')
    if not smiles:
        return jsonify({"error": "請輸入 SMILES 結構"}), 400
    
    result, err = process_tof_sims_data(smiles)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
`;

export const CodeViewerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(APP_PY_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">app.py 完整實作代碼與測試方式</h3>
              <p className="text-xs text-slate-500">已部署並儲存於根目錄 /app.py</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? '已複製代碼' : '複製全部代碼'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Terminal run guide */}
        <div className="bg-slate-800 text-slate-200 px-6 py-3 border-b border-slate-700 text-xs flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>本地獨立運行指令：</span>
          <code className="bg-slate-900 text-amber-300 px-2 py-0.5 rounded font-mono">
            python app.py
          </code>
          <span className="text-slate-400">➜ 訪問 http://127.0.0.1:5000</span>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-200 leading-relaxed">
          <pre>{APP_PY_CODE}</pre>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
