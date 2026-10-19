import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, GitBranch, Zap, ShieldAlert, Scale, Sliders, CheckCircle2 } from 'lucide-react';
import { MassTechnique } from '../types';

interface Props {
  technique?: MassTechnique;
}

export const LogicExplanation: React.FC<Props> = ({ technique = 'TOF-SIMS' }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden mb-8 transition-all duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between bg-stone-50/50 hover:bg-stone-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-medium text-stone-900">
              How CheMScutter Predicts {technique} Fragments
            </h3>
            <p className="text-xs text-stone-500">
              RDKit Molecular Graph Transformations, Ion Stoichiometry &amp; Mass Balance Verification, and Parameter Regime Engines
            </p>
          </div>
        </div>
        <div className="text-stone-400">
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 border-t border-stone-100 space-y-6 text-sm text-stone-600">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: True Molecular Graph Reactions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-stone-900">
                <GitBranch className="w-4 h-4 text-emerald-600" />
                <h4>1. RDKit Molecular Graph Engine</h4>
              </div>
              <p className=" leading-relaxed text-xs">
                Instead of string replacement on SMILES, CheMScutter executes genuine graph transformations directly on the RDKit molecule:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-stone-500">
                <li><strong>Site-Specific Substructure Matching:</strong> Locates exact functional groups (carboxyl, hydroxyl, ester, amide, methoxy, γ-H carbonyl) via SMARTS atom indices.</li>
                <li><strong>Graph Bond Editing &amp; Sanitization:</strong> Modifies the molecular connection table (<code>RWMol</code> / Molblock bond edits) to generate genuine product molecules, canonical SMILES, and 2D depictions.</li>
                <li><strong>True Charged Ion Graphs:</strong> Cationic and anionic fragments (e.g., tropylium <code>[c+]1cccccc1</code>, acylium <code>[C+](=O)R</code>, carboxylate <code>[O-]C(=O)R</code>) carry explicit formal charges on their RDKit graph.</li>
              </ul>
            </div>

            {/* Step 2: Strict Mass Balance & Ion Definitions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-stone-900">
                <Scale className="w-4 h-4 text-amber-600" />
                <h4>2. Exact Mass, Ion Mass &amp; Mass Balance</h4>
              </div>
              <p className="leading-relaxed text-xs">
                Every predicted ion distinguishes neutral mass from charged ion mass and undergoes elemental conservation checks:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-stone-500">
                <li><strong>Neutral Exact Mass:</strong> Monoisotopic mass of the uncharged core stoichiometry.</li>
                <li><strong>Ion Exact Mass &amp; m/z:</strong> Accounts for added/removed protons, electrons (<span className="font-mono">0.00054858 Da</span>), or alkali/reagent adducts (<span className="font-mono">[M+H]+, [M-H]-, [M+Na]+, [M+NH4]+</span>), with <span className="font-mono">m/z = IonMass / |z|</span>.</li>
                <li><strong>Mass Balance Verification:</strong> Verifies <span className="font-mono">Parent = Fragment + Neutral Loss</span> within <span className="font-mono">±0.002 Da</span>.</li>
              </ul>
            </div>

            {/* Step 3: Active Instrument Parameter Regimes */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-stone-900">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h4>3. Instrument Parameter Regimes</h4>
              </div>
              <p className="leading-relaxed text-xs">
                Instrument settings actively govern which fragmentation pathways are enabled, suppressed, or dominant:
              </p>
              {technique === 'TOF-SIMS' && (
                <ul className="list-disc list-inside space-y-1 text-xs text-stone-500">
                  <li><strong>Primary Ion Physics:</strong> Giant clusters (<span className="font-mono">Ar Cluster / C60+</span>) preserve intact quasimolecular ions; monoatomic beams (<span className="font-mono">Ga+ / Au+ / Bi+</span>) drive extensive backbone and aromatic cracking; <span className="font-mono">Cs+ / O2+</span> implant surface charge carriers.</li>
                  <li><strong>Beam Energy (keV):</strong> Controls deep subsurface homolytic vs gentle surface desorption regimes.</li>
                </ul>
              )}
              {technique === 'LC-MS/MS' && (
                <ul className="list-disc list-inside space-y-1 text-xs text-stone-500">
                  <li><strong>Ionization &amp; Adduct Rules:</strong> <span className="font-mono">ESI</span> enables multiply-charged or alkali adducts (<span className="font-mono">[M+Na]+</span> charge-remote traps); <span className="font-mono">APCI</span> favors gas-phase proton transfer and thermal <span className="font-mono">[M+H-H2O]+</span> dehydration.</li>
                  <li><strong>Analyzer &amp; Collision Energy:</strong> <span className="font-mono">Ion Trap CID</span> enforces the 1/3 rule low-mass cut-off (LMCO) and first-generation neutral losses; <span className="font-mono">Orbitrap HCD / QTOF</span> and high CE unlock sequential neutral losses (<span className="font-mono">-H2O-CO</span>) and low-m/z diagnostic ions.</li>
                </ul>
              )}
              {technique === 'GC-MS' && (
                <ul className="list-disc list-inside space-y-1 text-xs text-stone-500">
                  <li><strong>EI vs CI Mode:</strong> <span className="font-mono">EI</span> generates odd-electron radical cations (<span className="font-mono">M+•</span>), α-cleavages, and McLafferty γ-H rearrangements; <span className="font-mono">CI</span> suppresses radical cracking in favor of <span className="font-mono">[M+H]+</span> and reagent adducts (<span className="font-mono">[M+NH4]+, [M+C2H5]+, [M+C4H9]+</span>).</li>
                  <li><strong>Electron Energy (eV):</strong> Low EI energy (<span className="font-mono">12–20 eV</span>) preserves <span className="font-mono">M+•</span> and blocks secondary ring cracking (<span className="font-mono">C7H7+ → C5H5+</span>); standard <span className="font-mono">70 eV</span> unlocks full consecutive cascades.</li>
                </ul>
              )}
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex gap-3 items-start">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <span className="font-semibold block">Important Scientific Note: Heuristic Score ≠ Experimental Intensity</span>
              <p className="text-amber-800 leading-relaxed">
                CheMScutter predicts <strong>structurally and mechanistically plausible candidate ions</strong> prior to running an experiment. The <strong>Heuristic Score (0–100)</strong> and <strong>Priority (High / Medium / Low)</strong> rank pathway plausibility based on bond lability, ion stability, and instrument regime compatibility—they do not represent empirical detector peak intensities. Pathways that cannot be constructed as a single deterministic molecular graph are transparently labeled as <em>Candidate</em>, <em>Approximate pathway</em>, or <em>Mechanistic hypothesis</em>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
