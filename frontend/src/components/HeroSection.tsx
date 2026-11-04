import React from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Zap } from 'lucide-react';

export function HeroSection() {
  return (
    <section id="home" className="hero section">
      <div className="heroCopy">
        <div className="eyebrow">
          <span aria-hidden="true" />
          SIMPLE ELECTRICITY CHECK
        </div>
        <h1>
          Know when your
          <br />
          <em>electricity use</em> looks unusual.
        </h1>
        <p>
          Upload your meter readings and get a clear, easy-to-understand report.
          No electrical knowledge. No jargon. Just a simple answer about what looks
          normal and what deserves a closer look.
        </p>
        <div className="heroActions">
          <a className="primaryBtn" href="#check">
            Check my electricity <ArrowRight size={18} aria-hidden="true" />
          </a>
          <a className="quietLink" href="#how">
            See how it works <ChevronDown size={17} aria-hidden="true" />
          </a>
        </div>
        <div className="trust">
          <CheckCircle2 size={17} aria-hidden="true" /> Your data is checked before analysis
          <span aria-hidden="true">•</span>
          <CheckCircle2 size={17} aria-hidden="true" /> An unusual reading is not proof of a fault
        </div>
      </div>

      <div className="heroVisual" aria-label="Simple electricity usage illustration" role="img">
        <div className="meterCard">
          <div className="meterTop">
            <span>YOUR DATA, MADE CLEAR</span>
            <span className="liveDot">SIMPLE · USEFUL</span>
          </div>
          <div className="heroIllustration">
            <Zap size={34} aria-hidden="true" />
            <span>
              Electricity use
              <br />
              made easier to understand
            </span>
          </div>
          <div className="miniChart" aria-hidden="true">
            <div className="bar b1" />
            <div className="bar b2" />
            <div className="bar b3" />
            <div className="bar b4" />
            <div className="bar b5 unusual" />
            <div className="bar b6" />
            <div className="bar b7" />
            <div className="bar b8" />
          </div>
          <div className="meterNote">
            <span className="dot green" aria-hidden="true" />
            Illustration only — not your readings
          </div>
        </div>
        <div className="sunBadge" aria-hidden="true">⚡</div>
      </div>
    </section>
  );
}
