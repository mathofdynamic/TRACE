import { ImageResponse } from 'next/og';

export const alt = 'TRACE — The history of understanding';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080809',
          color: '#f5f5f7',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: '72px',
          width: '100%',
        }}
      >
        <div
          style={{
            color: '#1688ff',
            display: 'flex',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.18em',
          }}
        >
          TRACE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{ fontSize: 64, fontWeight: 600, letterSpacing: '-0.06em', lineHeight: 1.05 }}
          >
            The history of understanding.
          </div>
          <div style={{ color: '#b7b7bc', fontSize: 26 }}>
            Portable, evidence-backed intelligence for software change.
          </div>
        </div>
        <div style={{ color: '#66666d', display: 'flex', fontSize: 18 }}>
          trace / experimental implementation
        </div>
      </div>
    ),
    size,
  );
}
