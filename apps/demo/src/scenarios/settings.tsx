import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'

const LANGUAGES = [
  'Dansk', 'Deutsch', 'English (UK)', 'English (US)', 'Español', 'Eesti', 'Suomi', 'Français', 'Gaeilge', 'Hrvatski',
  'Magyar', 'Íslenska', 'Italiano', 'Latviešu', 'Lietuvių', 'Nederlands', 'Norsk bokmål', 'Norsk nynorsk', 'Polski',
  'Português (Brasil)', 'Português (Portugal)', 'Română', 'Slovenčina', 'Slovenščina', 'Svenska', 'Türkçe', 'Čeština',
  'Ελληνικά', 'Български', 'Русский', 'Українська', 'עברית', 'العربية', 'हिन्दी', 'ไทย', '한국어', '日本語', '中文 (简体)', '中文 (繁體)',
]
const ACCENTS = [
  ['Ocean', '#0a66ff'], ['Moss', '#2f9e44'], ['Ember', '#e8590c'], ['Orchid', '#ae3ec9'], ['Rose', '#e64980'], ['Slate', '#495057'],
] as const

/** Stacked sheets, up to three levels: Settings → Appearance → Accent colour, and Settings → Language. */
export function Settings({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [language, setLanguage] = useState('English (UK)')
  const [langOpen, setLangOpen] = useState(false)
  const [accent, setAccent] = useState<string>(ACCENTS[0][1])
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [notify, setNotify] = useState(true)

  return (
    <div className="settings-page" style={{ ['--accent' as string]: accent }}>
      <div className="profile">
        <div className="avatar big" style={{ ['--h' as string]: 220 }}>AB</div>
        <div>
          <strong>Alva Berg</strong>
          <div className="muted small">alva.berg@example.com · Member since 2021</div>
        </div>
      </div>
      <div className="account-grid">
        <section className="panel">
          <h3 className="section">Preferences</h3>
          <dl className="summary">
            <dt>Language</dt>
            <dd>{language}</dd>
            <dt>Notifications</dt>
            <dd>{notify ? 'On' : 'Off'}</dd>
            <dt>Theme</dt>
            <dd>{dark ? 'Dark' : 'Light'}</dd>
            <dt>Accent</dt>
            <dd>
              <span className="accent-dot" /> {ACCENTS.find(([, v]) => v === accent)?.[0]}
            </dd>
          </dl>
          <button className="primary wide" onClick={() => setOpen(true)}>Open settings</button>
        </section>
        <section className="panel">
          <h3 className="section">Plan</h3>
          <p className="plan">
            <strong>Family</strong> <span className="muted">· 4 of 6 seats</span>
          </p>
          <div className="meter" role="img" aria-label="62% of storage used">
            <span style={{ width: '62%' }} />
          </div>
          <p className="muted small">124 GB of 200 GB used · renews 1 March</p>
        </section>
        <section className="panel">
          <h3 className="section">Signed-in devices</h3>
          <ul className="devices">
            <li><strong>Pixel 8</strong> <span className="muted small">Stockholm · now</span></li>
            <li><strong>MacBook Air</strong> <span className="muted small">Stockholm · 2 hours ago</span></li>
            <li><strong>iPad</strong> <span className="muted small">Uppsala · last week</span></li>
          </ul>
        </section>
      </div>

      <BottomSheet {...logged('settings')} open={open} onOpenChange={setOpen} detents={[0.55]} title="Settings">
        <ul className="menu">
          <li>
            <label className="switch-row menu-row">
              Notifications
              <input type="checkbox" role="switch" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            </label>
          </li>
          <li>
            <button className="menu-row" id="open-language" onClick={() => setLangOpen(true)}>
              Language <span className="muted">{language} ›</span>
            </button>
          </li>
          <li>
            <BottomSheet
              {...logged('appearance')}
              trigger={
                <span className="menu-row">
                  Appearance <span className="muted">›</span>
                </span>
              }
              detents={[]}
              title="Appearance"
              description="Stacked on top of Settings"
            >
              <div className="pad">
                <label className="switch-row">
                  Dark mode (demo only)
                  <input type="checkbox" role="switch" checked={dark} onChange={(e) => setDark(e.target.checked)} />
                </label>
                <BottomSheet
                  {...logged('accent')}
                  trigger={
                    <span className="menu-row">
                      Accent colour <span className="accent-dot" style={{ background: accent }} />
                    </span>
                  }
                  detents={[]}
                  title="Accent colour"
                  description="Third sheet in the stack"
                >
                  <div className="pad accents">
                    {ACCENTS.map(([name, value]) => (
                      <button
                        key={name}
                        className={`accent${accent === value ? ' on' : ''}`}
                        onClick={() => setAccent(value)}
                        aria-pressed={accent === value}
                      >
                        <span style={{ background: value }} />
                        {name}
                      </button>
                    ))}
                  </div>
                </BottomSheet>
              </div>
            </BottomSheet>
          </li>
          <li>
            <Privacy />
          </li>
          <li>
            <Storage />
          </li>
          <li>
            <Help />
          </li>
          <li>
            <About />
          </li>
        </ul>

        {/* Controlled stacked sheet (opened from a plain button above). */}
        <BottomSheet {...logged('language')} open={langOpen} onOpenChange={setLangOpen} detents={[0.6]} title="Language">
          <ul className="menu">
            {LANGUAGES.map((l) => (
              <li key={l}>
                <button
                  className="menu-row"
                  onClick={() => {
                    setLanguage(l)
                    setLangOpen(false)
                  }}
                >
                  {l} {l === language && <span className="check">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      </BottomSheet>
    </div>
  )
}

const row = (label: string, hint = '›') => (
  <span className="menu-row">
    {label} <span className="muted">{hint}</span>
  </span>
)

function Privacy() {
  const [prefs, setPrefs] = useState({ profile: true, activity: false, ads: false, analytics: true, contacts: false })
  const toggle = (k: keyof typeof prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }))
  const items: [keyof typeof prefs, string, string][] = [
    ['profile', 'Public profile', 'Anyone can find you by name'],
    ['activity', 'Show activity status', 'Friends see when you were last online'],
    ['contacts', 'Sync contacts', 'Suggest people you may know'],
    ['analytics', 'Usage analytics', 'Help improve the app, anonymously'],
    ['ads', 'Personalised ads', 'Based on your activity in the app'],
  ]
  return (
    <BottomSheet {...logged('privacy')} trigger={row('Privacy')} detents={[]} title="Privacy" description="Choose what you share">
      <ul className="menu">
        {items.map(([k, label, hint]) => (
          <li key={k}>
            <label className="switch-row menu-row">
              <span>
                {label}
                <span className="muted small block">{hint}</span>
              </span>
              <input type="checkbox" role="switch" checked={prefs[k]} onChange={() => toggle(k)} />
            </label>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}

function Storage() {
  const parts = [
    ['Photos & videos', 6.4, '#4c6ef5'],
    ['Downloads', 2.1, '#12b886'],
    ['Messages', 1.2, '#fab005'],
    ['Cache', 0.9, '#fa5252'],
  ] as const
  const [cleared, setCleared] = useState(false)
  const used = parts.reduce((s, [, gb]) => s + (cleared && gb === 0.9 ? 0 : gb), 0)
  return (
    <BottomSheet {...logged('storage')} trigger={row('Storage', `${used.toFixed(1)} GB ›`)} detents={[]} title="Storage" description={`${used.toFixed(1)} GB of 32 GB used`}>
      <div className="pad">
        <div className="storage-bar" aria-hidden="true">
          {parts.map(([name, gb, color]) => (
            <span key={name} style={{ flexGrow: cleared && name === 'Cache' ? 0 : gb, background: color }} />
          ))}
          <span style={{ flexGrow: 32 - used, background: 'var(--fill)' }} />
        </div>
        <ul className="menu flush">
          {parts.map(([name, gb, color]) => (
            <li key={name} className="menu-row">
              <span><span className="dot" style={{ background: color }} /> {name}</span>
              <span className="muted">{cleared && name === 'Cache' ? '0.0' : gb.toFixed(1)} GB</span>
            </li>
          ))}
        </ul>
        <button className="secondary wide" disabled={cleared} onClick={() => setCleared(true)}>
          {cleared ? 'Cache cleared' : 'Clear cache'}
        </button>
      </div>
    </BottomSheet>
  )
}

const FAQ = [
  ['How do I change my password?', 'Open Settings, then Account, then Password. You will get a confirmation email once it is changed.'],
  ['Can I use the app offline?', 'Most things work offline. Changes sync automatically the next time you are connected.'],
  ['How do I export my data?', 'Go to Privacy and choose Export. We prepare a download and email you a link within a day.'],
  ['Why am I not getting notifications?', 'Check that notifications are on here and in your phone settings, and that Focus modes allow the app.'],
  ['How do I delete my account?', 'Contact support from this page. Deletion is permanent after 30 days.'],
  ['Which languages are supported?', 'Thirty-nine and counting. Pick one under Language; the app restarts in that language.'],
  ['Is my data encrypted?', 'Yes, in transit and at rest. Messages are end-to-end encrypted.'],
  ['How do I report a bug?', 'Shake your phone on any screen, or use Contact support below and include a screenshot.'],
  ['Can I share my account with family?', 'Family plans allow up to six people, each with their own private space.'],
  ['Where can I see my invoices?', 'Under Account, then Billing. Each invoice can be downloaded as a PDF.'],
]

function Help() {
  return (
    <BottomSheet {...logged('help')} trigger={row('Help')} detents={[0.5]} title="Help" description="Frequently asked questions">
      <div className="pad faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
        <button className="primary wide">Contact support</button>
      </div>
    </BottomSheet>
  )
}

function About() {
  return (
    <BottomSheet {...logged('about')} trigger={row('About')} detents={[]} title="About">
      <div className="pad about">
        <div className="about-logo">◐</div>
        <strong>bottom-sheet demo</strong>
        <span className="muted small">Version 0.0.0 · MIT</span>
        <p className="muted">
          One native scroller for the sheet and its content. This sheet is stacked on top of Settings: press Escape, tap
          outside it, or swipe it down to go back.
        </p>
      </div>
    </BottomSheet>
  )
}
