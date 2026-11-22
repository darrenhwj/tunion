import arrowLeft from './icons/arrow-left.svg';
import arrowRight from './icons/arrow-right.svg';
import bookOpen from './icons/book-open.svg';
import threadBubbles from './icons/thread-bubbles.svg';
type IconAsset = { path: string } | { src: string };

export const icons = {
  courses: { src: bookOpen },
  discussions: { src: threadBubbles },
  arrow: { src: arrowRight },
  arrowLeft: { src: arrowLeft },
  groups: { path: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m14-6a4 4 0 0 1 4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm4-4a4 4 0 0 1 0 8' },
  calendar: { path: 'M4 6h16v15H4zm0 5h16M8 3v5m8-5v5' },
} satisfies Record<string, IconAsset>;

export type IconName = keyof typeof icons;

export function getIcon(name: IconName): IconAsset {
  return icons[name];
}
