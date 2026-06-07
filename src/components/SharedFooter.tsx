import React from 'react';
import { Link } from 'react-router-dom';
import abyanLogo from '../assets/abyan-logo.png';
import iloiloCitySeal from '../assets/iloilo-city-seal.png';

export const SharedFooter = React.forwardRef<HTMLElement, object>(
  (_props, ref) => {
    return (
      <footer
        ref={ref}
        style={{ backgroundColor: '#363EE8', fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">

            {/* Logo block */}
            <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
              <div className="flex items-center gap-3">
                <img src={abyanLogo} alt="ABYAN HRIS" className="h-12 w-auto object-contain" style={{ mixBlendMode: 'screen' }} />
                <img src={iloiloCitySeal} alt="Iloilo City Seal" className="h-12 w-auto object-contain opacity-90" />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Office of the City Human Resource<br />
                Management Officer<br />
                Iloilo City Government
              </p>
            </div>

            {/* About column */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>About</h4>
              <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                <li><Link to="/about" className="hover:text-white hover:underline transition-colors">About ABYAN</Link></li>
                <li><Link to="/" className="hover:text-white hover:underline transition-colors">Home</Link></li>
                <li><Link to="/apply" className="hover:text-white hover:underline transition-colors">Apply for a Job</Link></li>
                <li><Link to="/track" className="hover:text-white hover:underline transition-colors">Track Application</Link></li>
              </ul>
            </div>

            {/* Portals column */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>Portals</h4>
              <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                <li><a href="/employee/login" className="hover:text-white hover:underline transition-colors">Employee Portal</a></li>
                <li><a href="/interviewer/login" className="hover:text-white hover:underline transition-colors">Interviewer Portal</a></li>
                <li><a href="/admin/login" className="hover:text-white hover:underline transition-colors">HR Administration</a></li>
              </ul>
            </div>

            {/* Address column */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>Address</h4>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
                OCHRMO, Iloilo City Hall<br />
                Luna St. La Paz,<br />
                Iloilo City 5000<br />
                Iloilo, Philippines<br />
                (063) (033) 320-0870
              </p>
            </div>

            {/* Contact + Social column */}
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>General</h4>
              <a
                href="mailto:cictrix23@gmail.com"
                className="block text-sm hover:underline transition-colors"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                cictrix23@gmail.com
              </a>

              <h4 className="mb-3 mt-5 text-xs font-bold uppercase tracking-widest" style={{ color: '#ffffff' }}>Social</h4>
              <div className="flex gap-2">
                <a
                  href="#"
                  aria-label="Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded transition"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.9v-2.89h2.538V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Twitter"
                  className="flex h-9 w-9 items-center justify-center rounded transition"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded transition"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.20)' }} className="py-4">
          <p className="text-center text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.90)' }}>
            &copy; {new Date().getFullYear()} &ndash; {new Date().getFullYear() + 1} ABYAN HRIS &mdash; Office of the City Human Resource Management Officer
          </p>
        </div>
      </footer>
    );
  }
);

SharedFooter.displayName = 'SharedFooter';
