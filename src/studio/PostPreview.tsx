import { useEffect, useMemo, type ReactNode } from "react";
import "./PostPreview.css";

export type PreviewFormat = "feed" | "story" | "square";

export const PREVIEW_FORMATS: { id: PreviewFormat; label: string; width: number; height: number }[] = [
  { id: "feed", label: "Feed", width: 1080, height: 1350 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
  { id: "square", label: "Square", width: 1080, height: 1080 },
];

type Props = {
  handle: string;
  title: string;
  format: PreviewFormat;
  onFormat: (format: PreviewFormat) => void;
  onClose: () => void;
  children: ReactNode;
};

function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.4s-7.2-4.5-9.2-8.3C1.4 9.4 2.3 6 5.4 5.3 7.3 4.8 9 5.8 12 8.4c3-2.6 4.7-3.6 6.6-3.1 3.1.7 4 4.1 2.6 6.8-2 3.8-9.2 8.3-9.2 8.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function Bubble() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 18.5 3.5 21V7.5A3.5 3.5 0 0 1 7 4h10a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 17 18H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function Send() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 4.5 20.5 12 4 19.5l2.2-7.5z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.2 12H12" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Bookmark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v14L12 16.2 5.5 20V6A1.5 1.5 0 0 1 7 4.5z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function PostPreview({ handle, title, format, onFormat, onClose, children }: Props) {
  const frame = PREVIEW_FORMATS.find((item) => item.id === format) ?? PREVIEW_FORMATS[0];
  const tag = (handle.trim() || "@rankingstudio").replace(/^@?/, "@");
  const name = tag.slice(1);
  const letter = name.charAt(0).toUpperCase() || "R";
  const scale = useMemo(() => {
    const maxW = format === "story" ? 290 : 338;
    const maxH = format === "story" ? 560 : 430;
    return Math.min(maxW / frame.width, maxH / frame.height);
  }, [format, frame.height, frame.width]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="post-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-preview-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="post-preview-panel">
        <div className="post-preview-head">
          <div>
            <h2 id="post-preview-title">Post preview</h2>
            <p>How this ranking looks as a social post. It is not posted anywhere.</p>
          </div>
          <button type="button" className="post-preview-close" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </div>
        <div className="post-preview-tabs" role="tablist" aria-label="Post format">
          {PREVIEW_FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === format}
              className={item.id === format ? "is-on" : undefined}
              onClick={() => onFormat(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={`ig-phone is-${format}`}>
          <div className="ig-notch" aria-hidden />
          {format === "story" ? (
            <div className="ig-story">
              <div className="ig-story-bar" aria-hidden>
                <span className="is-on" />
                <span />
                <span />
              </div>
              <div className="ig-story-user">
                <span className="ig-avatar">{letter}</span>
                <span>{tag}</span>
                <span className="ig-muted">2h</span>
              </div>
              <div
                className="ig-art"
                style={{ width: frame.width * scale, height: frame.height * scale }}
              >
                <div className="ig-art-scale" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}>
                  {children}
                </div>
              </div>
              <div className="ig-story-reply">
                <span>Send message</span>
                <Heart />
                <Send />
              </div>
            </div>
          ) : (
            <div className="ig-feed">
              <div className="ig-feed-top">
                <span>Preview</span>
              </div>
              <div className="ig-post-user">
                <span className="ig-avatar">{letter}</span>
                <span className="ig-post-meta">
                  <strong>{tag}</strong>
                  <em>Ranking Studio</em>
                </span>
                <span className="ig-more" aria-hidden>
                  ···
                </span>
              </div>
              <div
                className="ig-art"
                style={{ width: frame.width * scale, height: frame.height * scale }}
              >
                <div className="ig-art-scale" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}>
                  {children}
                </div>
              </div>
              <div className="ig-actions">
                <Heart />
                <Bubble />
                <Send />
                <span className="ig-actions-end">
                  <Bookmark />
                </span>
              </div>
              <p className="ig-likes">Liked by gmc and others</p>
              <p className="ig-caption">
                <strong>{tag}</strong> {title}
              </p>
              <p className="ig-muted">View all comments</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatFromPreset(presetId: string): PreviewFormat {
  if (presetId === "ig-story") return "story";
  if (presetId === "square") return "square";
  return "feed";
}
