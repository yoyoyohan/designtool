import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TeamRecord } from "../engine/types";
import { graphicBarFor } from "../theme/graphicBars";
import { colorSwatch, findBar, normalizeHex, type BarRecord } from "./barStore";
import { LogoCropper } from "./LogoCropper";
import type { DeskMode } from "./logoApi";
import {
  logoIsInUse,
  normalizeLogoName,
  type LogoView,
} from "./logoStore";
import { CLEAR_BG_TAG, transparentSrc } from "./transparentCrest";
import "./LogoDatabase.css";

class CropSafe extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="logo-crop-mask" role="alertdialog" aria-label="Crop failed">
          <div className="logo-crop">
            <p className="logo-crop-title">Could not open that crop</p>
            <p className="logo-crop-help">Close this box. The rest of the studio is still here.</p>
            <div className="logo-crop-actions">
              <button type="button" className="ghost-btn" onClick={this.props.onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export type LogoEntry = {
  key: string;
  libraryId: string | null;
  teamId: string | null;
  name: string;
  aliases: string[];
  tags: string[];
  url: string;
  used: boolean;
  source: "library" | "sample";
  primary: string;
  secondary: string;
  hasOriginal: boolean;
  hasPrevious: boolean;
  packUrl: string | null;
};

type Props = {
  logos: LogoView[];
  teams: TeamRecord[];
  bars: BarRecord[];
  usedNames: string[];
  note: string;
  shareMode: DeskMode;
  shareNote?: string;
  deskOpen: boolean;
  onDeskOpen: () => void;
  onDeskClose: () => void;
  onUnlock: (key: string) => void;
  onUpload: (files: FileList | File[]) => void;
  onSaveDraft: (entry: LogoEntry, draft: { name: string; aliases: string; tags: string; primary: string; secondary: string }) => void;
  onReplace: (entry: LogoEntry, file: File) => void;
  onCrop: (entry: LogoEntry, blob: Blob) => void;
  onUndoCrop: (entry: LogoEntry) => void;
  onRevertOriginal: (entry: LogoEntry) => void;
  onDelete: (entry: LogoEntry) => void;
};

function colorsFor(name: string, aliases: string[], bars: BarRecord[], team?: TeamRecord) {
  const desk = findBar(bars, name, ...aliases);
  const graphic = graphicBarFor(name, team?.name);
  return {
    primary: desk?.primary ?? graphic?.primary ?? team?.primary ?? "#3a3a40",
    secondary: desk?.secondary ?? graphic?.secondary ?? team?.secondary ?? "#ffffff",
  };
}

function DeskCrest({ src }: { src: string }) {
  const [url, setUrl] = useState(src);
  useEffect(() => {
    let gone = false;
    setUrl(src);
    void transparentSrc(src).then((next) => {
      if (!gone) setUrl(next);
    });
    return () => {
      gone = true;
    };
  }, [src]);
  return <img src={url} alt="" />;
}

function ColorField({
  label,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const hex = colorSwatch(text);
  if (!canEdit) {
    return (
      <label className="logo-row-color">
        {label}
        <span className="logo-row-swatch is-static" style={{ background: hex }} title={hex} />
      </label>
    );
  }
  return (
    <label className="logo-row-color">
      {label}
      <span className="logo-row-swatch">
        <input
          type="color"
          value={hex}
          onChange={(event) => {
            setText(event.target.value);
            onCommit(event.target.value);
          }}
        />
        <input
          type="text"
          value={text}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (/^#[0-9a-fA-F]{6}$/.test(next.trim())) onCommit(next.trim());
          }}
          onBlur={() => {
            const next = normalizeHex(text, value);
            setText(next);
            if (next !== value) onCommit(next);
          }}
        />
      </span>
    </label>
  );
}

function buildEntries(logos: LogoView[], teams: TeamRecord[], bars: BarRecord[], usedNames: string[]): LogoEntry[] {
  const covered = new Set<string>();
  const rows: LogoEntry[] = logos.map((logo) => {
    const team = teams.find((item) => {
      const names = [item.name, item.logoFile.replace(/\.[^.]+$/, ""), ...item.aliases].map(normalizeLogoName);
      return [logo.name, ...logo.aliases].map(normalizeLogoName).some((key) => names.includes(key));
    });
    if (team) covered.add(team.id);
    const packUrl = team?.source === "sample" && team.logoUrl.startsWith("/sample/") ? team.logoUrl : null;
    return {
      key: `lib-${logo.id}`,
      libraryId: logo.id,
      teamId: team?.id ?? null,
      name: logo.name,
      aliases: logo.aliases,
      tags: logo.tags,
      url: logo.url,
      used: logoIsInUse(logo, usedNames),
      source: "library",
      hasOriginal: Boolean(logo.hasOriginal) || Boolean(packUrl),
      hasPrevious: Boolean(logo.hasPrevious),
      packUrl,
      ...colorsFor(logo.name, logo.aliases, bars, team),
    };
  });
  for (const team of teams) {
    if (covered.has(team.id) || !team.logoUrl) continue;
    const packUrl = team.source === "sample" && team.logoUrl.startsWith("/sample/") ? team.logoUrl : null;
    rows.push({
      key: `team-${team.id}`,
      libraryId: null,
      teamId: team.id,
      name: team.name,
      aliases: team.aliases,
      tags: team.source === "sample" ? ["Sample"] : ["Upload"],
      url: team.logoUrl,
      used: usedNames.some((query) => normalizeLogoName(query) === normalizeLogoName(team.name)),
      source: "sample",
      hasOriginal: Boolean(packUrl),
      hasPrevious: false,
      packUrl,
      ...colorsFor(team.name, team.aliases, bars, team),
    });
  }
  return rows.sort((a, b) => {
    if (a.used !== b.used) return a.used ? -1 : 1;
    if (a.source !== b.source) return a.source === "library" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function filterEntries(rows: LogoEntry[], query: string, tag: string): LogoEntry[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (tag && !row.tags.includes(tag)) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
      row.tags.some((item) => item.toLowerCase().includes(needle))
    );
  });
}

function visibleTags(tags: string[]) {
  return tags.filter((tag) => tag !== "Sample" && tag !== "Upload" && tag !== CLEAR_BG_TAG).join(", ");
}

function LogoRow({
  entry,
  canEdit,
  onSaveDraft,
  onCrop,
  onReplaceClick,
  onUndoCrop,
  onRevertOriginal,
  onDelete,
}: {
  entry: LogoEntry;
  canEdit: boolean;
  onSaveDraft: Props["onSaveDraft"];
  onCrop: (entry: LogoEntry) => void;
  onReplaceClick: (entry: LogoEntry) => void;
  onUndoCrop: Props["onUndoCrop"];
  onRevertOriginal: Props["onRevertOriginal"];
  onDelete: Props["onDelete"];
}) {
  const [name, setName] = useState(entry.name);
  const [aliases, setAliases] = useState(entry.aliases.join(", "));
  const [tags, setTags] = useState(visibleTags(entry.tags));
  const [primary, setPrimary] = useState(entry.primary);
  const [secondary, setSecondary] = useState(entry.secondary);

  const savedKey = `${entry.name}|${entry.aliases.join(",")}|${visibleTags(entry.tags)}|${entry.primary}|${entry.secondary}`;
  useEffect(() => {
    setName(entry.name);
    setAliases(entry.aliases.join(", "));
    setTags(visibleTags(entry.tags));
    setPrimary(entry.primary);
    setSecondary(entry.secondary);
  }, [entry.key, savedKey, entry.name, entry.aliases, entry.primary, entry.secondary, entry.tags]);

  const dirty =
    name.trim() !== entry.name ||
    aliases !== entry.aliases.join(", ") ||
    tags !== visibleTags(entry.tags) ||
    normalizeHex(primary, entry.primary) !== normalizeHex(entry.primary) ||
    normalizeHex(secondary, entry.secondary) !== normalizeHex(entry.secondary);

  function discard() {
    setName(entry.name);
    setAliases(entry.aliases.join(", "));
    setTags(visibleTags(entry.tags));
    setPrimary(entry.primary);
    setSecondary(entry.secondary);
  }

  return (
    <article className={entry.used ? "logo-row is-used" : "logo-row"}>
      {canEdit ? (
        <button
          type="button"
          className="logo-row-mark"
          title="Crop crest"
          style={{ background: primary }}
          onClick={() => onCrop(entry)}
        >
          <DeskCrest src={entry.url} />
        </button>
      ) : (
        <div className="logo-row-mark is-static" style={{ background: entry.primary }}>
          <DeskCrest src={entry.url} />
        </div>
      )}
      <label>
        School
        {canEdit ? (
          <input value={name} onChange={(event) => setName(event.target.value)} />
        ) : (
          <p className="logo-row-static">{entry.name}</p>
        )}
      </label>
      <label>
        Also known as
        {canEdit ? (
          <input
            value={aliases}
            placeholder="Short names, nicknames"
            onChange={(event) => setAliases(event.target.value)}
          />
        ) : (
          <p className="logo-row-static">{entry.aliases.join(", ") || "—"}</p>
        )}
      </label>
      <label>
        Tags
        {canEdit ? (
          <input value={tags} placeholder="State, Movers" onChange={(event) => setTags(event.target.value)} />
        ) : (
          <p className="logo-row-static">{visibleTags(entry.tags) || "—"}</p>
        )}
      </label>
      <div className="logo-row-tones">
        <ColorField label="Bar" value={primary} canEdit={canEdit} onCommit={setPrimary} />
        <ColorField label="Name" value={secondary} canEdit={canEdit} onCommit={setSecondary} />
      </div>
      <div className="logo-row-side">
        <span>
          {dirty ? "Unsaved" : entry.used ? "On this poster" : entry.source === "library" ? "Library" : "Sample pack"}
        </span>
        {canEdit ? (
          <div className="logo-db-actions">
            <button
              type="button"
              className={dirty ? "ghost-btn logo-row-save" : "ghost-btn"}
              disabled={!dirty}
              onClick={() =>
                onSaveDraft(entry, {
                  name: name.trim() || entry.name,
                  aliases,
                  tags,
                  primary: normalizeHex(primary, entry.primary),
                  secondary: normalizeHex(secondary, entry.secondary),
                })
              }
            >
              Save
            </button>
            <button type="button" className="link-btn" disabled={!dirty} onClick={discard}>
              Discard
            </button>
            <button type="button" className="link-btn" onClick={() => onCrop(entry)}>
              Crop / outline
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={!entry.hasPrevious}
              onClick={() => onUndoCrop(entry)}
            >
              Undo crop
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={!entry.hasOriginal}
              onClick={() => onRevertOriginal(entry)}
            >
              Original
            </button>
            <button type="button" className="link-btn" onClick={() => onReplaceClick(entry)}>
              Replace
            </button>
            {entry.libraryId ? (
              <button type="button" className="link-btn" onClick={() => onDelete(entry)}>
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function LogoDatabase({
  logos,
  teams,
  bars,
  usedNames,
  note,
  shareMode,
  shareNote,
  deskOpen,
  onDeskOpen,
  onDeskClose,
  onUnlock,
  onUpload,
  onSaveDraft,
  onReplace,
  onCrop,
  onUndoCrop,
  onRevertOriginal,
  onDelete,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const pendingReplace = useRef<LogoEntry | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [deskKey, setDeskKeyDraft] = useState("");
  const [cropping, setCropping] = useState<LogoEntry | null>(null);
  const [dropHot, setDropHot] = useState(false);

  const entries = useMemo(() => buildEntries(logos, teams, bars, usedNames), [logos, teams, bars, usedNames]);
  const shown = useMemo(() => filterEntries(entries, query, tag), [entries, query, tag]);
  const tags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => entry.tags.forEach((item) => set.add(item)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entries]);
  const posterCount = entries.filter((entry) => entry.used).length;
  const canEdit = shareMode !== "locked";

  function askDelete(entry: LogoEntry) {
    if (!entry.libraryId) return;
    const ok = window.confirm(
      entry.used
        ? `${entry.name} is on this week's poster. Delete the library crest? The sample mark comes back if one exists.`
        : `Delete ${entry.name} from the library?`,
    );
    if (ok) onDelete(entry);
  }

  const tools = (
    <>
      <p className={`logo-share is-${shareMode}`}>
        {shareMode === "shared"
          ? "Shared with sports business. Leave the page — the crest stays for everyone."
          : shareMode === "locked"
            ? "You can look. Type the sports business key and crop, colors, replace, and upload appear."
            : "Saved on this computer only. This build never received the Supabase keys."}
        {shareNote ? ` ${shareNote}` : ""}
      </p>
      {shareMode === "shared" ? null : (
        <form
          className="logo-key-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (deskKey.trim()) onUnlock(deskKey.trim());
          }}
        >
          <input
            type="password"
            value={deskKey}
            placeholder="Sports business desk key"
            autoComplete="off"
            onChange={(event) => setDeskKeyDraft(event.target.value)}
          />
          <button type="submit" className="ghost-btn">
            Unlock
          </button>
        </form>
      )}
      {canEdit ? (
        <div
          className={dropHot ? "dropzone is-hot" : "dropzone"}
          onDragOver={(event) => {
            event.preventDefault();
            setDropHot(true);
          }}
          onDragLeave={() => setDropHot(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropHot(false);
            if (event.dataTransfer.files.length) onUpload(event.dataTransfer.files);
          }}
        >
          Drop crests here. Change a field, then Save. Original puts the first crest back.
        </div>
      ) : null}
      <div className="row-btns">
        {canEdit ? (
          <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()}>
            Upload logos
          </button>
        ) : null}
        {!deskOpen ? (
          <button type="button" className="ghost-btn" onClick={onDeskOpen}>
            Open full library
          </button>
        ) : null}
      </div>
      <p className="pack-meta">
        {note}
        {posterCount ? ` · ${posterCount} on this poster` : ""}
      </p>
      <div className="logo-db-tools">
        <input
          type="search"
          value={query}
          placeholder="Search school, nickname, or tag…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {tags.length > 0 ? (
          <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter by tag">
            <option value="">All logos</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </>
  );

  const files = (
    <>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        multiple
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        onChange={(event) => {
          if (event.target.files?.length) onUpload(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        className="hidden-file"
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const entry = pendingReplace.current;
          pendingReplace.current = null;
          if (file && entry) onReplace(entry, file);
          event.target.value = "";
        }}
      />
    </>
  );

  const list = (rows: LogoEntry[]) =>
    rows.map((entry) => (
      <LogoRow
        key={entry.key}
        entry={entry}
        canEdit={canEdit}
        onSaveDraft={onSaveDraft}
        onCrop={setCropping}
        onReplaceClick={(item) => {
          pendingReplace.current = item;
          replaceRef.current?.click();
        }}
        onUndoCrop={onUndoCrop}
        onRevertOriginal={onRevertOriginal}
        onDelete={askDelete}
      />
    ));

  const panelRows = shown.slice(0, 8);

  return (
    <div className="logo-db">
      {deskOpen ? null : tools}
      {files}
      {deskOpen ? null : (
        <>
          <div className="logo-row-list">{list(panelRows)}</div>
          {shown.length > panelRows.length ? (
            <button type="button" className="ghost-btn logo-db-more" onClick={onDeskOpen}>
              See all {shown.length} logos
            </button>
          ) : null}
        </>
      )}
      {deskOpen ? (
        <div className="logo-desk" role="dialog" aria-modal="true" aria-label="Logo library">
          <div className="logo-desk-bar">
            <div>
              <h2>Logo library</h2>
              <p>
                {shareMode === "shared"
                  ? "Change a field, then Save. Undo crop steps back one. Original is the first crest."
                  : shareMode === "locked"
                    ? "Type the sports business key to unlock crop, colors, and replace."
                    : "Change a field, then Save. Nothing leaves this computer until you do."}
              </p>
            </div>
            <button type="button" className="ghost-btn" onClick={onDeskClose}>
              Close
            </button>
          </div>
          <div className="logo-desk-body">
            {tools}
            <div className="logo-row-list is-desk">{list(shown)}</div>
          </div>
        </div>
      ) : null}
      {canEdit && cropping ? (
        <CropSafe onClose={() => setCropping(null)}>
          <LogoCropper
            src={cropping.url}
            name={cropping.name}
            onCancel={() => setCropping(null)}
            onApply={(blob) => {
              onCrop(cropping, blob);
              setCropping(null);
            }}
          />
        </CropSafe>
      ) : null}
    </div>
  );
}
