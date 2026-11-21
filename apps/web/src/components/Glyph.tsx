const paths = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  courses: 'M4 5h6a2 2 0 0 1 2 2v14a4 4 0 0 0-3-2H4zm16 0h-6a2 2 0 0 0-2 2v14a4 4 0 0 1 3-2h5z',
  discussions: 'M20 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 14-4Z M9 10h6m-6 4h4',
  resources: 'M6 3h8l4 4v14H6z M14 3v5h4m-9 5h6m-6 4h6',
  tutoring: 'm2 9 10-5 10 5-10 5z M6 11v5c3 3 9 3 12 0v-5m4-2v6',
  groups: 'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m14-6a4 4 0 0 1 4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm4-4a4 4 0 0 1 0 8',
  profile: 'M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m-3-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  calendar: 'M4 6h16v15H4zm0 5h16M8 3v5m8-5v5',
};

export default function Glyph({ name, className = 'size-5' }: { name: keyof typeof paths; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}
