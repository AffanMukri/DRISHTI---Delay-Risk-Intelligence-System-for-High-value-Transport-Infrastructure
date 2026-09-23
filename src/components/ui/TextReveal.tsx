import type { CSSProperties } from 'react';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
}

export default function TextReveal({ text, className = '', delay = 0 }: TextRevealProps) {
  return (
    <span className={`text-reveal ${className}`} aria-label={text}>
      <span aria-hidden="true">
        {text.split(' ').map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="text-reveal__word"
            style={{
              '--word-index': index,
              '--reveal-delay': `${delay}ms`,
            } as CSSProperties}
          >
            {word}
            {index < text.split(' ').length - 1 ? '\u00A0' : ''}
          </span>
        ))}
      </span>
    </span>
  );
}
