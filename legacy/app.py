import io
import os
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
    lines = [line.rstrip('\r') for line in text.split('\n')]
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
    return '\n'.join(lines)

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
        ('[M+H]+', 1.007276, '+H', 'Positive', 100.0),
        ('[M+Na]+', 22.989218, '+Na', 'Positive', 65.0),
        ('[M-H]-', -1.007276, '-H', 'Negative', 60.0)
    ]

    # 加入母分子基本資訊至結構清單 (母分子相對強度 100%)
    structure_list.append({
        "id": "Parent",
        "name": "母分子 (Parent Molecule)",
        "formula": parent_formula,
        "smiles": parent_smiles,
        "exact_mass": round(parent_mass, 4),
        "image": parent_img,
        "relative_intensity": 100.0
    })

    for adduct_name, mass_shift, formula_shift, mode, rel_int in adducts:
        mz = parent_mass + mass_shift
        ion_formula = f"{parent_formula}{formula_shift}"
        formula_signals_list.append({
            "type": "准分子離子 (Adduct)",
            "mode": mode,
            "adduct": adduct_name,
            "formula": ion_formula,
            "mz": round(mz, 4),
            "relative_intensity": round(rel_int, 1)
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

        # 模擬 TOF-SIMS 質譜裂解強度：依分子量比例與裂解級數衰減 (30% ~ 85%)
        mass_ratio = frag_mass / parent_mass if parent_mass > 0 else 0.5
        sim_frag_intensity = round(max(20.0, min(85.0, 35.0 + mass_ratio * 45.0 - (frag_counter % 7) * 2.5)), 1)
        frag_h_intensity = sim_frag_intensity
        frag_radical_intensity = round(max(15.0, sim_frag_intensity * 0.65), 1)

        # 寫入清單二：結構式清單
        structure_list.append({
            "id": frag_id,
            "name": f"碎片 {frag_counter}",
            "formula": frag_formula,
            "smiles": frag_smiles,
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
            "relative_intensity": frag_h_intensity
        })
        formula_signals_list.append({
            "type": f"碎片 ({frag_id})",
            "mode": "Positive",
            "adduct": "[Frag]+.",
            "formula": frag_formula,
            "mz": round(frag_mass, 4),
            "relative_intensity": frag_radical_intensity
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
    data = request.get_json() or {}
    user_input = data.get('input') or data.get('smiles') or data.get('molblock', '')
    if not user_input or not user_input.strip():
        return jsonify({"error": "請輸入化學結構式（支援 SMILES 或 ChemDraw/ChemDoodle 複製的 Molfile）"}), 400
    
    result, err = process_tof_sims_data(user_input)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(result)

# 前端介面 HTML/JS
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <title>CheMScutter - TOF-SIMS 分子切割與碎片結構分析系統</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f8f9fa; }
        .container { max-width: 1200px; margin: auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .input-group { margin-bottom: 20px; }
        input[type="text"] { width: 70%; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }
        button { padding: 10px 20px; font-size: 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .sections { display: flex; gap: 20px; margin-top: 20px; }
        .column { flex: 1; background: #ffffff; padding: 15px; border: 1px solid #e0e0e0; border-radius: 6px; }
        h3 { border-bottom: 2px solid #007bff; padding-bottom: 8px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
        th { background-color: #f2f2f2; }
        .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 10px; }
        .card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; background: #fafafa; }
        .card img { max-width: 100%; height: auto; border-bottom: 1px solid #eee; margin-bottom: 5px; }
        .card-title { font-weight: bold; color: #007bff; }
    </style>
</head>
<body>
<div class="container">
    <h2>CheMScutter - TOF-SIMS 質譜訊號與碎片結構分析系統</h2>
    <div class="input-group">
        <input type="text" id="smilesInput" placeholder="輸入 SMILES (例如乙酸乙酯: CCOC(=O)C 或 阿司匹靈: CC(=O)Oc1ccccc1C(=O)O)">
        <button onclick="analyze()">開始分析</button>
    </div>

    <div class="sections" id="outputSection" style="display:none;">
        <!-- 清單一：分子式與訊號清單 -->
        <div class="column">
            <h3>清單一：TOF-SIMS 訊號與分子式清單</h3>
            <table>
                <thead>
                    <tr>
                        <th>類型</th>
                        <th>極性</th>
                        <th>加合物/離子</th>
                        <th>離子分子式</th>
                        <th>m/z</th>
                    </tr>
                </thead>
                <tbody id="signalsTable"></tbody>
            </table>
        </div>

        <!-- 清單二：分子式對應結構式清單 -->
        <div class="column">
            <h3>清單二：碎片與分子式對應結構式清單</h3>
            <div class="grid-container" id="structuresGrid"></div>
        </div>
    </div>
</div>

<script>
async function analyze() {
    const smiles = document.getElementById('smilesInput').value.trim();
    if (!smiles) {
        alert("請先輸入 SMILES 字串！");
        return;
    }

    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ smiles: smiles })
    });

    const data = await response.json();
    if (data.error) {
        alert(data.error);
        return;
    }

    // 渲染清單一 (訊號表格)
    let tableHtml = "";
    data.signals.forEach(item => {
        tableHtml += `<tr>
            <td>${item.type}</td>
            <td>${item.mode}</td>
            <td>${item.adduct}</td>
            <td><b>${item.formula}</b></td>
            <td>${item.mz}</td>
        </tr>`;
    });
    document.getElementById('signalsTable').innerHTML = tableHtml;

    // 渲染清單二 (結構式卡片)
    let gridHtml = "";
    data.structures.forEach(item => {
        gridHtml += `<div class="card">
            <img src="${item.image}" alt="${item.name}">
            <div class="card-title">${item.name}</div>
            <div>分子式: <b>${item.formula}</b></div>
            <div>MW: ${item.exact_mass}</div>
        </div>`;
    });
    document.getElementById('structuresGrid').innerHTML = gridHtml;

    document.getElementById('outputSection').style.display = 'flex';
}
</script>
</body>
</html>
"""

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
