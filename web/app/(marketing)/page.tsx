import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧭</span>
          <span className="font-bold text-lg">Wayfinder</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm transition-colors">
            Dashboard
          </Link>
          <Link
            href="/sign-in"
            className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-950 border border-green-800 text-green-400 text-sm px-4 py-1.5 rounded-full mb-8">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Powered by Cerebras · 1,500+ tokens/sec
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Don&apos;t learn the interface.
          <br />
          <span className="text-green-400">Just tell it what you want.</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Wayfinder watches your screen, understands where you are in any web-based software, and
          overlays a living breadcrumb trail of exactly what to click next.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="bg-green-600 hover:bg-green-500 text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors"
          >
            Start for free
          </Link>
          <span className="text-slate-500 text-sm">Chrome Extension · Works on AWS, Figma, GitHub &amp; more</span>
        </div>
      </section>

      {/* Demo flow */}
      <section className="max-w-4xl mx-auto px-8 pb-24">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <p className="text-slate-500 text-sm font-mono mb-6">// Demo: "Deploy my FastAPI app on AWS"</p>
          <div className="space-y-4">
            {[
              { step: '1', text: 'Tell Wayfinder your goal', sub: 'Type in plain English — no commands, no syntax' },
              { step: '2', text: 'A pulsing green arrow appears', sub: 'Over the exact button to click, in real-time' },
              { step: '3', text: 'Just follow the arrows', sub: 'Wayfinder adapts as the page changes' },
              { step: '4', text: 'Goal complete 🎉', sub: 'No second tab, no YouTube tutorial, no coworker interrupted' },
            ].map(({ step, text, sub }) => (
              <div key={step} className="flex items-start gap-4">
                <span className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                  {step}
                </span>
                <div>
                  <p className="font-semibold">{text}</p>
                  <p className="text-slate-500 text-sm">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="bg-slate-900 border-y border-slate-800 py-20">
        <div className="max-w-4xl mx-auto px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            The speed <span className="text-green-400">is</span> the product
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { label: '~300ms', desc: 'Guidance appears before you second-guess yourself' },
              { label: '1,500+', desc: 'Tokens per second from Cerebras' },
              { label: 'Zero tabs', desc: 'Everything happens in the software you already have open' },
            ].map(({ label, desc }) => (
              <div key={label}>
                <p className="text-4xl font-bold text-green-400 mb-2">{label}</p>
                <p className="text-slate-400 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-10 text-slate-600 text-sm">
        Wayfinder · Built for Cerebras Hackathon · Paramarsh Labs 2026
      </footer>
    </main>
  );
}
