import { ArrowLeft, BookOpen, Code2, Heart, Info, Sparkles, UserRound } from 'lucide-react';
import { APP_INFO } from '@/lib/app-info';

export default function AboutPage({ onBack, onSettings }: { onBack: () => void; onSettings: () => void }) {
  return <section className="app-page about-page" aria-labelledby="about-title">
    <div className="page-heading"><div><span className="eyebrow">THE PEOPLE BEHIND THE PAGES</span><h1 id="about-title" tabIndex={-1}>About Us</h1></div><button className="button" onClick={onBack}><ArrowLeft size={16}/>Back to reader</button></div>
    <div className="about-card"><span className="about-brand"><BookOpen size={34}/></span><span className="about-version">Version {APP_INFO.version}</span><h2>{APP_INFO.name}</h2><p className="about-mission">A little clarity, in the margins.</p><p>Built to help everyone read research, ask better questions, and keep useful ideas close to their source.</p>
      <dl className="about-facts"><div><dt><Info size={18}/>Version</dt><dd>{APP_INFO.version}</dd></div><div><dt><UserRound size={18}/>Developer</dt><dd>{APP_INFO.developer}</dd></div><div><dt><Code2 size={18}/>Programming languages</dt><dd>{APP_INFO.languages}</dd></div><div><dt><Sparkles size={18}/>Development agent</dt><dd>{APP_INFO.agent}<small>AI assistance for development, testing, and packaging.</small></dd></div><div><dt><BookOpen size={18}/>Built with</dt><dd>{APP_INFO.technologies}</dd></div></dl>
      <div className="about-footer"><span><Heart size={15}/>Made for curious readers · MIT License</span><button className="text-button" onClick={onSettings}>Open Settings</button></div>
    </div>
  </section>;
}
