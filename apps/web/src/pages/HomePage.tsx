import ApiStatus from '../components/ApiStatus';
import Card from '../components/Card';
import { useDemoAuth } from '../lib/demoAuth';

export default function HomePage() {
  const { current } = useDemoAuth();
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight text-ink-900">TUnion</h1>
        <p className="max-w-2xl text-lg text-ink-700">
          A university-specific Computer Science peer learning community, where students help students
          through discussions, shared resources, tutoring, and study groups. Every explanation is written
          by a real person.
        </p>
        <ApiStatus />
      </section>
      <Card>
        <p className="text-sm text-ink-500">
          {current
            ? `Viewing as ${current.name} (${current.role}). Demo authentication only.`
            : 'Pick a demo account from the header to get started. Demo authentication only.'}
        </p>
      </Card>
    </div>
  );
}
