import { formatIonFormula } from './model';
export default function IonFormula({ formula }: { formula: string }) {
  return <span className="ion-formula" aria-label={formula} data-formula={formula}>{formatIonFormula(formula).map((part, index) => part.position === 'sub'
    ? <sub key={index}>{part.text}</sub> : part.position === 'super' ? <sup key={index}>{part.text}</sup> : <span key={index}>{part.text}</span>)}</span>;
}
