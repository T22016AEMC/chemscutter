import io
import json
import sys
import base64
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors, Draw

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
                try:
                    Chem.SanitizeMol(frag)
                    smiles = Chem.MolToSmiles(frag)
                    if smiles:
                        fragments.append((frag, smiles))
                except Exception:
                    continue
    return fragments

def normalize_molblock(text):
    """
    修正 ChemDraw/ChemDoodle 複製時可能產生的檔頭空白行或行數不一致問題，
    確保 MDL Molfile 第四行為 Counts line (含 V2000 或 V3000)
    """
    lines = text.splitlines()
    v_idx = -1
    for i, line in enumerate(lines):
        if "V2000" in line or "V3000" in line:
            v_idx = i
            break
    if v_idx != -1 and v_idx != 3:
        counts_and_rest = lines[v_idx:]
        header = ["ChemStructure", "  ChemDraw/ChemDoodle", ""]
        return "\n".join(header + counts_and_rest)
    return text

# 常見化合物名稱字典（包含中英文、常見藥物與溶劑），支援直接輸入名稱或圖片辨識出化合物名稱時解析
COMMON_MOLECULES = {
    "aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "acetylsalicylic acid": "CC(=O)Oc1ccccc1C(=O)O",
    "阿司匹靈": "CC(=O)Oc1ccccc1C(=O)O",
    "乙醯水楊酸": "CC(=O)Oc1ccccc1C(=O)O",
    "caffeine": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    "咖啡因": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    "paracetamol": "CC(=O)Nc1ccc(O)cc1",
    "acetaminophen": "CC(=O)Nc1ccc(O)cc1",
    "乙醯胺酚": "CC(=O)Nc1ccc(O)cc1",
    "普拿疼": "CC(=O)Nc1ccc(O)cc1",
    "ibuprofen": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "布洛芬": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "benzene": "c1ccccc1",
    "苯": "c1ccccc1",
    "toluene": "Cc1ccccc1",
    "甲苯": "Cc1ccccc1",
    "phenol": "Oc1ccccc1",
    "苯酚": "Oc1ccccc1",
    "benzoic acid": "c1ccccc1C(=O)O",
    "苯甲酸": "c1ccccc1C(=O)O",
    "ethanol": "CCO",
    "乙醇": "CCO",
    "methanol": "CO",
    "甲醇": "CO",
    "acetic acid": "CC(=O)O",
    "乙酸": "CC(=O)O",
    "acetone": "CC(=O)C",
    "丙酮": "CC(=O)C",
    "ethyl acetate": "CCOC(=O)C",
    "乙酸乙酯": "CCOC(=O)C",
    "glucose": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
    "葡萄糖": "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
    "nicotine": "CN1CCC[C@H]1c1cccnc1",
    "尼古丁": "CN1CCC[C@H]1c1cccnc1"
}

# 化學縮寫替換規則（ChemDraw 截圖或光學辨識常見縮寫轉為完整原子結構）
ABBREV_REPLACEMENTS = [
    (r"Ph-?", "c1ccccc1"),
    (r"-?Ph", "c1ccccc1"),
    (r"Bn-?", "Cc1ccccc1"),
    (r"-?Bn", "Cc1ccccc1"),
    (r"t-?Bu-?", "C(C)(C)C"),
    (r"-?t-?Bu", "C(C)(C)C"),
    (r"MeO-?", "COc1"),
    (r"-?OMe", "OC"),
    (r"-?OAc", "OC(=O)C"),
    (r"AcO-?", "CC(=O)O"),
    (r"-?COOH", "C(=O)O"),
    (r"HOOC-?", "OC(=O)"),
    (r"-?CHO", "C=O"),
    (r"-?NO2", "[N+](=O)[O-]"),
    (r"O2N-?", "[O-][N+](=O)"),
    (r"-?SO3H", "S(=O)(=O)O"),
    (r"-?NH2", "N"),
    (r"H2N-?", "N"),
]

def expand_chemical_abbreviations(smiles_str):
    """將常見有機化學官能基縮寫轉換為 RDKit 可識別之標準原子 SMILES"""
    import re
    res = smiles_str
    for pattern, replacement in ABBREV_REPLACEMENTS:
        res = re.sub(pattern, replacement, res)
    return res

def balance_parentheses(s):
    """修復 SMILES 中括號不對稱問題（去除多餘右括號或補齊未閉合之左括號）"""
    chars = list(s)
    open_count = 0
    balanced = []
    for c in chars:
        if c == '(':
            open_count += 1
            balanced.append(c)
        elif c == ')':
            if open_count > 0:
                open_count -= 1
                balanced.append(c)
            else:
                # 略過多餘的右括號
                continue
        else:
            balanced.append(c)
    # 補齊未閉合之左括號
    while open_count > 0:
        balanced.append(')')
        open_count -= 1
    return ''.join(balanced)

def fix_unclosed_rings(s):
    """
    修復 SMILES 中的環開閉編號 (Ring closure digits):
    每個環編號必須成對 (偶數次) 出現。若因光學辨識遺漏導致單數次或僅出現 1 次，
    自動剃除孤立的懸空環編號，使多環/橋環系統正常開閉合。
    """
    tokens = []
    in_bracket = False
    for i, c in enumerate(s):
        if c == '[':
            in_bracket = True
            tokens.append((c, 'bracket', i))
        elif c == ']':
            in_bracket = False
            tokens.append((c, 'bracket', i))
        elif in_bracket:
            tokens.append((c, 'bracket', i))
        elif c.isdigit():
            tokens.append((c, 'ring', i))
        else:
            tokens.append((c, 'other', i))

    counts = {}
    for c, kind, i in tokens:
        if kind == 'ring':
            counts[c] = counts.get(c, 0) + 1

    bad_digits = {d for d, cnt in counts.items() if cnt % 2 != 0}
    if not bad_digits:
        return s

    new_chars = []
    seen = {d: 0 for d in bad_digits}
    for c, kind, i in tokens:
        if kind == 'ring' and c in bad_digits:
            seen[c] += 1
            # 若總共只出現 1 次，直接去除
            if counts[c] == 1:
                continue
            # 若出現奇數次 (如 3 次)，去除最後多餘的 1 次
            if seen[c] > (counts[c] // 2) * 2:
                continue
        new_chars.append(c)
    return ''.join(new_chars)

def fix_trivalent_oxygen(s):
    """
    修復光學辨識將酯基氧或醚鍵誤判為三價氧 (如 O2C3 或 =O2)，
    在 SMILES 中 O 接數字再直接接碳原子會產生三配位鍵，造成價數錯誤。
    """
    import re
    # 模式 1: (C(=O)O2C3...) 移除夾在氧與碳之間的環數字
    res = re.sub(r'([A-Za-z\)])O([1-9])([A-Za-z])', r'\1O\3', s)
    # 模式 2: 末端或孤立的 =O2 修正為 =O
    res = re.sub(r'=O[1-9]', '=O', res)
    return res

def repair_smiles_syntax(s):
    """
    綜合自動修復光學辨識產生的語法瑕疵（多配位、括號不對稱、環開閉不對稱等）
    """
    cand = (s or "").strip()
    if not cand:
        return None, cand

    # 1. 嘗試修復三價氧
    cand = fix_trivalent_oxygen(cand)
    try:
        m = Chem.MolFromSmiles(cand, sanitize=True)
        if m:
            return m, cand
    except Exception:
        pass

    # 2. 嘗試平衡括號
    cand = balance_parentheses(cand)
    try:
        m = Chem.MolFromSmiles(cand, sanitize=True)
        if m:
            return m, cand
    except Exception:
        pass

    # 3. 嘗試修復未閉合或單數環編號
    cand = fix_unclosed_rings(cand)
    try:
        m = Chem.MolFromSmiles(cand, sanitize=True)
        if m:
            return m, cand
    except Exception:
        pass

    # 4. 嘗試非嚴格模式後 Sanitize
    try:
        m = Chem.MolFromSmiles(cand, sanitize=False)
        if m:
            Chem.SanitizeMol(m)
            return m, cand
    except Exception:
        pass

    return None, cand

def parse_input_to_mol(raw_input):
    """
    支援 SMILES 字串、Molfile (V2000/V3000)、JSON 物件、化學品名或具縮寫的結構式
    """
    import re
    text = (raw_input or "").strip()
    if not text:
        return None, None, "請輸入結構式或貼上分子結構"

    # 去除 Markdown 標籤代碼區塊 (如 ```smiles ... ``` 或 ```json ... ```)
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()

    # 檢測是否為 JSON 格式 (例如傳入 {"smiles": "...", "name": "..."})
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("{\"") and "}" in text):
        try:
            parsed_json = json.loads(text)
            if isinstance(parsed_json, dict):
                candidate = (
                    parsed_json.get("smiles")
                    or parsed_json.get("SMILES")
                    or parsed_json.get("molblock")
                    or parsed_json.get("input")
                )
                if candidate and isinstance(candidate, str) and candidate.strip() != text:
                    m, fmt, err = parse_input_to_mol(candidate)
                    if m:
                        return m, fmt, None
        except Exception:
            pass

    # 1. 檢測是否為 Molfile (包含 M  END 或 V2000 / V3000)
    if "M  END" in text or "V2000" in text or "V3000" in text:
        # 先嘗試直接解析
        try:
            mol = Chem.MolFromMolBlock(text, sanitize=True)
            if mol:
                return mol, "Molfile (ChemDraw/ChemDoodle)", None
        except Exception:
            pass

        # 嘗試標準化檔頭後解析
        try:
            norm_text = normalize_molblock(text)
            mol = Chem.MolFromMolBlock(norm_text, sanitize=True)
            if mol:
                return mol, "Molfile (ChemDraw/ChemDoodle)", None
        except Exception:
            pass

        # 嘗試非嚴格模式解析
        try:
            norm_text = normalize_molblock(text)
            mol = Chem.MolFromMolBlock(norm_text, sanitize=False)
            if mol:
                Chem.SanitizeMol(mol)
                return mol, "Molfile", None
        except Exception:
            pass

    # 清理外層引號與反引號 (例如 "CC(=O)O" 或 `c1ccccc1`)
    clean_smi = text.strip("\"'` ")

    # 2. 檢測常見化合物名稱
    lowered_name = clean_smi.lower()
    if lowered_name in COMMON_MOLECULES:
        try:
            mol = Chem.MolFromSmiles(COMMON_MOLECULES[lowered_name])
            if mol:
                return mol, f"化合物名稱 ({clean_smi})", None
        except Exception:
            pass

    # 3. 檢測標準 SMILES
    try:
        mol = Chem.MolFromSmiles(clean_smi, sanitize=True)
        if mol:
            return mol, "SMILES", None
    except Exception:
        pass

    # 4. 嘗試以非嚴格模式解析 SMILES (修復芳香性或非標準原子價)
    try:
        mol = Chem.MolFromSmiles(clean_smi, sanitize=False)
        if mol:
            Chem.SanitizeMol(mol)
            return mol, "SMILES", None
    except Exception:
        pass

    # 5. 嘗試展開常見縮寫群 (例如 Ph-COOH -> c1ccccc1C(=O)O)
    expanded = clean_smi
    try:
        expanded = expand_chemical_abbreviations(clean_smi)
        if expanded != clean_smi:
            mol = Chem.MolFromSmiles(expanded, sanitize=True)
            if mol:
                return mol, "SMILES (展開縮寫)", None
            mol = Chem.MolFromSmiles(expanded, sanitize=False)
            if mol:
                Chem.SanitizeMol(mol)
                return mol, "SMILES (展開縮寫)", None
    except Exception:
        pass

    # 6. 自動修復光學辨識常見語法瑕疵（未閉合環、孤立環編號、不對稱括號、三價氧）
    try:
        repaired_mol, repaired_smi = repair_smiles_syntax(clean_smi)
        if repaired_mol:
            return repaired_mol, "SMILES (語法自動修復)", None

        if expanded != clean_smi:
            repaired_mol, repaired_smi = repair_smiles_syntax(expanded)
            if repaired_mol:
                return repaired_mol, "SMILES (語法自動修復)", None
    except Exception:
        pass

    return None, None, f"無法辨識化學結構式「{clean_smi[:60]}」。請確認為有效的 SMILES、ChemDraw Molfile 或清晰結構截圖。"

def process_tof_sims_data(raw_input):
    mol, detected_format, err = parse_input_to_mol(raw_input)
    if err or not mol:
        return None, err or "無效的化學結構"

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

    # 加入母分子基本資訊至結構清單 (母分子基峰強度 100%)
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
        "parent": {
            "smiles": parent_smiles,
            "formula": parent_formula,
            "exact_mass": round(parent_mass, 4),
            "detected_format": detected_format
        },
        "signals": formula_signals_list,
        "structures": structure_list
    }, None

if __name__ == '__main__':
    raw_input = ""
    # 優先從標準輸入 (stdin) 讀取，以完整支援多行的 Molfile / SDF 格式
    if not sys.stdin.isatty():
        try:
            stdin_content = sys.stdin.read()
            if stdin_content:
                try:
                    data = json.loads(stdin_content)
                    if isinstance(data, dict):
                        raw_input = data.get('input') or data.get('smiles') or data.get('molblock', '')
                    else:
                        raw_input = str(data)
                except Exception:
                    raw_input = stdin_content
        except Exception:
            pass

    if not raw_input and len(sys.argv) > 1:
        raw_input = sys.argv[1]

    if not raw_input:
        raw_input = 'CC(=O)Oc1ccccc1C(=O)O'

    res, err = process_tof_sims_data(raw_input)
    if err:
        print(json.dumps({"error": err}, ensure_ascii=False))
        sys.exit(1)
    else:
        print(json.dumps(res, ensure_ascii=False))
