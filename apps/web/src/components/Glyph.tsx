import { getIcon, type IconName } from '../assets/icons';

export default function Glyph({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const icon = getIcon(name);

  if ('src' in icon) {
    return <img src={icon.src} alt="" className={`object-contain ${className}`} />;
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={icon.path} />
    </svg>
  );
}
