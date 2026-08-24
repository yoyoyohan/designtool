export const ORNAMENT_IDS = ["burst", "soccer", "stars", "laurel", "none"] as const;
export type OrnamentId = (typeof ORNAMENT_IDS)[number];

export const ORNAMENT_LABELS: Record<OrnamentId, string> = {
  burst: "Gold burst",
  soccer: "Soccer ball",
  stars: "Star cluster",
  laurel: "Laurel",
  none: "None",
};

type OrnamentProps = { className?: string };

export function OrnamentGraphic({ id, src, className }: { id: OrnamentId; src?: string; className?: string }) {
  if (src) return <img className={className} src={src} alt="" />;
  if (id === "none") return null;
  if (id === "soccer") return <SoccerMark className={className} />;
  if (id === "stars") return <StarCluster className={className} />;
  if (id === "laurel") return <LaurelMark className={className} />;
  return <BurstMark className={className} />;
}

function SoccerMark({ className }: OrnamentProps) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      <circle cx="64" cy="64" r="58" fill="currentColor" opacity="0.18" />
      <circle cx="64" cy="64" r="48" fill="none" stroke="currentColor" strokeWidth="4" />
      <polygon points="64,40 76,48 72,62 56,62 52,48" fill="currentColor" />
      <path
        d="M52 48 L28 42 M76 48 L100 42 M56 62 L40 86 M72 62 L88 86 M64 40 L64 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M40 86 L64 104 L88 86" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function BurstMark({ className }: OrnamentProps) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const x2 = 64 + Math.cos(a) * 60;
        const y2 = 64 + Math.sin(a) * 60;
        return (
          <line
            key={i}
            x1="64"
            y1="64"
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={i % 2 === 0 ? 5 : 2}
            strokeLinecap="round"
            opacity={i % 2 === 0 ? 0.95 : 0.45}
          />
        );
      })}
      <circle cx="64" cy="64" r="14" fill="currentColor" />
      <circle cx="64" cy="64" r="7" fill="#fff8dc" />
    </svg>
  );
}

function StarCluster({ className }: OrnamentProps) {
  const stars = [
    { x: 64, y: 36, r: 18 },
    { x: 38, y: 78, r: 12 },
    { x: 92, y: 72, r: 10 },
    { x: 70, y: 96, r: 7 },
  ];
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      {stars.map((star, i) => (
        <polygon
          key={i}
          transform={`translate(${star.x} ${star.y})`}
          points={`0,${-star.r} ${star.r * 0.28},${star.r * -0.28} ${star.r * 0.95},${star.r * -0.2} ${star.r * 0.36},${star.r * 0.18} ${star.r * 0.58},${star.r} 0,${star.r * 0.42} ${-star.r * 0.58},${star.r} ${-star.r * 0.36},${star.r * 0.18} ${-star.r * 0.95},${star.r * -0.2} ${-star.r * 0.28},${star.r * -0.28}`}
          fill="currentColor"
          opacity={1 - i * 0.12}
        />
      ))}
    </svg>
  );
}

function LaurelMark({ className }: OrnamentProps) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden>
      <path
        d="M64 18 C38 34 28 70 40 110"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M64 18 C90 34 100 70 88 110"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      {[-1, 1].flatMap((side) =>
        [0, 1, 2, 3, 4].map((i) => {
          const y = 28 + i * 16;
          const x = 64 + side * (18 + i * 6);
          return (
            <ellipse
              key={`${side}-${i}`}
              cx={x}
              cy={y}
              rx="9"
              ry="5"
              fill="currentColor"
              transform={`rotate(${side * 55} ${x} ${y})`}
            />
          );
        }),
      )}
    </svg>
  );
}
