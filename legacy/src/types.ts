export type MassTechnique = 'TOF-SIMS' | 'LC-MS/MS' | 'GC-MS';

export type PathwayStatus =
  | 'Verified Graph Product'
  | 'Candidate'
  | 'Approximate pathway'
  | 'Mechanistic hypothesis';

export interface SimulationConfig {
  technique: MassTechnique;
  polarity?: 'Positive' | 'Negative' | 'Both';
  ionization?: string;               // ESI+, ESI-, APCI+, APCI-, EI, CI, Auto
  analyzer?: string;                 // QTOF, Orbitrap, Triple Quadrupole, Ion Trap, TOF, Quadrupole, Generic
  fragmentationMethod?: string;      // CID, HCD, MS/MS Generic, EI 70eV, SIMS Cascade
  collisionEnergy?: number;          // eV (for LC-MS/MS)
  collisionEnergyUnit?: 'eV';
  collisionEnergyRange?: {
    start: number;
    end: number;
    step: number;
  };
  electronEnergy?: number;           // eV (for GC-MS, default 70)
  primaryIon?: string;               // Generic, Bi+, Bi3+, Au+, Au3+, C60+, Ar Cluster, Cs+, O2+, Custom
  primaryIonEnergy?: number;         // keV (for TOF-SIMS)
  simulationMode?: 'General' | 'Instrument-aware';
  isolationWindow?: number;
  precursorAdduct?: string;
  sourceTemperature?: number;
  sourceVoltage?: number;
  reagentGas?: string;               // for GC-MS CI: Methane, Isobutane, Ammonia, Generic
  customParameters?: Record<string, any>;
}

export interface FragmentCandidate {
  id: string;
  technique: MassTechnique;
  polarity: 'Positive' | 'Negative';
  precursorMz?: number;
  mz: number;                        // ionExactMass / |charge|
  formula: string;                   // True ionic formula (e.g. C7H7+, C9H7O4-, C9H9O4+, C7H6O3+.)
  neutralFormula?: string;           // Uncharged formula or base composition
  smiles: string;                    // Canonical SMILES of the genuine RDKit molecule/ion
  canonicalSmiles?: string;          // Explicit canonical SMILES
  exactMass: number;                 // Kept for backward compatibility (= neutralExactMass or ionExactMass)
  neutralExactMass: number;          // Exact monoisotopic mass of neutral species (Da)
  ionExactMass: number;              // Exact mass including charge/proton/electron/adduct (Da)
  charge: number;                    // Integer charge, e.g., +1, -1
  ionType: string;                   // [M+H]+, [M-H]-, [Frag+H]+, [C7H7]+, M+., etc.
  mechanism: string;
  fragmentationPathway?: string;     // Explicit pathway description
  pathwayStatus?: PathwayStatus;     // Graph product verification status
  neutralLoss?: string;              // Formula of neutral loss (e.g., C2H2O, CO2, H2O)
  neutralLossMass?: number;          // Exact mass of neutral loss (Da)
  massBalanceError?: number;         // |Precursor - (Fragment + NeutralLoss)| in Da
  massBalanceVerified?: boolean;
  parentStructureId?: string;        // Links to StructureItem.id for UI highlighting
  priority: 'High' | 'Medium' | 'Low';
  confidence: 'High' | 'Medium' | 'Low';
  sourceRule: string;
  heuristicScore?: number;           // 0-100 heuristic ranking score (NOT experimental intensity)
  image?: string;
  explanation?: string;
  parameterContext?: string;
}

export interface SweepResultItem {
  parameterValue: number;            // e.g. CE in eV or EE in eV
  parameterLabel: string;
  regimeSummary?: string;
  topCandidates: {
    id: string;
    ionType: string;
    formula: string;
    mz: number;
    priority: 'High' | 'Medium' | 'Low';
    likelihood: 'Dominant' | 'Prominent' | 'Trace' | 'Unfavored';
  }[];
}

export interface SignalItem {
  id?: string;
  type: string;                      // 准分子離子 (Adduct), 碎片 (Fragment), 診斷離子 (Diagnostic Ion), etc.
  mode: 'Positive' | 'Negative' | string;
  adduct: string;
  formula: string;
  neutralFormula?: string;
  smiles?: string;
  canonicalSmiles?: string;
  mz: number;
  neutralExactMass?: number;
  ionExactMass?: number;
  charge?: number;
  relative_intensity?: number;       // Heuristic score (0-100), kept for legacy chart binding
  heuristicScore?: number;           // 0-100 heuristic priority score
  priority?: 'High' | 'Medium' | 'Low';
  confidence?: 'High' | 'Medium' | 'Low';
  mechanism?: string;
  fragmentationPathway?: string;
  pathwayStatus?: PathwayStatus;
  neutralLoss?: string;
  neutralLossMass?: number;
  massBalanceVerified?: boolean;
  parentStructureId?: string;
  sourceRule?: string;
  parameterContext?: string;
}

export interface StructureItem {
  id: string;
  name: string;
  formula: string;
  neutralFormula?: string;
  smiles?: string;
  canonicalSmiles?: string;
  exact_mass: number;                // Neutral or ion exact mass (Da)
  neutralExactMass?: number;
  ionExactMass?: number;
  mz?: number;
  charge?: number;
  ionType?: string;
  image: string;
  relative_intensity?: number;       // Heuristic score (0-100)
  heuristicScore?: number;
  priority?: 'High' | 'Medium' | 'Low';
  confidence?: 'High' | 'Medium' | 'Low';
  mode?: 'Positive' | 'Negative' | 'Both' | string;
  mechanism?: string;
  fragmentationPathway?: string;
  pathwayStatus?: PathwayStatus;
  neutralLoss?: string;
  neutralLossMass?: number;
  massBalanceVerified?: boolean;
  sourceRule?: string;
}

export interface ParentMolecule {
  smiles: string;
  formula: string;
  exact_mass: number;
  detected_format?: string;
  compound_name?: string;
  original_image?: string;
  detected_groups?: string[];        // 偵測到的官能基列表
  negative_path_enabled?: boolean;   // 陰離子裂解分支
  fragmentation_theories?: string[]; // 採用的質譜理論
}

export interface AnalysisResult {
  technique: MassTechnique;
  simulationConfig?: SimulationConfig;
  simulationModeLabel?: string;
  parameterContext?: string;
  activeRegimeDescription?: string;
  disclaimer?: string;
  parent: ParentMolecule;
  signals: SignalItem[];
  structures: StructureItem[];
  candidates?: FragmentCandidate[];
  sweepResults?: SweepResultItem[];
}

export type InputMode = 'image' | 'chemdraw' | 'smiles';
