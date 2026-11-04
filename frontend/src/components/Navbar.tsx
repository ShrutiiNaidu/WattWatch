import React from 'react';
import { ArrowRight, Menu, X, Zap } from 'lucide-react';
import { BRAND } from '../config/brand';

interface Props {
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onNavClick: () => void;
}

export function Navbar({ mobileOpen, onToggleMobile, onNavClick }: Props) {
  return (
    <header className="navbar">
      <a className="logo" href="#home" onClick={onNavClick} aria-label={`${BRAND.APP_NAME} — home`}>
        <span className="logoMark" aria-hidden="true">
          <Zap size={19} />
        </span>
        <span>
          WATT<b>WATCH</b>
        </span>
      </a>

      <button
        className="mobileMenu"
        onClick={onToggleMobile}
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpen}
        aria-controls="main-nav"
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <nav id="main-nav" className={mobileOpen ? 'nav open' : 'nav'} aria-label="Main navigation">
        <a href="#home" onClick={onNavClick}>Home</a>
        <a href="#check" onClick={onNavClick}>Check my usage</a>
        <a href="#how" onClick={onNavClick}>How it works</a>
        <a href="#about" onClick={onNavClick}>About</a>
      </nav>

      <a className="navCta" href="#check" aria-label="Check my electricity usage">
        Check my usage <ArrowRight size={16} aria-hidden="true" />
      </a>
    </header>
  );
}
