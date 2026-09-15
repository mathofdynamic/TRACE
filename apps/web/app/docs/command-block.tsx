'use client';

import { useState } from 'react';

export function CommandBlock({ command, id }: { command: string; id?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted in iframe
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="doc-command-block" id={id}>
      <div className="doc-command-block__code">
        <span className="doc-command-block__prompt" aria-hidden="true">
          $
        </span>
        <code>{command}</code>
      </div>
      <button
        type="button"
        className={`doc-command-block__copy ${copied ? 'doc-command-block__copy--copied' : ''}`}
        onClick={handleCopy}
        aria-label={`Copy command ${command}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
